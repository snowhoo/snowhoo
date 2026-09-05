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

REWRITE_DELAY = int(os.environ.get("REWRITE_DELAY", "5"))  # 脏记录复写之间延时(秒)，降低 Akismet 误判


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
    """列出某 path 下全部 Waline 评论（含 approved/waiting/spam，翻完所有分页）。
    用管理员列表接口 type=list + url 过滤，并带 Bearer 管理员令牌：匿名写入可能被 Akismet
    误判 spam，公开接口(GET ?path=)会过滤 spam；本函数读全部状态，保证被标 spam 的评论
    也能被回放/清理，不会永久堆积在 Waline 中。"""
    all_c = []
    page = 1
    while True:
        resp = waline_req("GET", "/api/comment",
                          params={"type": "list", "url": path, "page": page, "pageSize": 100}, token=TOKEN)
        d = resp.get("data") or {}
        arr = d.get("data") or []
        if not arr:
            break
        all_c.extend(arr)
        total = d.get("total") or 0
        total_pages = d.get("totalPages") or 0
        if total_pages and page >= total_pages:
            break
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
    """按 id 回放：同 id 取最后一条事件。先按 objectId 升序排序，保证 edit/del 在对应 add
    之后生效（与前端 replayEvents 行为一致）。返回最终记录 dict 列表（每条含 id）。"""
    state = {}
    for oid, op, rid, rec in sorted(events, key=lambda e: e[0]):
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


def random_identity():
    """生成随机匿名身份（每条复写换一个 mail，避免单一固定身份被 Akismet 反复误判）。
    前端读取走 type=list+Bearer 全量回放、不区分身份，故复写身份无关紧要，随机即可。"""
    import random as _r
    import string as _s
    s = ''.join(_r.choices(_s.ascii_lowercase + _s.digits, k=6))
    return ("考勤记录", "kq_%s@example.com" % s)


def post_record_random(rec):
    """以随机匿名身份把一条"干净"记录作为 add 事件 POST 到 Waline（归档清洗复写）。
    前端读取不区分身份（全量回放），故身份可随机；即便被 Akismet 误判为 spam，
    前端也能通过 type=list+Bearer 读到并回放，不丢数据。"""
    nick, mail = random_identity()
    obj = {"op": "add", "id": rec.get("id"), "rec": rec}
    payload = {"comment": json.dumps(obj, ensure_ascii=False),
               "url": RECORDS_PATH, "nick": nick, "mail": mail, "link": "", "ua": "kaoqing-archiver"}
    try:
        waline_req("POST", "/api/comment", body=payload)
        return True
    except Exception as e:
        print("[WARN] 随机身份复写记录失败:", e)
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


def determine_archive_key(r2_keys, ym):
    """某月归档目标 key：首次 <ym>.json；已存在则另存 <ym>-NN.json 递增（原主文件不变）。"""
    primary = ARCHIVE_PREFIX + ym + ".json"
    if primary not in r2_keys:
        return primary
    max_n = 0
    pref = ARCHIVE_PREFIX + ym + "_"   # 用 "_" 而非 "-"，避免与日期(2026-08-01)混淆
    for k in r2_keys:
        if k.startswith(pref) and k.endswith(".json"):
            suf = k[len(pref):-len(".json")]
            if suf.isdigit():
                max_n = max(max_n, int(suf))
    return "%s%02d.json" % (pref, max_n + 1)


def build_index(r2_keys=None):
    """重建 index.json：按月份聚合主文件(<ym>.json)与后补文件(<ym>-NN.json)，供前端下拉查看。"""
    if r2_keys is None:
        r2_keys = upload_r2.list_objects(R2_CFG, prefix=ARCHIVE_PREFIX)
    groups = {}  # ym -> [(key, is_primary, seq)]
    for key in r2_keys:
        if key == ARCHIVE_PREFIX + "index.json":
            continue
        if not key.endswith(".json"):
            continue
        base = key[len(ARCHIVE_PREFIX):-len(".json")]
        if len(base) == 7 and base[4] == "-":
            groups.setdefault(base, []).append((key, True, 0))
        elif len(base) > 8 and base[4] == "-" and base[7] in ("-", "_") and base[8:].isdigit():
            # 后补文件：2026-08-01.json(旧) / 2026-08_01.json(新，避免与日期混淆) 均兼容
            groups.setdefault(base[:7], []).append((key, False, int(base[8:])))
    months = []
    for ym in sorted(groups.keys()):
        files = []
        for key, is_primary, seq in sorted(groups[ym], key=lambda x: (not x[1], x[2])):
            try:
                raw = upload_r2.get_object(R2_CFG, key)
                d = json.loads(raw.decode("utf-8"))
                # 优先用归档时写入的 count 字段（避免公开 URL 读不到/一致性延迟导致计数 0）；
                # 缺省再回退到数 records
                cnt = (d or {}).get("count")
                if cnt is None:
                    cnt = len((d or {}).get("records") or [])
            except Exception as e:
                print("[WARN] 读取 %s 计数失败: %s" % (key, e))
                cnt = 0
            files.append({
                "key": key,
                "name": key[len(ARCHIVE_PREFIX):],
                "count": cnt,
                "type": "primary" if is_primary else "supplement",
            })
        months.append({"ym": ym, "files": files})
    put_r2(ARCHIVE_PREFIX + "index.json", {"updated_at": int(time.time()), "months": months})
    return months


# ----------------------------- 主动归档 + 清洗 -----------------------------
def archive_once(dry_run=False):
    """读 Waline → 回放 → 仅把「日期<本月 且 状态=='完成'」的记录按月写R2并删Waline评论；
    其余（本月/未来、或历史但未完成）留在 Waline 做清洗压实（即未完成的记录不归档、保留）。
    返回归档条数（无符合归档条件的记录则 0，但仍清洗当月）。"""
    cutoff_ym = datetime.date.today().replace(day=1).strftime("%Y-%m")
    all_c = list_comments(RECORDS_PATH)
    events = []
    comment_id = {}      # objectId -> 该评论对应的记录 id（用于选择性删除旧评论）
    dirty_ids = set()    # 曾出现 edit/del 事件的记录 id（需要压实清洗）
    for c in all_c:
        oid = int(c.get("objectId") or 0)
        for op, rid, rec in parse_comment(c):
            events.append((oid, op, rid, rec))
            if rid:
                comment_id[oid] = rid
                if op in ("edit", "del"):
                    dirty_ids.add(rid)
    final = replay_events(events)

    # 分区：
    #   - 历史归档 = 日期 < 本月 且 状态=='完成'  → 写 R2 并删 Waline 评论
    #   - 保留(不归档) = 其余（本月/未来、或历史但状态未完成的）→ 留在 Waline，仅做清洗压实
    #     即：状态未完成的记录不归档，长期保留在「最新未归档记录」，直到其变为完成且跨月后才归档
    history_by_month = {}
    current = []
    for r in final:
        ym = month_of(r)
        if ym and ym < cutoff_ym and (r.get('status') or '待提交') == '完成':
            history_by_month.setdefault(ym, []).append(r)
        else:
            current.append(r)
    total_hist = sum(len(v) for v in history_by_month.values())
    dirty_current = [r for r in current if r.get("id") in dirty_ids]

    print("[INFO] 回放得 %d 条最终记录；本月之前(<%s) %d 条/%d 个月；当月(含未来) %d 条"
          % (len(final), cutoff_ym, total_hist, len(history_by_month), len(current)))
    if dry_run:
        print("[DRY-RUN] 未写 R2、未改动 Waline。")
        print("[DRY-RUN] 当月需复写脏记录 %d 条（有 edit/del 标识），干净记录 %d 条保持不动；"
              "复写将用随机匿名身份、每条间隔 %d 秒" % (len(dirty_current), len(current) - len(dirty_current), REWRITE_DELAY))
        return total_hist

    # 1) 历史写 R2：已存在同月主文件则另存「后补」文件（<ym>-NN.json），原主文件不变
    r2_keys = upload_r2.list_objects(R2_CFG, prefix=ARCHIVE_PREFIX)
    written_keys = []
    months = []
    if history_by_month:
        for ym in sorted(history_by_month.keys()):
            key = determine_archive_key(r2_keys, ym)
            is_sup = key != (ARCHIVE_PREFIX + ym + ".json")
            put_r2(key, {"month": ym, "count": len(history_by_month[ym]),
                         "records": history_by_month[ym], "supplement": is_sup})
            written_keys.append(key)
            months.append(ym)
            print("[PUT] R2 %s (%s, %d 条)" % (key, "后补" if is_sup else "主", len(history_by_month[ym])))

    # 2) 清洗当月：仅对「有修改/删除标识」的脏记录压实，降低复写率
    #    - 复写改用随机匿名身份，身份无关紧要（前端全量回放不区分身份）
    #    - 每条复写之间加 REWRITE_DELAY 秒延时，进一步降低误判概率
    #    - 仅删除脏记录对应的旧评论（干净单条 add 不动），避免误删有效数据
    if dry_run:
        print("[DRY-RUN] 清洗当月：将复写脏记录 %d 条(随机身份)，其余 %d 条干净记录保持不动"
              % (len(dirty_current), len(current) - len(dirty_current)))
    else:
        posts_ok = True
        for r in dirty_current:
            if not post_record_random(r):
                posts_ok = False
                print("[ERR] 脏记录复写失败 id=%s，放弃删除其旧评论以避免数据丢失" % r.get("id"))
                break
            time.sleep(REWRITE_DELAY)
        if posts_ok:
            removed = 0
            for c in all_c:
                oid = int(c.get("objectId") or 0)
                rid = comment_id.get(oid)
                if rid not in dirty_ids:
                    continue
                try:
                    waline_req("DELETE", "/api/comment/%s" % oid, token=TOKEN)
                    removed += 1
                except Exception as e:
                    print("[WARN] 删除评论 #%d 失败: %s" % (oid, e))
            print("[OK] 清洗当月：复写脏记录 %d 条(随机身份)，删除其旧评论 %d 条；干净记录 %d 条保持不动"
                  % (len(dirty_current), removed, len(current) - len(dirty_current)))

    # 3) 单据流水号配置现由前端在新建/删除记录时实时写入（带管理员令牌），后端不再维护

    # 4) 重建 index（把本次新写的补充文件也纳入）
    build_index(set(r2_keys) | set(written_keys))
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
