#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kaoqing 归档脚本（后端主动发起，无需前端参与）。

把 kaoqing 本月之前的考勤记录按月归档到 Cloudflare R2（复用 books 同桶、kaoqing-archive/ 前缀），
并对 Waline 中的本月数据进行"清洗"（把 修改/删除 标识回放成正常独立记录）。

==========================================================================
【存储模型】
==========================================================================
前端的每条考勤 = Waline 中一条独立评论（带管理员令牌写入，即 approved）：
    {"op":"add",  "id":<唯一id>, "rec":{...记录字段...}}   # 新建（POST）
    {"op":"edit", "id":<唯一id>, "rec":{...记录字段...}}   # 修改：PUT 覆盖原评论（原地，单条）
    {"op":"del",  "id":<唯一id>}                            # 删除：DELETE 原评论（硬删）
旧模型（匿名事件流）遗留的「同一 id 多条 add/edit/del 评论」仍会被回放兼容；后端 --cleanup
仅做去重清洗：删除同一 id 的多余旧评论（保留最新一条）及被 del 标记而物理仍在的评论，不再复写。

兼容旧整包格式：{"v":1,"type":"records","records":[...]}，按 leg_<oid>_<i> 还原为 add 事件。

==========================================================================
【本脚本职责（满足 4 点要求）】
==========================================================================
1. 读取本月以前记录 → 回放清洗成正常独立记录 → 按月写 R2 → 删除 Waline 中这些归档评论
2. 对 Waline 中本月数据也做清洗（去重：同 id 多余旧评论删冗余、被 del 标记的评论物理删除，不再复写）
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
import re
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "books"))   # 复用 upload_r2.py（同桶、同 r2_config.json）
import upload_r2   # 提供 load_config() / put_object(cfg, key, data) / list_objects()



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


def _same_url(field, path):
    """评论自带的 url 字段是否等于目标 path（兼容 URL 编码差异）。"""
    if field is None:
        return False
    a = str(field)
    if a == path:
        return True
    try:
        return urllib.parse.unquote(a) == urllib.parse.unquote(path)
    except Exception:
        return False


def list_comments(path):
    """列出某 path 下全部 Waline 评论（含 approved/waiting/spam，翻完所有分页）。

    ⚠️⚠️ 关键安全点（实测确认）：Waline 的 `type=list` 接口**忽略 url 参数** —— 即便带上
    url=/kaoqing/xxx，它仍返回「整个实例」的所有评论（含 /app_n/*、/app-game/*、books.html
    等其它项目）。因此绝不能靠接口参数来限定 path，必须在 Python 端按每条评论自身的 url 字段
    精确过滤，否则会把别人项目的评论当成当前 path 的数据来处理甚至删除（2026-09-05 事故教训）。

    读取仍用管理员列表接口 + Bearer 管理员令牌：匿名写入可能被 Akismet 误判 spam，
    公开接口(GET ?path=)会过滤 spam；本函数读全部状态，保证被标 spam 的评论也能被回放/清理。"""
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
    # 按评论自身的 url 精确过滤（type=list 不按 url 过滤，只翻页不筛）
    matched = [c for c in all_c if _same_url(c.get("url"), path)]
    if len(matched) != len(all_c):
        print("[INFO] %s: 接口返回全实例 %d 条 → 按 url 精确过滤后本 path 命中 %d 条" % (path, len(all_c), len(matched)))
    return matched


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




# ----------------------------- 清理重复评论（节假日整包格式用） -----------------------------
def robust_parse_comment(raw):
    """与前端 robustParse 一致：Waline 常把 comment 包成 <p>…</p>、并把引号转成弯引号，
    直接 json.loads 会失败 → 先去标签、弯引号转直引号、截取首尾大括号再解析。"""
    if not raw:
        return None
    s = re.sub(r"<[^>]*>", "", str(raw))
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("&quot;", '"').replace("&amp;", "&")
    st = s.find("{")
    en = s.rfind("}")
    if st < 0 or en <= st:
        return None
    try:
        return json.loads(s[st:en + 1])
    except Exception:
        return None


def purge_orphans(path, type_name, dry_run=False):
    """清理某 path 下「整包格式」记录的重复评论，只保留最新（最大 oid）一条。

    用途：节假日(/kaoqing/holidays, type='holiday') 等整包数据此前用匿名 POST 每次同步都
    追加一条新评论 → 重复堆积。现前端已改为带管理员令牌原地 PUT 复写（只留 1 条），
    本函数负责清理历史遗留的重复项。

    安全铁律（2026-09-05 事故教训，任何删除动作都必须遵守）：
      1. 只处理 /kaoqing/* 路径，其它项目的评论绝不动；
      2. 只删「按 url 精确过滤后 且 type 精确匹配」的精确 oid；
         绝不反向过滤（不允许"删除不匹配 X 的其余全部"）；
      3. dry_run=True 时只打印计划，绝不执行删除。"""
    if not str(path).startswith("/kaoqing/"):
        print("[SKIP] 拒绝清理非 kaoqing 路径: %s" % path)
        return 0
    arr = list_comments(path)
    valid = []
    for rec in arr:
        oid = int(rec.get("objectId") or 0)
        o = robust_parse_comment(rec.get("orig") or rec.get("comment") or "")
        if o and o.get("type") == type_name:
            valid.append((oid, o))
    if len(valid) <= 1:
        print("[OK] %s 无需清理（url 命中 %d 条，其中 type=%s 的 %d 条）" % (path, len(arr), type_name, len(valid)))
        return 0
    valid.sort(key=lambda x: x[0])
    keep_oid = valid[-1][0]
    drop = [oid for oid, _ in valid if oid != keep_oid]
    print("[%s] %s: type=%s 命中 %d 条 → 保留 #%d，待删 %s" %
          ("DRY-RUN" if dry_run else "PLAN", path, type_name, len(valid), keep_oid, drop))
    if dry_run:
        return 0
    removed = 0
    for oid in drop:
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
    """读 Waline → 回放 → 仅把「日期<本月 且 状态=='完成'」的记录按月写R2并从 Waline 删除；
    其余（本月/未来、或历史但未完成）留在 Waline，仅做「去重清洗」：删除同一 id 的多余旧评论
    （保留最新一条）以及被 del 事件标记而物理仍在的评论。新模型下记录已是单条最终态，不再复写
    （避免把管理员 approved 记录匿名化/被判 spam）。返回归档条数（无符合归档条件则 0，但仍清洗）。"""
    cutoff_ym = datetime.date.today().replace(day=1).strftime("%Y-%m")
    all_c = list_comments(RECORDS_PATH)
    events = []
    id_to_oids = {}      # 记录 id -> 该 id 在 Waline 中对应的全部 objectId（用于去重/删除）
    for c in all_c:
        oid = int(c.get("objectId") or 0)
        for op, rid, rec in parse_comment(c):
            events.append((oid, op, rid, rec))
            if rid:
                id_to_oids.setdefault(rid, set()).add(oid)
    final = replay_events(events)
    final_ids = {r.get("id") for r in final}

    # 分区：
    #   - 历史归档 = 日期 < 本月 且 状态=='完成'  → 写 R2 并从 Waline 删除（避免重复归档）
    #   - 保留(不归档) = 其余（本月/未来、或历史但状态未完成的）→ 留在 Waline，仅做去重清洗
    history_by_month = {}
    current = []
    for r in final:
        ym = month_of(r)
        if ym and ym < cutoff_ym and (r.get('status') or '待提交') == '完成':
            history_by_month.setdefault(ym, []).append(r)
        else:
            current.append(r)
    total_hist = sum(len(v) for v in history_by_month.values())
    hist_ids = set()
    for v in history_by_month.values():
        for r in v:
            hist_ids.add(r.get("id"))

    print("[INFO] 回放得 %d 条最终记录；本月之前(<%s) %d 条/%d 个月；当月(含未来) %d 条"
          % (len(final), cutoff_ym, total_hist, len(history_by_month), len(current)))

    # 计算需删除的 oid（历史已归档的全部删；当月同 id 多条留最新删冗余；被 del 标记全删）
    def plan_deletions():
        todo = set()
        for rid, oids in id_to_oids.items():
            if rid in hist_ids:
                todo |= oids                                  # 已进 R2，Waline 中全部删除
            elif rid in final_ids:
                if len(oids) > 1:                             # 单 id 多条残留：保留最新，删其余
                    todo |= (oids - {max(oids)})
            else:
                todo |= oids                                  # 被 del 事件标记：物理删除全部
        return todo

    if dry_run:
        todo = plan_deletions()
        dup = sum(1 for rid, oids in id_to_oids.items()
                  if rid in final_ids and len(oids) > 1)
        del_marked = sum(1 for rid in id_to_oids if rid not in final_ids)
        print("[DRY-RUN] 未写 R2、未改动 Waline。")
        print("[DRY-RUN] 计划删除 Waline 评论 %d 条：历史已归档 %d 条全删 / 当月同 id 多余旧评论 %d 条删冗余 / 被删标记 %d 条全删"
              % (len(todo), len(hist_ids), dup, del_marked))
        return total_hist

    # 1) 历史写 R2：已存在同月主文件则另存「后补」文件（<ym>-NN.json），原主文件不变
    r2_keys = upload_r2.list_objects(R2_CFG, prefix=ARCHIVE_PREFIX)
    written_keys = []
    months = []
    for ym in sorted(history_by_month.keys()):
        key = determine_archive_key(r2_keys, ym)
        is_sup = key != (ARCHIVE_PREFIX + ym + ".json")
        put_r2(key, {"month": ym, "count": len(history_by_month[ym]),
                     "records": history_by_month[ym], "supplement": is_sup})
        written_keys.append(key)
        months.append(ym)
        print("[PUT] R2 %s (%s, %d 条)" % (key, "后补" if is_sup else "主", len(history_by_month[ym])))

    # 2) 删除 Waline 评论（按 plan_deletions；全在 /kaoqing/records 内，精确 oid 删除）
    todo = plan_deletions()
    removed = 0
    for oid in sorted(todo):
        try:
            waline_req("DELETE", "/api/comment/%s" % oid, token=TOKEN)
            removed += 1
        except Exception as e:
            print("[WARN] 删除评论 #%d 失败: %s" % (oid, e))
    dup = sum(1 for rid, oids in id_to_oids.items() if rid in final_ids and len(oids) > 1)
    del_marked = sum(1 for rid in id_to_oids if rid not in final_ids)
    print("[OK] 删除 Waline 评论 %d 条（历史已归档 %d / 当月冗余 %d / 被删标记 %d）；干净单条记录保留不动"
          % (removed, len(hist_ids), dup, del_marked))

    # 3) 单据流水号配置现由前端在新建/删除记录时实时写入（带管理员令牌），后端不再维护

    # 4) 重建 index（把本次新写的补充文件也纳入）
    build_index(set(r2_keys) | set(written_keys))
    print("[OK] 归档 %d 条(%s)；删除 Waline 评论 %d 条。" % (total_hist, ",".join(months), removed))
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
        purge_orphans(HOLIDAY_PATH, "holiday", dry_run=True)
        return
    print("[archiver] 启动 waline=%s 模式=%s" % (WALINE_SERVER, "loop" if args.loop else "once"))
    while True:
        n = archive_once(dry_run=False)
        if n:
            print("[archiver] 本轮归档 %d 条" % n)
        # 节假日仍为整包格式，仅清理重复评论（type='holiday'；只保留最新一条）
        purge_orphans(HOLIDAY_PATH, "holiday", dry_run=False)
        if not args.loop:
            break
        time.sleep(CFG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[archiver] 已停止")
