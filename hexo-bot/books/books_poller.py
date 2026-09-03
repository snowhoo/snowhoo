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
【心愿单展示（与"用完即焚"不同）】
==========================================================================
  用户要求：处理完的心愿【不要马上删除】，保留最近十条用于展示；并单独记录"已达成心愿数"。
  因此本 poller 处理成功后【不再 DELETE 评论】，而是：
    1) 把该评论 objectId 记入本地 data/wishes/processed.json（去重，避免重复抓取）；
    2) 重写 data/wishes/recent.json（最近 10 条心愿，含 pending/done/failed 状态）；
    3) 累加 data/wishes/stats.json 的 fulfilled 计数（累计已达成）。
  这三个文件随 upload_r2.py 自动同步到 R2 公开桶，前端匿名读取即可展示心愿单，
  全程无需把 admin token 暴露给访客。

  去重不依赖 Waline 评论的 status 字段语义（不同 Waline 版本默认状态不同），
  统一以本地 processed.json 的 objectId 集合为准；status==2（失败）的评论跳过不再重试。

【运行流程】
  周期性用管理员 token 拉取 Waline 专用 path 下待处理评论（每条 = 一个抓取心愿），
      并发≤N 处理每个心愿：
        1) scrape_shard(bid, shard) 抓取单分片 -> data/<id>/cSS.json (+ toc.json)
        2) 调 upload_r2.py 增量同步到 R2
        3) 成功 -> 记入 processed + 重写 recent/stats（保留展示，不删除评论）
           失败 -> 标记 status=2（跳过重试）
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

WISH_DIR = os.path.join(HERE, "data", "wishes")
PROCESSED_FILE = os.path.join(WISH_DIR, "processed.json")
RECENT_FILE = os.path.join(WISH_DIR, "recent.json")
STATS_FILE = os.path.join(WISH_DIR, "stats.json")


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

# 已处理心愿的 objectId 集合（去重，避免重复抓取；保留最近 50 条）
PROCESSED_LIST = []
PROCESSED_SET = set()


def _ensure_wish_dir():
    os.makedirs(WISH_DIR, exist_ok=True)


def load_processed():
    global PROCESSED_LIST, PROCESSED_SET
    try:
        arr = json.load(open(PROCESSED_FILE, encoding="utf-8"))
        if isinstance(arr, list):
            PROCESSED_LIST = [str(x) for x in arr][-50:]
            PROCESSED_SET = set(PROCESSED_LIST)
    except Exception:
        PROCESSED_LIST, PROCESSED_SET = [], set()


def save_processed():
    _ensure_wish_dir()
    if len(PROCESSED_LIST) > 50:
        PROCESSED_LIST[:] = PROCESSED_LIST[-50:]
    json.dump(PROCESSED_LIST, open(PROCESSED_FILE, "w", encoding="utf-8"))


def mark_processed(cid):
    cid = str(cid)
    if cid and cid not in PROCESSED_SET:
        PROCESSED_SET.add(cid)
        PROCESSED_LIST.append(cid)
        save_processed()


def load_stats():
    try:
        s = json.load(open(STATS_FILE, encoding="utf-8"))
        if isinstance(s, dict):
            return {"fulfilled": int(s.get("fulfilled", 0) or 0)}
    except Exception:
        pass
    return {"fulfilled": 0}


def save_stats(s):
    _ensure_wish_dir()
    json.dump(s, open(STATS_FILE, "w", encoding="utf-8"))


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


def fetch_pending():
    # 跳過已处理（processed 集合）与已失败（status==2）的评论，避免重复抓取 / 死循环重试
    out = []
    for c in fetch_all_task():
        if c.get("status") == 2:
            continue
        cid = str(c.get("objectId") or c.get("id"))
        if cid in PROCESSED_SET:
            continue
        out.append(c)
    return out


def delete_comment(cid):
    try:
        waline_req("DELETE", "/api/comment/%s" % cid, token=TOKEN)
        return True
    except Exception as e:
        print("[WARN] 删除评论 %s 失败: %s" % (cid, e))
        return False


def set_comment_status(cid, status):
    try:
        waline_req("PUT", "/api/comment/%s" % cid, token=TOKEN, body={"status": status})
    except Exception as e:
        print("[WARN] 标记状态 %s 失败: %s" % (cid, e))


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


def rebuild_wish_files():
    """重建心愿展示数据（写 recent.json）：
      - pending（未达成）心愿【全部保留】，不受条数限制——用户要知道它还没结果；
      - done/failed（已有结果）只取最近 10 条——结果看最近的就足够；
      - 无 pending 时即为"最近 10 条"。
      合并后按时间倒序输出。status 判定：本地 processed 集合 -> done；Waline status==2 -> failed；其余 pending。
      处理成功【不删除评论】（仅记 processed 去重 + stats 累计），Waline 评论总量由 prune 单独控制。"""
    comments = fetch_all_task()
    pending, finished = [], []
    for c in comments:
        req = parse_req(c)
        if not req:
            continue
        cid = str(c.get("objectId") or c.get("id"))
        st = c.get("status")
        if cid in PROCESSED_SET:
            status = "done"
        elif st == 2:
            status = "failed"
        else:
            status = "pending"
        i = req.get("i")
        chapter = (int(i) + 1) if i is not None else None
        ts = (c.get("time") or c.get("createdAt") or c.get("insertedAt") or "")
        e = {
            "bid": str(req["b"]),
            "shard": int(req["s"]),
            "chapter": chapter,
            "title": req.get("t") or "",
            "status": status,
            "ts": ts,
        }
        (pending if status == "pending" else finished).append(e)
    finished.sort(key=lambda e: str(e["ts"]), reverse=True)
    recent = pending + finished[:10]
    recent.sort(key=lambda e: str(e["ts"]), reverse=True)
    _ensure_wish_dir()
    json.dump(recent, open(RECENT_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return recent


def prune_old_wishes(keep=30):
    """控制 Waline 任务评论总量（防无限增长）：【只清理已有结果(done/failed)的旧评论】，
    pending（未达成）永不删除——那是用户尚未兑现的心愿。keep = done/failed 保留条数。"""
    comments = fetch_all_task()
    finished = []
    for c in comments:
        cid = str(c.get("objectId") or c.get("id"))
        if cid in PROCESSED_SET or c.get("status") == 2:
            finished.append(c)
    if len(finished) <= keep:
        return
    finished.sort(key=lambda c: str(c.get("time") or ""))
    for c in finished[:-keep]:
        delete_comment(c.get("objectId") or c.get("id"))


def process_one(c):
    """处理单个心愿。返回 ('done'|'failed'|'skip', info)。成功后【保留评论】，仅记入 processed。"""
    cid = c.get("objectId") or c.get("id")
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
            set_comment_status(cid, 2)
            print("[FAIL] %s/%d 空壳页(被风控)" % (bid, shard))
            return ("failed", cid)
        _titles, total = res
        run_upload()
        mark_processed(cid)  # 记去重 + 触发 recent/stats 重建
        print("[OK] %s shard %d (total=%d)" % (bid, shard, total))
        return ("done", {"bid": bid, "shard": shard})
    except Exception as e:
        set_comment_status(cid, 2)
        print("[ERR] %s/%d: %s" % (bid, shard, e))
        return ("failed", cid)


def loop_once():
    tasks = fetch_pending()
    if not tasks:
        # 即使没有新任务，也重建一次心愿单（保证 recent/stats 与 Waline 实时一致）
        rebuild_wish_files()
        return 0
    print("[INFO] 处理 %d 个任务" % len(tasks))
    results = []
    with ThreadPoolExecutor(max_workers=CFG["max_concurrent"]) as ex:
        results = list(ex.map(process_one, tasks))
    done = sum(1 for r in results if r[0] == "done")
    if done:
        s = load_stats()
        s["fulfilled"] = s.get("fulfilled", 0) + done
        save_stats(s)
        print("[INFO] 已达成心愿累计 %d" % s["fulfilled"])
    rebuild_wish_files()
    prune_old_wishes()
    return done


def main():
    load_processed()
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
