#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kaoqing 归档脚本（后端主动发起，无需前端参与）。

把 kaoqing 本月之前的考勤记录按月归档到 Cloudflare R2（复用 books 同桶、kaoqing-archive/ 前缀），
并对 Waline 中的本月数据进行"清洗"（把 修改/删除 标识回放成正常独立记录）。

==========================================================================
【存储模型】
==========================================================================
前端的每条考勤 = Waline 中一条独立评论，内容为事件：
    {"op":"add"|"edit", "id":<唯一id>, "rec":{...记录字段...}}
    {"op":"del",          "id":<唯一id>}            # 删除标记（追加，不真删旧评论）
匿名无法改/删旧评论，故修改/删除都是"追加一条新事件"；读取端按 id 回放（同 id 取最后），
后端 --cleanup 负责把中间过程物理压实（删除旧评论、把当前状态重发为干净 add 评论）。

兼容旧整包格式：{"v":1,"type":"records","records":[...]}，按 leg_<oid>_<i> 还原为 add 事件。

==========================================================================
【本脚本职责（满足 4 点要求）】
==========================================================================
1. 读取本月以前记录 → 回放清洗成正常独立记录 → 按月写 R2 → 删除 Waline 中这些归档评论
2. 对 Waline 中本月数据也做清洗（回放成正常独立记录并重发干净评论、删旧评论）
3. 即使没有"本月之前"的数据，也照样清洗本月数据
4. 未来日期数据当作本月数据处理（归入 current，不归档、只清洗）

   py -3 kaoqing_archiver.py            # 单次：归档历史 + 清洗当月
   py -3 kaoqing_archiver.py --loop     # 常驻：每 POLL_INTERVAL 秒自检一次
   py -3 kaoqing_archiver.py --dry-run  # 只预览分区/归档计划，不改写 R2/Waline
   py -3 kaoqing_archiver.py --cleanup  # 同单次（保留开关兼容）

配置：poller_config.json（同目录）或环境变量 WALINE_SERVER / WALINE_ADMIN_TOKEN /
      POLL_INTERVAL；R2 凭证复用 ../books/r2_config.json（绝不进前端）。
"""
import os
import sys
import json
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "books"))   # 复用 upload_r2.py（同桶、同 r2_config.json）
import upload_r2   # 提供 load_config() / put_object(cfg, key, data) / list_objects()

ANON_NICK = "考勤系统"
ANON_MAIL = "noreply@waline.snowhoo.net"


def load_cfg():
    cfg = {
        "waline_server": os.environ.get("WALINE_SERVER", "https://waline.snowhoo.net"),
        "waline_admin_token": os.environ.get("WALINE_ADMIN_TOKEN", ""),
        "poll_interval": float(os.environ.get("POLL_INTERVAL", "3600")),
    }
    p = os.path.join(HERE, "poller_config.json")
    if os.path.exists(p):
        try:
            cfg.update(json.load(open(p, encoding="utf-8")))
        except Exception as e:
            print("[WARN] poller_config.json:", e)
    return cfg


CFG = load_cfg()
WALINE_SERVER = (CFG["waline_server"] or "https://waline.snowhoo.net").rstrip("/")
TOKEN = CFG["waline_admin_token"] or ""
RECORDS_PATH = "/kaoqing/records"
HOLIDAY_PATH = "/kaoqing/holidays"
ARCHIVE_PREFIX = "kaoqing-archive/"
R2_CFG = upload_r2.load_config()
R2_PUBLIC = (R2_CFG.get("public_url") or "https://pub-d583e3093dc1438882b43509c1571302.r2.dev").rstrip("/")


# ----------------------------- Waline REST -----------------------------
def waline_req(method, path, *, token=None, params=None, body=None):
    url = WALINE_SERVER + path
    q = []
    if params:
        for k, v in params.items():
            q.append("%s=%s" % (k, urllib.parse.quote(str(v), safe="")))
    if token:
        q.append("token=" + urllib.parse.quote(token, safe=""))
    if q:
        url += "?" + "&".join(q)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def list_comments(path):
    """列出某 path 下全部 Waline 评论（翻完所有分页）。"""
    all_c = []
    page = 1
    while True:
        resp = waline_req("GET", "/api/comment",
                          params={"path": path, "page": page, "pageSize": 100}, token=TOKEN)
        d = resp.get("data") or {}
        arr = d.get("data") or []
        if not arr:
            break
        all_c.extend(arr)
        total = d.get("total") or 0
        if total and len(all_c) >= total:
            break
        if len(arr) < 100:
            break
        page += 1
    return all_c


# ----------------------------- 事件回放（核心） -----------------------------
def parse_comment(rec):
    """单条 Waline 评论 -> 事件列表 [(op, id, rec)]。兼容旧整包格式。"""
    oid = int(rec.get("objectId") or 0)
    raw = rec.get("orig") or rec.get("comment") or ""
    try:
        o = json.loads(raw)
    except Exception:
        return []
    if not isinstance(o, dict):
        return []
    op = o.get("op")
    if op in ("add", "edit", "del"):
        rid = o.get("id")
        rec_body = None if op == "del" else o.get("rec")
        return [(op, rid, rec_body)]
    if o.get("type") == "records" and isinstance(o.get("records"), list):
        evs = []
        for i, r in enumerate(o["records"]):
            evs.append(("add", "leg_%s_%d" % (oid, i), r))
        return evs
    return []


def replay_events(events):
    """按 id 回放：同 id 取最后一条事件。返回最终记录 dict 列表（每条含 id）。"""
    state = {}
    for op, rid, rec in events:
        if not rid:
            continue
        if op == "del":
            state[rid] = None
        else:
            r = dict(rec) if isinstance(rec, dict) else {}
            r["id"] = rid
            state[rid] = r
    return [v for v in state.values() if v is not None]


def month_of(rec):
    d = (rec.get("date") or "")[:7]
    return d if len(d) == 7 and d[4] == "-" else ""


def post_record_anon(rec):
    """以匿名身份把一条"干净"记录作为 add 事件 POST 到 Waline（与前端一致）。"""
    obj = {"op": "add", "id": rec.get("id"), "rec": rec}
    payload = {"comment": json.dumps(obj, ensure_ascii=False),
               "url": RECORDS_PATH, "nick": ANON_NICK, "mail": ANON_MAIL, "link": "", "ua": "kaoqing-archiver"}
    try:
        waline_req("POST", "/api/comment", body=payload)
        return True
    except Exception as e:
        print("[WARN] 重发记录失败:", e)
        return False


# ----------------------------- 清理重复评论（节假日整包格式用） -----------------------------
def purge_orphans(path):
    arr = list_comments(path)
    valid = []
    for rec in arr:
        oid = int(rec.get("objectId") or 0)
        try:
            o = json.loads(rec.get("orig") or rec.get("comment") or "")
        except Exception:
            o = None
        if o and o.get("type") == "records":
            valid.append((oid, o))
    if len(valid) <= 1:
        return 0
    valid.sort(key=lambda x: x[0])
    keep_oid = valid[-1][0]
    removed = 0
    for oid, _ in valid:
        if oid == keep_oid:
            continue
        try:
            waline_req("DELETE", "/api/comment/%s" % oid, token=TOKEN)
            removed += 1
        except Exception as e:
            print("[WARN] 删除 %s 评论 #%d 失败: %s" % (path, oid, e))
    print("[OK] %s 清理 %d 条旧评论（保留 #%d）" % (path, removed, keep_oid))
    return removed


# ----------------------------- R2 -----------------------------
def put_r2(key, obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    upload_r2.put_object(R2_CFG, key, data)


def build_index():
    existing = upload_r2.list_objects(R2_CFG, prefix=ARCHIVE_PREFIX)
    months = {}
    for key in existing:
        if key == ARCHIVE_PREFIX + "index.json":
            continue
        if not key.endswith(".json"):
            continue
        ym = key[len(ARCHIVE_PREFIX):-len(".json")]
        if len(ym) == 7 and ym[4] == "-":
            months[ym] = 0
    for ym in list(months.keys()):
        try:
            with urllib.request.urlopen(R2_PUBLIC + "/" + ARCHIVE_PREFIX + ym + ".json", timeout=20) as r:
                d = json.loads(r.read().decode("utf-8"))
            months[ym] = len(d.get("records") or [])
        except Exception:
            months[ym] = 0
    put_r2(ARCHIVE_PREFIX + "index.json", {"months": sorted(months.keys()), "count": months})
    return months


# ----------------------------- 主动归档 + 清洗 -----------------------------
def archive_once(dry_run=False):
    """读 Waline → 回放 → 历史(本月之前)按月写R2并删Waline评论 → 本月(含未来)数据清洗(压实)。
    返回归档条数（无历史则 0，但仍清洗当月）。"""
    cutoff_ym = datetime.date.today().replace(day=1).strftime("%Y-%m")
    all_c = list_comments(RECORDS_PATH)
    events = []
    for c in all_c:
        events.extend(parse_comment(c))
    final = replay_events(events)

    # 分区：< 本月 = 历史（归档）；>= 本月（含未来）或 无日期 = 当月（清洗保留）
    history_by_month = {}
    current = []
    for r in final:
        ym = month_of(r)
        if ym and ym < cutoff_ym:
            history_by_month.setdefault(ym, []).append(r)
        else:
            current.append(r)
    total_hist = sum(len(v) for v in history_by_month.values())

    print("[INFO] 回放得 %d 条最终记录；本月之前(<%s) %d 条/%d 个月；当月(含未来) %d 条"
          % (len(final), cutoff_ym, total_hist, len(history_by_month), len(current)))
    if dry_run:
        print("[DRY-RUN] 未写 R2、未改动 Waline。")
        return total_hist

    # 1) 历史写 R2
    months = []
    if history_by_month:
        for ym in sorted(history_by_month.keys()):
            put_r2(ARCHIVE_PREFIX + ym + ".json",
                   {"month": ym, "count": len(history_by_month[ym]), "records": history_by_month[ym]})
            months.append(ym)
            print("[PUT] R2 %s.json (%d 条)" % (ym, len(history_by_month[ym])))

    # 2) 清洗当月：先把当前记录作为干净 add 评论重发，全部成功后再删除旧评论
    posts_ok = True
    for r in current:
        if not post_record_anon(r):
            posts_ok = False
            print("[ERR] 当月记录重发失败，放弃删除旧评论以避免数据丢失")
            break
    if posts_ok:
        removed = 0
        for c in all_c:
            oid = int(c.get("objectId") or 0)
            try:
                waline_req("DELETE", "/api/comment/%s" % oid, token=TOKEN)
                removed += 1
            except Exception as e:
                print("[WARN] 删除评论 #%d 失败: %s" % (oid, e))
        print("[OK] 清洗当月：重发 %d 条干净评论，删除旧评论 %d 条" % (len(current), removed))

    # 3) 重建 index
    build_index()
    print("[OK] 归档 %d 条(%s)；当月清洗 %d 条。" % (total_hist, ",".join(months), len(current)))
    return total_hist


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true", help="常驻自检（间隔 POLL_INTERVAL 秒）")
    ap.add_argument("--cleanup", action="store_true", help="归档+清洗（默认行为，保留此开关兼容）")
    ap.add_argument("--dry-run", action="store_true", help="只预览分区/归档计划，不改写 R2 或 Waline")
    args = ap.parse_args()
    if not WALINE_SERVER or not TOKEN:
        print("[ERR] 缺少 waline_server / waline_admin_token（环境变量或 poller_config.json）。")
        sys.exit(2)
    miss = [k for k in ("account_id", "access_key", "secret_key", "bucket") if not R2_CFG.get(k)]
    if miss and not args.dry_run:
        print("[ERR] 缺少 R2 配置: %s（请配 ../books/r2_config.json 或环境变量 R2_*）" % ",".join(miss))
        sys.exit(2)
    if args.dry_run:
        print("[archiver] DRY-RUN waline=%s" % WALINE_SERVER)
        archive_once(dry_run=True)
        return
    print("[archiver] 启动 waline=%s 模式=%s" % (WALINE_SERVER, "loop" if args.loop else "once"))
    while True:
        n = archive_once(dry_run=False)
        if n:
            print("[archiver] 本轮归档 %d 条" % n)
        # 节假日仍为整包格式，仅清理重复评论
        purge_orphans(HOLIDAY_PATH)
        if not args.loop:
            break
        time.sleep(CFG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[archiver] 已停止")
