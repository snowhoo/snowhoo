#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""kaoqing 归档脚本（后端主动发起，无需前端参与）。

把 kaoqing 本月之前的考勤记录按月归档到 Cloudflare R2（复用 books 同桶、kaoqing-archive/ 前缀），
归档完成后将「清洗后的数据」（仅保留本月及以后）直接复写回 Waline，即在 Waline 中清除已归档的历史数据，
并在 R2 维护 index.json 供日后查阅。

==========================================================================
【运行方式】
==========================================================================
  后端主动发起归档，前端不再有任何归档按钮 / 任务队列 / 轮询握手。
  由 cron / 计划任务定时拉起本脚本即可（建议每月初跑一次，或常驻 --loop 每小时自检）：

  py -3 kaoqing_archiver.py            # 单次：读 Waline → 归档历史 → 复写清洗数据回 Waline
  py -3 kaoqing_archiver.py --loop     # 常驻：每 POLL_INTERVAL 秒自检一次（无历史则空转）

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


# ----------------------------- 主动归档 -----------------------------
def archive_once():
    """读 Waline → 归档本月之前的数据到 R2 → 将清洗后（仅本月）的数据复写回 Waline。返回归档条数。"""
    cutoff = first_of_this_month()
    oid, recs = read_records()
    if not recs:
        print("[INFO] Waline 中无考勤记录，跳过。")
        return 0
    history = [r for r in recs if (r.get("date") or "") < cutoff]
    current = [r for r in recs if (r.get("date") or "") >= cutoff]
    if not history:
        print("[INFO] 无本月之前的记录（cutoff=%s），无需归档。" % cutoff)
        return 0
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
    # 将清洗后的当前数据复写回 Waline（即清除已归档历史；records 是整包一条评论）
    payload = {"v": 1, "type": "records", "updatedAt": int(time.time() * 1000), "records": current}
    if oid:
        waline_req("PUT", "/api/comment/%s" % oid, token=TOKEN,
                   body={"comment": json.dumps(payload, ensure_ascii=False)})
    else:
        print("[WARN] 未取到 records 的 objectId，跳过 Waline 复写（历史数据已写入 R2，但 Waline 未清理）。")
    # 重建 index.json
    build_index()
    print("[OK] 归档 %d 个自然月（%s），共 %d 条；Waline 保留当月 %d 条"
          % (len(months), ",".join(months), len(history), len(current)))
    return len(history)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true", help="常驻自检（间隔 POLL_INTERVAL 秒）")
    args = ap.parse_args()
    if not WALINE_SERVER or not TOKEN:
        print("[ERR] 缺少 waline_server / waline_admin_token（环境变量或 poller_config.json）。")
        sys.exit(2)
    miss = [k for k in ("account_id", "access_key", "secret_key", "bucket") if not R2_CFG.get(k)]
    if miss:
        print("[ERR] 缺少 R2 配置: %s（请配 ../books/r2_config.json 或环境变量 R2_*）" % ",".join(miss))
        sys.exit(2)
    print("[archiver] 启动 waline=%s 模式=%s" % (WALINE_SERVER, "loop" if args.loop else "once"))
    while True:
        n = archive_once()
        if n:
            print("[archiver] 本轮归档 %d 条" % n)
        if not args.loop:
            break
        time.sleep(CFG["poll_interval"])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[archiver] 已停止")
