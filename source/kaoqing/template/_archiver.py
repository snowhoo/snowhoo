#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kaoqing 归档脚本（后端主动发起，无需前端参与）。

把 kaoqing 中「状态==完成」的考勤记录按月归档到 Cloudflare R2（复用 books 同桶、kaoqing-archive/ 前缀；含当月，不再排除本月之前），
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
1. 读取「完成」状态记录 → 回放清洗成正常独立记录 → 按月写 R2 → 删除 Waline 中这些归档评论
2. 对 Waline 中本月数据也做清洗（去重：同 id 多余旧评论删冗余、被 del 标记的评论物理删除，不再复写）
3. 即使没有"本月之前"的数据，也照样清洗本月数据
4. 未来日期数据当作本月数据处理（归入 current，不归档、只清洗）

   py -3 kaoqing_archiver.py            # 单次：归档历史 + 清洗当月
   py -3 kaoqing_archiver.py --loop     # 常驻：每 POLL_INTERVAL 秒自检一次
   py -3 kaoqing_archiver.py --dry-run  # 只预览分区/归档计划，不改写 R2/Waline
   py -3 kaoqing_archiver.py --cleanup  # 同单次（保留开关兼容）

配置：waline 令牌内置同 kaoqing.html 混淆（环境变量 WALINE_ADMIN_TOKEN 可覆盖）；
      WALINE_SERVER / POLL_INTERVAL 走环境变量；R2 凭证复用 D:/hexo/hexo-bot/books/r2_config.json（绝不进前端）。
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
# 复用 books 下的 upload_r2.py（R2 上传模块 + 凭证，多个 bot 共用，凭证不进前端）。
# 本脚本已移至 source/kaoqing/template，故直接指向绝对路径，不再依赖 ../books。
sys.path.insert(0, r"D:\hexo\hexo-bot\books")
import upload_r2   # 提供 load_config() / put_object(cfg, key, data) / list_objects()



# waline 管理员令牌：与 kaoqing.html 同款混淆（反转 + 异或固定密钥 + base64），避免明文被随手抓取。
# 环境变量 WALINE_ADMIN_TOKEN 可覆盖；不再依赖同目录 poller_config.json（原 kaoqing 目录已废弃）。
TK_SEED = '8kQ~zL#'
TK_OBF  = 'CA4WRzEWZlo5Og8xCkpdHgZHLhh8Xg8CGhgdYggKIkgeKFVUPT0VDn0ObkUAM1R1aVElYDcAGWpyAh4XGQtBUCEoGw=='


def _tk_deobf():
    import base64
    b = base64.b64decode(TK_OBF)
    s = ''.join(chr(b[i] ^ ord(TK_SEED[i % len(TK_SEED)])) for i in range(len(b)))
    return s[::-1]


def load_cfg():
    cfg = {
        "waline_server": os.environ.get("WALINE_SERVER", "https://waline.snowhoo.net"),
        "waline_admin_token": os.environ.get("WALINE_ADMIN_TOKEN", _tk_deobf()),
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

# 归档后用于原地复写评论的展示 nick/mail（与前端 ANON_NICK/ANON_MAIL 一致，仅元数据，请求带 Bearer）
ARCH_NICK = '考勤记录'
ARCH_MAIL = 'kaoqin@example.com'


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


def list_all_comments():
    """拉取 Waline 整个实例的全部评论（type=list 忽略 url，本就返回全实例），翻完所有分页。"""
    all_c = []
    page = 1
    while True:
        resp = waline_req("GET", "/api/comment",
                          params={"type": "list", "page": page, "pageSize": 100}, token=TOKEN)
        d = resp.get("data") or {}
        arr = d.get("data") or []
        if not arr:
            break
        all_c.extend(arr)
        total_pages = d.get("totalPages") or 0
        if total_pages and page >= total_pages:
            break
        if len(arr) < 100:
            break
        page += 1
    return all_c


def list_comments(path):
    """列出某 path 下评论（按评论自身 url 精确过滤，type=list 不按 url 过滤）。"""
    all_c = list_all_comments()
    matched = [c for c in all_c if _same_url(c.get("url"), path)]
    if len(matched) != len(all_c):
        print("[INFO] %s: 全实例 %d 条 → 按 url 过滤后命中 %d 条" % (path, len(all_c), len(matched)))
    return matched


def list_all_records():
    """列出所有状态的考勤记录评论（url 以 /kaoqing/records/ 开头）。
    记录现已按状态分路径存储，故一次拉全实例后按前缀过滤即可拿到全部状态的记录。"""
    all_c = list_all_comments()
    matched = [c for c in all_c if (c.get("url") or "") == RECORDS_PATH or (c.get("url") or "").startswith(RECORDS_PATH + "/")]
    print("[INFO] 全实例 %d 条 → 考勤记录(各状态)命中 %d 条" % (len(all_c), len(matched)))
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
def mark_archived(rid, oid, rec):
    """把某条记录标记为「已归档」：在 /kaoqing/records/已归档 路径新建一条(status=已归档)，
    再删除原路径上的旧评论（强制移动到状态对应路径，不依赖 Waline PUT 是否支持改 url）。
    **不删除数据**，记录留 Waline 供管理员「恢复/删除」兜底，避免「归档失败又被删」的数据丢失。"""
    rec2 = dict(rec)
    rec2['status'] = '已归档'
    body = {
        "comment": json.dumps({"op": "edit", "id": rid, "rec": rec2}, ensure_ascii=False),
        "url": RECORDS_PATH + "/已归档",
        "nick": ARCH_NICK,
        "mail": ARCH_MAIL,
        "link": "",
        "ua": "kaoqing-archiver",
    }
    # 1) 在「已归档」路径新建
    j = waline_req("POST", "/api/comment", token=TOKEN, body=body)
    new_oid = int(((j.get("data") or {}).get("objectId") or 0))
    # 2) 删除原路径旧评论（强制路径切换；replay 按 id 去重，新建同 id 高 oid 覆盖旧的，无重复）
    if new_oid and new_oid != oid:
        try:
            waline_req("DELETE", "/api/comment/%d" % oid, token=TOKEN, params={"lang": "zh-CN"})
        except Exception as e:
            print("[WARN] 标记已归档：删除原评论 #%d 失败: %s" % (oid, e))


def archive_once(dry_run=False):
    """读 Waline → 回放 → 把所有「状态=='完成'」的记录（含当月、历史、未来）按月写 R2，
    并在「写 R2 成功」后才把 Waline 中对应评论原地标记为 status='已归档'（**不再真正删除**，兜底归档失败的数据丢失）；
    其余（状态非「完成」）留在 Waline，仅做「去重清洗」。
    兜底逻辑：R2 写失败的月份，其记录保留原状(status=完成)不参与标记，下次重试即可；
    只有成功写 R2 的记录才标记已归档。返回实际标记「已归档」的条数（无则 0，但仍清洗）。
    注：是否归档由「状态==完成」决定，不再按月份排除；具体何时运行由人工控制。"""
    all_c = list_all_records()   # 记录已按状态分路径存储：一次拉全实例，按 url 前缀过滤出所有状态
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
    #   - 归档 = 状态=='完成'（不论月份，含当月/历史/未来）→ 写 R2 并标记「已归档」（不删除，兜底）
    #   - 保留(不归档) = 状态非「完成」（如待审核/待提交）→ 留在 Waline，仅做去重清洗
    history_by_month = {}
    current = []
    for r in final:
        ym = month_of(r)
        if ym and (r.get('status') or '待提交') == '完成':
            history_by_month.setdefault(ym, []).append(r)
        else:
            current.append(r)
    total_hist = sum(len(v) for v in history_by_month.values())
    hist_ids = set()
    for v in history_by_month.values():
        for r in v:
            hist_ids.add(r.get("id"))

    print("[INFO] 回放得 %d 条最终记录；可归档(状态==完成) %d 条/%d 个月；继续留 Waline(非完成) %d 条"
          % (len(final), total_hist, len(history_by_month), len(current)))

    # 归档后不再真正删除 Waline 评论；「标记已归档 / 清洗删除」计划见下方第 2、3 步。

    if dry_run:
        # 预览：假设全部成功写 R2，则标记 hist_ids 全部为「已归档」；冗余旧评论(del 标记/同 id 多余)仍清理
        def plan_preview():
            todo = set()
            for rid, oids in id_to_oids.items():
                if rid in hist_ids:
                    if len(oids) > 1:
                        todo |= (oids - {max(oids)})
                elif rid in final_ids:
                    if len(oids) > 1:
                        todo |= (oids - {max(oids)})
                else:
                    todo |= oids
            return todo
        todo = plan_preview()
        dup = sum(1 for rid, oids in id_to_oids.items()
                  if (rid in final_ids or rid in hist_ids) and len(oids) > 1)
        del_marked = sum(1 for rid in id_to_oids if rid not in final_ids and rid not in hist_ids)
        print("[DRY-RUN] 未写 R2、未改动 Waline。")
        print("[DRY-RUN] 计划：标记 %d 条为「已归档」(写 R2 成功后) / 清理冗余评论 %d 条(同 id 多余 %d + 被删标记 %d)"
              % (len(hist_ids), len(todo), dup, del_marked))
        return total_hist

    # 1) 写 R2（按月份）：已存在同月主文件则另存「后补」(<ym>-NN.json)。逐月捕获异常——
    #    只有成功写 R2 的月份/记录才进入 ok_rids，随后标记「已归档」；失败的保留 Waline 原状可重试。
    r2_keys = upload_r2.list_objects(R2_CFG, prefix=ARCHIVE_PREFIX)
    written_keys = []
    months = []
    ok_rids = set()
    for ym in sorted(history_by_month.keys()):
        key = determine_archive_key(r2_keys, ym)
        is_sup = key != (ARCHIVE_PREFIX + ym + ".json")
        try:
            put_r2(key, {"month": ym, "count": len(history_by_month[ym]),
                         "records": history_by_month[ym], "supplement": is_sup})
            written_keys.append(key)
            months.append(ym)
            for r in history_by_month[ym]:
                ok_rids.add(r.get("id"))
            print("[PUT] R2 %s (%s, %d 条)" % (key, "后补" if is_sup else "主", len(history_by_month[ym])))
        except Exception as e:
            print("[WARN] 写 R2 %s 失败: %s —— 该月 %d 条记录保留 Waline 原状(仍 status=完成)，不参与标记，可下次重试"
                  % (key, e, len(history_by_month[ym])))

    # 2) 标记「已归档」（仅成功写 R2 的记录）：原地 PUT 其最新 oid 的 comment，status='已归档'，不删除。
    marked = 0
    mark_fail = 0
    for rid in sorted(ok_rids):
        oids = id_to_oids.get(rid)
        if not oids:
            continue
        oid = max(oids)                      # 最新一条原地复写
        rec = next((r for r in final if r.get("id") == rid), None)
        if rec is None:
            continue
        try:
            mark_archived(rid, oid, rec)
            marked += 1
        except Exception as e:
            mark_fail += 1
            print("[WARN] 标记 %s 为「已归档」失败(oid=%d): %s —— 该记录仍 status=完成留 Waline，可重试" % (rid, oid, e))

    # 3) 清洗删除（冗余旧评论 + del 标记）：已成功归档标记的最新条保留，其余同 id 旧评论删冗余；被 del 标记全删。
    def plan_deletions():
        todo = set()
        for rid, oids in id_to_oids.items():
            if rid in ok_rids:
                if len(oids) > 1:
                    todo |= (oids - {max(oids)})      # 已归档标记：保留最新(已标记)条，删其余冗余
            elif rid in final_ids:
                if len(oids) > 1:
                    todo |= (oids - {max(oids)})
            else:
                todo |= oids                          # 被 del 事件标记：物理删除全部
        return todo
    todo = plan_deletions()
    removed = 0
    for oid in sorted(todo):
        try:
            waline_req("DELETE", "/api/comment/%s" % oid, token=TOKEN)
            removed += 1
        except Exception as e:
            print("[WARN] 删除评论 #%d 失败: %s" % (oid, e))
    dup = sum(1 for rid, oids in id_to_oids.items()
              if (rid in final_ids or rid in ok_rids) and len(oids) > 1)
    del_marked = sum(1 for rid in id_to_oids if rid not in final_ids and rid not in ok_rids)
    print("[OK] 清理冗余 Waline 评论 %d 条（同 id 多余 %d / 被删标记 %d）；已成功标记「已归档」%d 条(失败 %d)"
          % (removed, dup, del_marked, marked, mark_fail))

    # 3) 单据流水号配置现由前端在新建/删除记录时实时写入（带管理员令牌），后端不再维护

    # 4) 重建 index（只含本次成功写入的文件）
    build_index(set(r2_keys) | set(written_keys))
    print("[OK] 归档写 R2 %d 个月(%s)；标记「已归档」%d 条(失败 %d)；清理冗余评论 %d 条。"
          % (len(months), ",".join(months), marked, mark_fail, removed))

    # 5) 写出「本次运行实际归档的文件清单」，供 _W_Data.py --r2 只写本次归档、不写历史。
    #    即使本次没有归档任何文件(total_hist==0)，也写出空清单，让 _W_Data 安全跳过。
    try:
        man = {
            "archived_at": int(time.time()),
            "files": written_keys,            # 相对 key，如 kaoqing-archive/2026-11.json / _01.json
            "months": months,
            "count": marked,
        }
        with open(os.path.join(HERE, "_archive_this_run.json"), "w", encoding="utf-8") as _mf:
            json.dump(man, _mf, ensure_ascii=False, indent=2)
        print("[OK] 已写出本次归档清单 _archive_this_run.json（%d 个文件）" % len(written_keys))
    except Exception as e:
        print("[WARN] 写出归档清单失败: %s" % e)
    return marked


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
