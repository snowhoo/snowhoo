#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地常驻轮询服务（Waline 版）：把 Waline 当"按需抓取任务队列"。

==========================================================================
【安全模型 / 谁用什么身份】—— 务必看清，避免误以为"匿名"和"token"冲突
==========================================================================
本项目有两个互相独立、互不冲突的角色：

  ① 请求发起方（前端访客，跑在浏览器里）
       -> 完全【匿名】提交，不携带任何 token。
       books.html 的 requestShard() 向 Waline 专用 path 匿名 POST 一条评论
       （comment 内含 {b:book_id, s:shard}）即视为"入队一个抓取任务"。
       token 永不出现在前端代码或网络请求里，符合"前端任意用户匿名发起、不暴露 admin"的要求。

  ② 请求消费方（本机 poller，跑在你自己的机器上，非浏览器）
       -> 必须使用【waline_admin_token】，且 token 只写在本地 poller_config.json，
          不会发到任何访客能触达的地方。token 在这里只干两件事：
            a) 读取待处理任务：Waline 公开 GET 只返回"已通过审核(status=1)"的评论；
               任务评论保持 status=0（待审核），所以它们绝不会漏进真实评论区，
               也只有 admin token 能列出某 path 下 status=0 的评论（见 fetch_pending）。
            b) 抓完即焚：成功抓取上传后删除该评论（见 delete_comment），
               这是 Waline 的 admin 专属 DELETE 接口，匿名做不到。
               失败则标记 status=2 留痕。

  结论：匿名只管"谁发起请求"，token 只管"后端读/删任务"，二者分工明确、互不替代。
        只要保留"用完即焚"，DELETE 就必须用 admin token——它本就只驻留本机，无外泄风险。

==========================================================================
【运行流程】
==========================================================================
周期性用管理员 token 拉取 Waline 专用 path 下待处理评论（每条 = 一个抓取任务），
      并发≤N 处理每个任务：
        1) scrape_shard(bid, shard) 抓取单分片 -> data/<id>/cSS.json (+ toc.json)
        2) 调 upload_r2.py 增量同步到 R2
        3) 成功 -> 删除该 Waline 评论（用完即焚，不留记录）；失败 -> 标记 status=2 留痕

依赖：同目录 lewx.cc.books.py（import scrape_shard）、upload_r2.py。
配置：同目录 poller_config.json
      { waline_server, waline_admin_token, task_path="/books/task-queue",
        max_concurrent=3, poll_interval=5 }
"""
import os
import sys
import json
import time
import threading
import importlib.util
import urllib.request
import urllib.parse
import urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def load_crawler():
    spec = importlib.util.spec_from_file_location("lewxmod", os.path.join(HERE, "lewx.cc.books.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bk = load_crawler()


def load_cfg():
    cfg = {
        "waline_server": os.environ.get("WALINE_SERVER", ""),
        "waline_admin_token": os.environ.get("WALINE_ADMIN_TOKEN", ""),
        "task_path": os.environ.get("WALINE_TASK_PATH", "/books/task-queue"),
        "max_concurrent": int(os.environ.get("POLLER_WORKERS", "3")),
        "poll_interval": float(os.environ.get("POLL_INTERVAL", "5")),
        "max_rounds": int(os.environ.get("POLLER_ROUNDS", "1")),
    }
    p = os.path.join(HERE, "poller_config.json")
    if os.path.exists(p):
        try:
            cfg.update(json.load(open(p, encoding="utf-8")))
        except Exception as e:
            print("[WARN] poller_config.json:", e)
    return cfg


CFG = load_cfg()
WALINE_SERVER = (CFG["waline_server"] or "").rstrip("/")
TOKEN = CFG["waline_admin_token"] or ""
TASK_PATH = CFG["task_path"] or "/books/task-queue"
UPLOAD_LOCK = threading.Lock()


def waline_req(method, path, *, token=None, params=None, body=None):
    """调用 Waline REST API。管理员操作带 token（兼备 Authorization 头与 query 兜底）。"""
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


def run_upload():
    # 复用 upload_r2.py 增量同步 data/ -> R2（md5 比对跳过未变文件，仅上传新分片）
    import subprocess
    with UPLOAD_LOCK:
        subprocess.run([sys.executable, os.path.join(HERE, "upload_r2.py")], check=False)


def fetch_pending():
    # 注意：Waline 的「按 path 列表」接口会把 path 按 SITE_URL 拼成完整 url 再匹配，
    # 而我们 POST 时填的是完整 url（https://snowhoo.net/books/task-queue），域名/映射对不上 → 返回 0。
    # 正确做法是用管理员全量列表 `?type=list`（需 Bearer 鉴权，waline_req 已带），它返回全站评论，
    # 再按 url 含 TASK_PATH 过滤出任务队列的评论即可。
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
            u = (c.get("url") or "")
            if TASK_PATH in u:   # 只认任务队列路径下的评论
                out.append(c)
        if len(arr) < 100:
            break
        page += 1
    return out


def delete_comment(cid):
    try:
        waline_req("DELETE", "/api/comment/%s" % cid, token=TOKEN)
        return True
    except Exception as e:
        print("[WARN] 删除评论 %s 失败: %s" % (cid, e))
        return False


def mark_failed(cid, msg):
    try:
        waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN,
                   body={"comment": "[failed: %s]" % msg[:120], "status": 2})
    except Exception as e:
        print("[WARN] 标记失败 %s: %s" % (cid, e))


def process_one(c):
    # Waline 评论列表返回的主键字段是 objectId（不是 id），务必用 objectId 才能正确删除/标记
    cid = c.get("objectId") or c.get("id")
    # 注意：Waline 的 comment 字段是 HTML 转义后的渲染版（如 <p>{"b":...}</p>），
    # 原始 JSON 在 orig 字段。务必用 orig，否则 json.loads 必失败、任务会被误删而不处理。
    raw = (c.get("orig") or c.get("comment") or "")
    shown = (c.get("comment") or "")
    if raw.startswith("[failed") or shown.startswith("[failed") or c.get("status") == 2:
        # 已失败过一次（或被标记 status=2），二次碰到即清除，避免堆积
        delete_comment(cid)
        return
    try:
        req = json.loads(raw)
        bid = str(req["b"])
        shard = int(req["s"])
    except Exception:
        print("[WARN] 丢弃无法解析的任务评论 %s: %s" % (cid, raw[:80]))
        delete_comment(cid)
        return
    try:
        res = bk.scrape_shard(bid, shard)
        if not res:
            mark_failed(cid, "抓取失败/被风控(空壳页)")
            return
        _titles, total = res
        run_upload()
        delete_comment(cid)  # 成功即焚
        print("[OK] %s shard %d (total=%d)" % (bid, shard, total))
    except Exception as e:
        mark_failed(cid, str(e)[:120])
        print("[ERR] %s/%d: %s" % (bid, shard, e))


def loop_once():
    tasks = fetch_pending()
    if tasks:
        print("[INFO] 处理 %d 个任务" % len(tasks))
        with ThreadPoolExecutor(max_workers=CFG["max_concurrent"]) as ex:
            list(ex.map(process_one, tasks))
    return True


def main():
    if not WALINE_SERVER or not TOKEN:
        print("[ERR] 缺少 waline_server / waline_admin_token（环境变量或 poller_config.json）。")
        sys.exit(2)
    rounds = CFG["max_rounds"]
    print("[poller] 启动 waline=%s path=%s 并发=%d（单次检查，跑完即退出，由计划任务每分钟唤醒）"
          % (WALINE_SERVER, TASK_PATH, CFG["max_concurrent"]))
    for i in range(rounds):
        loop_once()
        if i < rounds - 1:
            time.sleep(CFG["poll_interval"])
    print("[poller] 已完成单次检查，退出。")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[poller] 已停止")
