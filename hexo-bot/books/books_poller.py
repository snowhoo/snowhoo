#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地常驻轮询服务（Waline 版）：把 Waline 当"按需抓取任务队列 / 心愿单"。

==========================================================================
【安全模型 / 谁用什么身份】
==========================================================================
  ① 请求发起方（前端访客，跑在浏览器里）-> 完全【匿名】提交，不携带任何 token。
     books.html 的"许愿"向 Waline 专用 path 匿名 POST 一条评论
     （comment 内含 {b:book_id, s:shard, i:章节序号, t:书名}）即视为"入队一个抓取心愿"。
     token 永不出现在前端代码或网络请求里。

  ② 请求消费方（本机 poller，跑在你自己的机器上）-> 必须使用【waline_admin_token】，
     且 token 只写在本地 poller_config.json。token 在这里只干两件事：
       a) 读取待处理任务：管理员全量列表 `?type=list`（Bearer 鉴权），按 url 含 TASK_PATH 过滤；
       b) 处理完后把评论状态标记掉（不再"用完即焚"），避免重复处理。

  结论：匿名只管"谁发起心愿"，token 只管"后端读/处理任务"，二者分工明确、互不替代。

==========================================================================
【心愿单（Waline 即唯一存储：无任何本地状态文件，本机只做读-抓-写）】
==========================================================================
  许愿   = 前端匿名 POST Waline 一条评论（url 完整、内容 {b,s,i,t}），url/专用 path 即识别字段。
  心愿单 = 前端打开时【匿名 GET Waline】按"完整 URL path"取 /books/task-queue 评论列表：
          无 ok = 待（未达成）；带 ok = 已达成；其中一条无 b 的 {"cnt": N} 评论 = 累计已达成数。
  本 poller（后台，仅本机）只负责消费队列抓取正文：
    1) 成功：抓分片 -> 传 R2 -> 把 ok:1 写回该评论（PUT comment 内容），前端即见"已达成"；
    2) 失败：评论不动（保持无 ok = pending）——用户口径：无需冷却，下次轮询自然再试；
    3) 累计已达成：写为同 path 下一条 {"cnt": N} 计数评论（bump_counter，每次 +delta）；
    4) prune：只清理"带 ok（已达成）"的旧心愿评论（保留最近 10 条达成记录供展示），
       pending（无 ok）与计数评论永不删——控制 Waline 不无限增长。
  注意：Waline 评论 status 字段在不同接口下语义不一（数字/枚举字符串），一律不作为心愿状态依据；
  一切状态与计数都以 Waline 评论内容为准（评论即事实源）。

【运行流程】
  周期性用管理员 token 拉取 Waline 专用 path 下待处理评论（每条 = 一个抓取心愿），
      并发≤N 处理每个心愿：
        1) scrape_shard(bid, shard) 抓取单分片 -> data/<id>/cSS.json (+ toc.json)
        2) 调 upload_r2.py 增量同步到 R2
        3) 成功 -> 把 ok:1 写回该 Waline 评论（不删除）+ bump_counter(1)（计数写回 Waline）
           失败 -> 评论不动，下次轮询自然再试
  依赖：同目录 lewx.cc.books.py（import scrape_shard）、upload_r2.py。
  配置：同目录 poller_config.json
        { waline_server, waline_admin_token, task_path="/books/task-queue",
          max_concurrent=3, poll_interval=5, max_rounds=1 }
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

# Waline 即唯一存储：心愿=评论（内容 {b,s,i,t}，poller 达成后写回 ok:1）；累计已达成数=同 path 下
# 一条 {"cnt": N} 计数评论。本 poller 无任何本地状态文件，只做"读 Waline -> 抓取 -> 写回 Waline"。


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

# 抓取失败无需冷却：某条许愿未达成 -> 评论不带 ok、状态不变，下次轮询自然再把它加入处理。
# 达成与否【写进评论内容】（ok:1 标识），Waline 评论即事实源。
def req_is_done(req):
    """心愿内容带 ok=1 => poller 已达成（分片已上传 R2），前端据此显示"已达成"。"""
    return bool(req and req.get("ok") == 1)


def stamp_ok(cid, req):
    """达成后把 ok:1 写回该 Waline 评论（内容字段），前端匿名读取即可见。"""
    req = dict(req)
    req["ok"] = 1
    try:
        waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN,
                   body={"comment": json.dumps(req, ensure_ascii=False)})
        return True
    except Exception as e:
        print("[WARN] 写回达成标识 %s 失败: %s" % (cid, e))
        return False


# ---- 累计已达成计数：存为 Waline 同 path 下一条 {"cnt": N} 评论（无 b/s 字段，天然与心愿区分） ----
def parse_any(c):
    try:
        return json.loads(c.get("orig") or c.get("comment") or "")
    except Exception:
        return None


def bump_counter(delta):
    """累计已达成数 +delta，写回 Waline 计数评论（不存在则创建一条 {"cnt": N}）。"""
    if delta <= 0:
        return
    cid, cur = None, 0
    for c in fetch_all_task():
        req = parse_any(c)
        if req and isinstance(req, dict) and "cnt" in req and "b" not in req:
            cid = c.get("objectId")
            cur = int(req.get("cnt") or 0)
            break
    payload = json.dumps({"cnt": cur + delta}, ensure_ascii=False)
    try:
        if cid:
            waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN, body={"comment": payload})
        else:
            waline_req("POST", "/api/comment", token=TOKEN, body={
                "url": "https://snowhoo.net" + TASK_PATH,
                "path": TASK_PATH,
                "comment": payload,
                "nick": "books-bot", "mail": "", "link": "",
            })
    except Exception as e:
        print("[WARN] 写回达成计数失败:", e)


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
    # 复用 upload_r2.py 增量同步 data/ -> R2（md5 比对跳过未变文件，仅上传新分片 / 心愿单文件）
    import subprocess
    with UPLOAD_LOCK:
        subprocess.run([sys.executable, os.path.join(HERE, "upload_r2.py")], check=False)


def fetch_all_task():
    """拉取 Waline 全站评论（管理员列表），过滤出 TASK_PATH 下的任务评论。"""
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
            if TASK_PATH in (c.get("url") or ""):
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


def parse_req(c):
    # Waline 评论列表返回的主键字段是 objectId（不是 id）。
    # comment 字段是 HTML 转义渲染版（<p>{"b":...}</p>），原始 JSON 在 orig 字段。
    raw = (c.get("orig") or c.get("comment") or "")
    try:
        req = json.loads(raw)
    except Exception:
        return None
    if "b" not in req or "s" not in req:
        return None
    return req


# （recent.json / processed.json 均已废弃：心愿单由前端【直接匿名读 Waline】展示，
#   达成与否 = 评论内容是否带 ok:1（poller 抓成后写回），无需任何本地状态文件。）

def prune_done_comments(keep=10):
    """防 Waline 无限增长：只清理【已达成(评论带 ok)】的旧评论，保留最近 keep 条达成记录；
    pending（无 ok，未达成）评论永不删除——那是用户尚未兑现的心愿。"""
    comments = fetch_all_task()
    dones = []
    for c in comments:
        req = parse_req(c)
        if req_is_done(req):
            dones.append(c)
    if len(dones) <= keep:
        return
    dones.sort(key=lambda c: str(c.get("time") or ""))
    for c in dones[:-keep]:
        delete_comment(c.get("objectId") or c.get("id"))


def process_one(c):
    """处理单个心愿。成功：抓分片→传 R2→把 ok:1 写回该评论（前端=已达成）；
    失败：评论不动（保持无 ok = pending），下次轮询自然再试。
    返回 ('done'|'failed'|'skip', cid)。"""
    cid = str(c.get("objectId") or c.get("id"))
    req = parse_req(c)
    if not req:
        print("[WARN] 丢弃无法解析的任务评论 %s" % cid)
        delete_comment(cid)
        return ("skip", cid)
    bid = str(req["b"])
    shard = int(req["s"])
    try:
        res = bk.scrape_shard(bid, shard)
        if not res:
            print("[FAIL] %s/%d 空壳页(可能被风控，下次轮询再试)" % (bid, shard))
            return ("failed", cid)
        _titles, total = res
        run_upload()
        if not stamp_ok(cid, req):   # 写回 ok 失败则下次轮询再试（分片已在 R2，幂等安全）
            return ("failed", cid)
        print("[OK] %s shard %d (total=%d)" % (bid, shard, total))
        return ("done", cid)
    except Exception as e:
        print("[ERR] %s/%d: %s" % (bid, shard, e))
        return ("failed", cid)


def loop_once():
    # 同一本书同一分片(50 章一批)只处理一次：许第 1 章与许第 2..50 章是同一个心愿
    groups = {}      # (bid, shard) -> [评论...]（未达成）
    for c in fetch_all_task():
        req = parse_req(c)
        if not req or req_is_done(req):
            continue
        groups.setdefault((str(req["b"]), int(req["s"])), []).append(c)
    tasks = [g[0] for g in groups.values() if g]
    if not tasks:
        prune_done_comments()
        return 0
    print("[INFO] 处理 %d 个分片心愿（同书同分片已去重）" % len(tasks))
    with ThreadPoolExecutor(max_workers=CFG["max_concurrent"]) as ex:
        results = list(ex.map(process_one, tasks))
    done = 0
    for c, (status, _cid) in zip(tasks, results):
        if status != "done":
            continue
        done += 1
        req = parse_req(c)
        key = (str(req["b"]), int(req["s"]))
        # 同分片的其它心愿评论一并写 ok（同一批 50 章已到手，避免重复抓取 / 重复计数）
        for other in groups[key][1:]:
            other_req = parse_req(other)
            if other_req and not req_is_done(other_req):
                stamp_ok(str(other.get("objectId") or other.get("id")), other_req)
    if done:
        bump_counter(done)   # 累计已达成计数写回 Waline（{"cnt": N} 一条评论）
        print("[INFO] 本轮达成 %d 个分片心愿" % done)
    prune_done_comments()
    return done


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
