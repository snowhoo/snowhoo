#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kaoqing 归档 poller（参照 books_poller.py 范式）。

把 kaoqing 本月之前的考勤记录按月归档到 Cloudflare R2（复用 books 同桶、kaoqing-archive/ 前缀），
归档完成后从 Waline 清除已归档数据，并在 R2 维护 index.json 供前端下拉框读取。

==========================================================================
【安全模型（与 books_poller 一致）】
==========================================================================
  ① 前端访客（浏览器）：匿名 POST 一条评论到 WALINE_ARCHIVE_JOB_PATH 即"入队一个归档任务"
     （内容 {type:'archive', reqAt, count}）。token 永不出现在前端。
  ② 本脚本（仅本机/服务器）：用 WALINE_ADMIN_TOKEN 读取任务、复写 /kaoqing/records、
     把 ok:1 写回任务评论、上传 R2（R2 凭证在 books 目录的 r2_config.json，绝不进前端）。
==========================================================================

【运行】
  py -3 kaoqing_archiver.py            # 单次检查，跑完即退出（由计划任务每分钟唤醒）
  py -3 kaoqing_archiver.py --loop     # 常驻轮询（间隔 POLL_INTERVAL 秒）
配置：poller_config.json（同目录）或环境变量 WALINE_SERVER / WALINE_ADMIN_TOKEN /
      WALINE_ARCHIVE_JOB_PATH / POLL_INTERVAL；R2 凭证复用 ../books/r2_config.json。
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


def load_cfg():
    cfg = {
        "waline_server": os.environ.get("WALINE_SERVER", "https://waline.snowhoo.net"),
        "waline_admin_token": os.environ.get("WALINE_ADMIN_TOKEN", ""),
        "job_path": os.environ.get("WALINE_ARCHIVE_JOB_PATH", "/kaoqing/archive-jobs"),
        "poll_interval": float(os.environ.get("POLL_INTERVAL", "5")),
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
ARCHIVE_JOB_PATH = CFG["job_path"] or "/kaoqing/archive-jobs"
RECORDS_PATH = "/kaoqing/records"
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


def fetch_all_task():
    """拉取 Waline 全站评论（管理员列表），过滤出归档任务路径下的任务。"""
    out = []
    page = 1
    while True:
        try:
            resp = waline_req("GET", "/api/comment", token=TOKEN,
                              params={"type": "list", "page": page, "pageSize": 100})
        except Exception as e:
            print("[WARN] 拉取任务失败:", e)
            break
        arr = (resp.get("data") or {}).get("data") or []
        if not arr:
            break
        for c in arr:
            if ARCHIVE_JOB_PATH in (c.get("url") or ""):
                out.append(c)
        if len(arr) < 100:
            break
        page += 1
    return out


def parse_any(c):
    try:
        return json.loads(c.get("orig") or c.get("comment") or "")
    except Exception:
        return None


def stamp_ok(cid, obj):
    obj = dict(obj)
    obj["ok"] = 1
    try:
        waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN,
                   body={"comment": json.dumps(obj, ensure_ascii=False)})
        return True
    except Exception as e:
        print("[WARN] 写回 ok 失败 %s:" % cid, e)
        return False


def first_of_this_month():
    return datetime.date.today().replace(day=1).strftime("%Y-%m-%d")


def read_records():
    """读取 /kaoqing/records 全量（取最新 v===1 那条）。返回 (oid, records_list)。"""
    resp = waline_req("GET", "/api/comment", params={"path": RECORDS_PATH}, token=TOKEN)
    arr = (resp.get("data") or {}).get("data") or []
    best = None
    for rec in arr:
        try:
            o = json.loads(rec.get("orig") or rec.get("comment") or "")
        except Exception:
            continue
        if o and o.get("v") == 1 and o.get("records") is not None:
            oid = int(rec.get("objectId") or 0)
            if best is None or oid > best[0]:
                best = (oid, o["records"])
    if best is None:
        return (0, [])
    return best


# ----------------------------- R2 -----------------------------
def put_r2(key, obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    upload_r2.put_object(R2_CFG, key, data)


def build_index():
    """列举 R2 上 kaoqing-archive/*.json（排除 index.json），重建 index.json。"""
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


# ----------------------------- 核心处理 -----------------------------
def process_one(c):
    cid = str(c.get("objectId") or c.get("id"))
    req = parse_any(c)
    if not req or req.get("type") != "archive":
        return ("skip", cid)
    cutoff = first_of_this_month()
    try:
        oid, recs = read_records()
        if not recs:
            stamp_ok(cid, dict(req, ok=1, months=[], count=0, msg="无记录"))
            return ("done", cid)
        history = [r for r in recs if (r.get("date") or "") < cutoff]
        current = [r for r in recs if (r.get("date") or "") >= cutoff]
        if not history:
            stamp_ok(cid, dict(req, ok=1, months=[], count=0, msg="无历史可归档"))
            return ("done", cid)
        # 按月分组写 R2（每月一个文件）
        by = {}
        for r in history:
            ym = (r.get("date") or "")[:7]
            by.setdefault(ym, []).append(r)
        months = []
        for ym in sorted(by.keys()):
            put_r2(ARCHIVE_PREFIX + ym + ".json",
                   {"month": ym, "count": len(by[ym]), "records": by[ym]})
            months.append(ym)
        # 复写 current 回 Waline（即清除已归档的历史数据；records 是整包一条评论）
        payload = {"v": 1, "type": "records", "updatedAt": int(time.time() * 1000), "records": current}
        waline_req("PUT", "/api/comment/%s" % oid, token=TOKEN,
                   body={"comment": json.dumps(payload, ensure_ascii=False)})
        # 重建 index.json
        build_index()
        stamp_ok(cid, dict(req, ok=1, months=months, count=len(history)))
        print("[OK] 归档 %d 个自然月（%s），共 %d 条；Waline 保留当月 %d 条"
              % (len(months), ",".join(months), len(history), len(current)))
        return ("done", cid)
    except Exception as e:
        print("[ERR] 处理任务 %s 失败: %s" % (cid, e))
        try:
            waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN,
                       body={"comment": json.dumps(dict(req, error=str(e)), ensure_ascii=False)})
        except Exception:
            pass
        return ("failed", cid)


def loop_once():
    tasks = []
    for c in fetch_all_task():
        req = parse_any(c)
        if req and req.get("type") == "archive" and req.get("ok") != 1:
            tasks.append(c)
    if not tasks:
        return 0
    print("[INFO] 发现 %d 个待归档任务" % len(tasks))
    done = 0
    for c in tasks:
        st, _ = process_one(c)
        if st == "done":
            done += 1
    return done


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true", help="常驻轮询（间隔 POLL_INTERVAL 秒）")
    args = ap.parse_args()
    if not WALINE_SERVER or not TOKEN:
        print("[ERR] 缺少 waline_server / waline_admin_token（环境变量或 poller_config.json）。")
        sys.exit(2)
    miss = [k for k in ("account_id", "access_key", "secret_key", "bucket") if not R2_CFG.get(k)]
    if miss:
        print("[ERR] 缺少 R2 配置: %s（请配 ../books/r2_config.json 或环境变量 R2_*）" % ",".join(miss))
        sys.exit(2)
    print("[archiver] 启动 waline=%s job_path=%s" % (WALINE_SERVER, ARCHIVE_JOB_PATH))
    while True:
        n = loop_once()
        if n:
            print("[archiver] 本轮完成 %d 个任务" % n)
        if not args.loop:
            break
        time.sleep(CFG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[archiver] 已停止")
