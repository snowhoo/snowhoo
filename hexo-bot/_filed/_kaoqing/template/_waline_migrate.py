#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Waline 考勤数据迁移（导出 / 导入 / 生成混淆 token），全程走 REST API，与旧库类型无关。

用法：
    py _waline_migrate.py export
    py _waline_migrate.py import --server http://192.168.1.50:8360 --token <新站token>
    py _waline_migrate.py mkobf  --token <新站token>

关键事实（2026-09-13 实测确认，勿凭印象改）：
  - GET /api/comment?path=xxx（前端读法）：**不返回 url 字段**，返回 Valine 兼容形态
    （含 children/type/label），按 path 服务端过滤 —— 「属于哪个 path」由查询参数得知。
  - GET /api/comment?type=list&page=N（管理端）：**返回 url 字段**，脚本靠它按 url 过滤。
  - 评论对象的两个内容字段：
      * orig    = 前端原始提交的 JSON 字符串（直引号、未加工）—— **迁移要回灌这个**
      * comment = Waline 加工后的 HTML（外层包 <p>、直引号变弯引号）—— 只用于校验
  - 回灌 orig（而非 comment）才能与线上 1:1 复现：Waline 会用同一套加工流程产出同样的 comment；
    若回灌 comment，会被二次加工（可能再包一层 <p>）。
  - ⚠ 新库里 objectId 会重排、time 会变成导入时间；业务数据都在 orig 的 JSON 里，不受影响。
  - 旧站 token 只对旧站有效；导入新站必须用【新站登录后拿到的 token】。
"""
import os
import sys
import json
import time
import base64
import argparse
import urllib.request
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT_FILE = os.path.join(HERE, "_waline_export_kaoqing.json")

OLD_WALINE_SERVER = os.environ.get("WALINE_SERVER", "https://waline.snowhoo.net")

# 旧站管理员令牌：与 kaoqing.html / _archiver.py / _C_request.py 同款混淆（勿手抄，用 mkobf 生成）
TK_SEED = '8kQ~zL#'
TK_OBF = 'CA4WRzEWZlo5Og8xCkpdHgZHLhh8Xg8CGhgdYggKIkgeKFVUPT0VDn0ObkUAM1R1aVElYDcAGWpyAh4XGQtBUCEoGw=='


def deobf(s_obf, seed=TK_SEED):
    b = base64.b64decode(s_obf)
    return ''.join(chr(b[i] ^ ord(seed[i % len(seed)])) for i in range(len(b)))[::-1]


def obf(token, seed=TK_SEED):
    """与前端/脚本一致的混淆：反转 → 逐字节 xor seed → base64。"""
    s = token[::-1]
    b = bytes(ord(s[i]) ^ ord(seed[i % len(seed)]) for i in range(len(s)))
    return base64.b64encode(b).decode()


OLD_TOKEN = os.environ.get("WALINE_ADMIN_TOKEN", "") or deobf(TK_OBF)

# 考勤相关 path（全部以 url 字段存储，可用服务端 path 过滤精确取回）
KAOQING_PATHS = [
    "/kaoqing/holidays",
    "/kaoqing/people",
    "/kaoqing/config",
    "/kaoqing/serial",
    "/kaoqing/archive-request",
    "/kaoqing/records/待提交",
    "/kaoqing/records/待审核",
    "/kaoqing/records/待批准",
    "/kaoqing/records/完成",
    "/kaoqing/records/已归档",
]

PAGE_SIZE = 100


def req(server, method, path, *, token=None, params=None, body=None, timeout=30):
    url = server.rstrip("/") + path
    q = []
    for k, v in (params or {}).items():
        q.append("%s=%s" % (k, urllib.parse.quote(str(v), safe="")))
    if token:
        q.append("token=" + urllib.parse.quote(token, safe=""))
    if q:
        url += "?" + "&".join(q)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_path(server, path, token=None):
    """按 path 分页拉取该 path 下全部评论（服务端过滤，1~2 次请求）。"""
    out, page = [], 1
    while True:
        j = req(server, "GET", "/api/comment", token=token,
                params={"path": path, "page": page, "pageSize": PAGE_SIZE})
        d = (j or {}).get("data") or {}
        arr = d.get("data") or []
        if not arr:
            break
        out.extend(arr)
        total_pages = d.get("totalPages") or 0
        if (total_pages and page >= total_pages) or len(arr) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.2)
    return out


def do_export(args):
    server = args.server or OLD_WALINE_SERVER
    token = args.token or OLD_TOKEN
    print("[export] 源站 %s" % server)
    if not token:
        print("[ERR] 缺少管理员 token（环境变量 WALINE_ADMIN_TOKEN）")
        return 2

    bundle = {"_meta": {"source": server, "exportedAt": int(time.time()), "paths": {}}, "comments": []}
    total = 0
    for p in KAOQING_PATHS:
        try:
            arr = fetch_path(server, p, token)
        except Exception as e:
            print("  [WARN] %-30s 拉取失败: %s" % (p, e))
            bundle["_meta"]["paths"][p] = -1
            continue
        for c in arr:
            bundle["comments"].append({
                "path": p,                                  # 归属 path（API 不返回 url，由查询得知）
                "oid": c.get("objectId"),
                "orig": c.get("orig"),                      # ← 回灌用这个
                "comment": c.get("comment"),                # ← 校验用（Waline 加工后）
                "nick": c.get("nick"),
                "mail": c.get("mail"),
                "link": c.get("link"),
                "status": c.get("status"),
                "time": c.get("time"),
            })
        bundle["_meta"]["paths"][p] = len(arr)
        total += len(arr)
        print("  %-30s %d 条" % (p, len(arr)))

    bundle["_meta"]["total"] = total
    with open(EXPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    print("\n[export] 完成：%d 条 → %s" % (total, EXPORT_FILE))
    return 0


def do_import(args):
    server, token = args.server, args.token or os.environ.get("NEW_WALINE_ADMIN_TOKEN", "")
    if not server:
        print("[ERR] 缺少 --server（新站地址，如 http://192.168.1.50:8360）")
        return 2
    if not token:
        print("[ERR] 缺少 --token（新站管理员 token）")
        return 2
    if not os.path.exists(EXPORT_FILE):
        print("[ERR] 找不到导出文件：%s（先跑 export）" % EXPORT_FILE)
        return 2

    with open(EXPORT_FILE, encoding="utf-8") as f:
        bundle = json.load(f)
    comments = bundle.get("comments") or []
    print("[import] 目标 %s，待导入 %d 条" % (server, len(comments)))

    ok = fail = 0
    for i, c in enumerate(comments, 1):
        body = {
            "comment": c.get("orig"),          # 回灌原始 JSON，保证加工结果与线上一致
            "url": c.get("path"),
            "nick": c.get("nick") or "anon",
            "mail": c.get("mail") or "",
            "link": c.get("link") or "",
            "ua": "",
        }
        try:
            j = req(server, "POST", "/api/comment", token=token, body=body)
            if (j or {}).get("errno") == 0:
                ok += 1
            else:
                fail += 1
                print("  [FAIL] #%d %s errno=%s %s" % (i, c.get("path"), j.get("errno"), j.get("errmsg")))
        except Exception as e:
            fail += 1
            print("  [FAIL] #%d %s %s" % (i, c.get("path"), e))
        time.sleep(0.1)

    print("\n[import] 成功 %d / 失败 %d" % (ok, fail))

    # 逐 path 复核：条数 + orig 内容双向比对
    print("\n[verify] 逐 path 复核（条数 / orig 内容）：")
    allsame = True
    for p in KAOQING_PATHS:
        want = sorted([x["orig"] for x in comments if x["path"] == p])
        try:
            got = sorted([x.get("orig") for x in fetch_path(server, p, token)])
        except Exception as e:
            print("  %-30s 复核失败: %s" % (p, e)); allsame = False; continue
        n_src = (bundle.get("_meta", {}).get("paths", {}) or {}).get(p)
        same = (want == got)
        allsame = allsame and same
        print("  %-30s 源 %-4s → 新 %-4s  orig 一致: %s" % (p, n_src, len(got), same))
        if not same:
            miss = [x for x in want if x not in got][:1]
            extra = [x for x in got if x not in want][:1]
            if miss:  print("      新站缺少样例:", (miss[0] or "")[:100])
            if extra: print("      新站多出样例:", (extra[0] or "")[:100])

    print("\n[verify] 总体一致：%s" % allsame)
    return 0 if (fail == 0 and allsame) else 1


def do_mkobf(args):
    print(obf(args.token))
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("export", help="从旧站导出考勤评论")
    e.add_argument("--server", default="", help="源站地址（默认线上）")
    e.add_argument("--token", default="", help="源站管理员 token（默认用内置混淆值）")
    e.set_defaults(func=do_export)

    m = sub.add_parser("import", help="导入到新站")
    m.add_argument("--server", required=True, help="新站地址，如 http://192.168.1.50:8360")
    m.add_argument("--token", default="", help="新站管理员 token")
    m.set_defaults(func=do_import)

    k = sub.add_parser("mkobf", help="把 token 混淆成可粘贴的串")
    k.add_argument("--token", required=True)
    k.set_defaults(func=do_mkobf)

    args = ap.parse_args()
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
