#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lewx.cc 小说增量爬虫（多线程 + 边爬边更新索引 + 分类拆分索引 + 正文分片）

数据格式（新）：
  - data/<id>.json        短键元数据：
        {id,t,a,c,s,cv,i,n,hc,nc,tg,at,file,book_url}
        t=标题 a=作者 c=分类 s=状态 cv=封面 i=简介(≤300) n=总章数
        hc=是否有正文(bool) nc=已存正文章数 tg=标签 at=抓取时间
  - data/<id>/cNN.json    正文分片：JSON 数组，每元素 = "章节标题\n正文"，每片 50 章（末片可不足）
  - data/index_meta.json + data/index_cat_<N>.json  分类拆分索引（只含元数据，不含正文/章节列表）

抓取模式：
  - 默认（不带 --content）：只抓元数据（书页 + 章节数），写 book.json + 索引；极快。
  - --content：单遍抓取——抓书页拿章节 url+标题，多线程拉前 --cap 章正文，写分片 + 更新 book.json(hc/nc)。
    与早期“先存章节列表再重读”相比，少一轮抓章节列表的冗余请求。

反爬：站点首访返回 ckc.js 挑战页，脚本自动提取 data-param1 并以 cookie 形式带上（页面 gbk 编码）。
多线程：目录收集 + 书页抓取 + 章节正文均并发（--workers 可调，默认 10），全局限速礼貌。
边爬边更新索引：每 FLUSH_EVERY 本书 flush 一次，中断不丢索引。
增量：已存在非连载中书跳过；连载中书自动复查章节数；--update 全体 diff；--force 全重抓。

用法：
  python lewx.cc.books.py                          # 增量抓元数据
  python lewx.cc.books.py --content --cap 50      # 单遍抓元数据 + 每书前 50 章正文
  python lewx.cc.books.py --workers 8             # 8 线程
  python lewx.cc.books.py --pages 1 3             # 仅第 1~3 页
  python lewx.cc.books.py --limit 5               # 本次最多 5 本
  python lewx.cc.books.py --force                 # 强制重抓
  python lewx.cc.books.py --update                 # 章节数有变的书更新
  python lewx.cc.books.py --index-only             # 仅据现有数据重建分类索引
  python lewx.cc.books.py --no-mirror             # 不同步镜像目录（R2 方案推荐）
"""

import os
import re
import sys
import json
import time
import shutil
import argparse
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# ----------------------------- 配置 -----------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")                 # 主存档
MIRROR_DIR = os.path.normpath(
    os.path.join(SCRIPT_DIR, "..", "..", "source", "app_n", "books_data")
)

BASE = "https://www.lewx.cc"
SHUKU_URL = BASE + "/shuku.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 30
RETRY = 4               # 单 URL 失败重试次数
WORKERS = 10            # 默认并发线程数
MIN_INTERVAL = 0.08     # 全局最小请求间隔（秒）；章节正文量大，适度放宽
SHARD_SIZE = 50         # 每个正文分片包含的章节数
FLUSH_EVERY = 200       # 每处理多少本书 flush 一次索引（边爬边更新）

COOKIE = ""             # 默认不携带 cookie：首请求自动解 ckc.js 挑战

# 线程安全原语
_cookie_lock = threading.Lock()
_rate_lock = threading.Lock()
_last_req = [0.0]


# ----------------------------- 网络 -----------------------------
def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _throttle():
    with _rate_lock:
        now = time.time()
        delta = MIN_INTERVAL - (now - _last_req[0])
        if delta > 0:
            time.sleep(delta)
        _last_req[0] = time.time()


def fetch_html(url, referer=None, _depth=0):
    global COOKIE
    if _depth > RETRY:
        return None
    headers = {
        "User-Agent": UA,
        "Cookie": COOKIE,
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    if referer:
        headers["Referer"] = referer
    _throttle()
    req = urllib.request.Request(url, headers=headers)
    try:
        data = urllib.request.urlopen(req, timeout=TIMEOUT).read()
    except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
        if _depth < RETRY:
            time.sleep(MIN_INTERVAL * 2)
            return fetch_html(url, referer, _depth + 1)
        print("  [WARN] 请求失败 %s : %s" % (url, e))
        return None

    html = data.decode("gbk", "ignore")

    if "<title>Loading</title>" in html or "ckc.js" in html[:600]:
        m = re.search(r'data-param1="([^"]+)"', html)
        if m:
            with _cookie_lock:
                COOKIE = "%s=1" % m.group(1)
            if _depth == 0:
                print("  [INFO] 通过反爬挑战，cookie=%s" % COOKIE)
            time.sleep(0.2)
            return fetch_html(url, referer, _depth + 1)
        return None

    m = re.search(r'window\.location\s*=\s*(.*?);', html, re.S)
    if m and "?__K=" in m.group(1):
        parts = re.findall(r'"([^"]*)"', m.group(1))
        target = "".join(parts)
        if not target.startswith("http"):
            target = BASE + ("" if target.startswith("/") else "/") + target
        if _depth == 0:
            print("  [INFO] 跟随 JS 重定向 -> %s" % target)
        return fetch_html(target, referer, _depth + 1)

    return html


def warm_up():
    return fetch_html(SHUKU_URL, referer=BASE + "/")


# ----------------------------- 解析：书库列表页 -----------------------------
def get_total_pages(html):
    m = re.search(r'href="/shuku_0_0_0_(\d+)\.html"[^>]*>尾页</a>', html)
    if m:
        return int(m.group(1))
    if re.search(r'href="/book/\d+/"', html):
        return 1
    return 1


def parse_shuku_page(html):
    books = []
    items = re.findall(
        r'class="novel-25zvgwfa item">(.*?)<div class="novel-e5wcuyqk clear"></div>',
        html, re.S)
    for it in items:
        mid = re.search(r'href="/book/(\d+)/"', it)
        if not mid:
            continue
        bid = mid.group(1)
        mt = re.search(r'<dt class="novel-gpy0w4s3"><a href="/book/%s/" title="([^"]*)">([^<]*)</a></dt>' % bid, it)
        title = mt.group(1).strip() if mt else ""
        mc = re.search(r'data-original="([^"]+)"', it)
        cover = (BASE + mc.group(1)) if mc and mc.group(1).startswith("/") else (mc.group(1) if mc else "")
        md = re.search(r'<dd class="novel-07vlobt5">([^<]*)</dd>', it)
        desc = _clean(md.group(1)) if md else ""
        ma = re.search(r'class="novel-yl0j91me btm"><a href="(/zuozhe/\d+\.html)"[^>]*>([^<]+)</a>', it)
        author = _clean(ma.group(2)) if ma else ""
        author_url = BASE + ma.group(1) if ma else ""
        books.append({
            "id": bid, "title": title, "author": author, "author_url": author_url,
            "cover": cover, "desc": desc, "book_url": BASE + "/book/%s/" % bid,
        })
    return books


# ----------------------------- 解析：书籍详情页 -----------------------------
def parse_book_detail(html, bid):
    info = {"category": "", "status": "", "intro": "", "tags": [], "chapters": []}
    mh = re.search(r"<h1>(.*?)</h1>", html, re.S)
    title = _clean(mh.group(1)) if mh else ""
    ma = re.search(r'作者：<a href="(/zuozhe/\d+\.html)"[^>]*>([^<]+)</a>', html)
    author = _clean(ma.group(2)) if ma else ""
    author_url = BASE + ma.group(1) if ma else ""
    ms = re.search(r'<p class="sort">([^<]+)</p>', html)
    category = _clean(ms.group(1)) if ms else ""
    mst = re.search(r'状态：([^<]+)</span>', html)
    status = _clean(mst.group(1)) if mst else ""
    mi = re.search(r'class="[^"]*intro[^"]*">(.*?)</div>', html, re.S)
    intro = _clean(mi.group(1)) if mi else ""
    tags = [_clean(t) for t in re.findall(r'<a href="/tag/[^"]+"[^>]*>([^<]+)</a>', html)]
    raw = re.findall(r'href="(/book/%s/(\d+)\.html)"[^>]*>([^<]+)</a>' % bid, html)
    seen = set()
    chapters = []
    for href, cid, t in raw:
        t = _clean(t)
        if not t or "全本" in t or "小说页" in t:
            continue
        if cid in seen:
            continue
        seen.add(cid)
        idx = None
        mxi = re.search(r"第\s*(\d+)\s*章", t)
        if mxi:
            idx = int(mxi.group(1))
        chapters.append({"idx": idx, "title": t, "cid": cid, "url": BASE + href})
    if chapters and chapters[0]["idx"] and chapters[-1]["idx"] and chapters[0]["idx"] > chapters[-1]["idx"]:
        chapters.reverse()
    return {
        "title": title, "author": author, "author_url": author_url,
        "category": category, "status": status, "intro": intro,
        "tags": tags, "chapters": chapters,
    }


def count_chapters(html, bid):
    raw = re.findall(r'href="(/book/%s/(\d+)\.html)"[^>]*>([^<]+)</a>' % bid, html)
    seen = set()
    n = 0
    for href, cid, t in raw:
        t = _clean(t)
        if not t or "全本" in t or "小说页" in t:
            continue
        if cid in seen:
            continue
        seen.add(cid)
        n += 1
    return n


# ----------------------------- 解析：章节正文 -----------------------------
def parse_chapter_content(html):
    m = re.search(r'<div id="booktxt">(.*?)</div>', html, re.S)
    if not m:
        return ""
    txt = m.group(1)
    txt = re.sub(r"<br\s*/?>", "\n", txt)
    txt = re.sub(r"<[^>]+>", "", txt)
    txt = re.sub(r"\.ntp\*?\{[^}]*\}", "", txt)   # 站点防爬注入的裸 CSS 噪音
    txt = re.sub(r"\.ntp;n;}", "", txt)
    txt = _clean(txt)
    return txt.strip()


# ----------------------------- 工具 -----------------------------
def _clean(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    s = s.replace("\r", "").replace("\n", " ").replace("\t", " ")
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


def write_json(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def book_path(bid):
    return os.path.join(DATA_DIR, "%s.json" % bid)


def build_meta(bid, b, detail):
    return {
        "id": bid,
        "t": detail["title"] or b["title"],
        "a": detail["author"] or b["author"],
        "c": (detail["category"] or "").strip(),
        "s": detail["status"] or "",
        "cv": b["cover"],
        "i": (detail["intro"] or b.get("desc") or "")[:300],
        "n": len(detail["chapters"]),
        "hc": False,
        "nc": 0,
        "tg": detail["tags"][:6],
        "at": _now(),
        "file": "%s.json" % bid,
        "book_url": b["book_url"],
    }


def make_index_entry(b):
    return {
        "id": b.get("id"),
        "title": b.get("t"),
        "author": b.get("a"),
        "cover": b.get("cv"),
        "category": (b.get("c") or "").strip() or "未分类",
        "status": b.get("s"),
        "intro": (b.get("i") or "")[:120],
        "tags": b.get("tg", []),
        "chapter_count": b.get("n"),
        "has_content": bool(b.get("hc")),
        "content_chapters": b.get("nc"),
        "book_url": b.get("book_url"),
        "file": b.get("file"),
        "crawled_at": b.get("at"),
    }


# ----------------------------- 索引：分类拆分 + 边爬边更新 -----------------------------
class IndexState:
    def __init__(self, opts):
        self.opts = opts
        self.books = {}
        self.dirty = set()
        self.lock = threading.Lock()
        self.processed = 0
        self.updated = 0
        self.flushes = 0

    def seed_from_index(self):
        meta = load_json(os.path.join(DATA_DIR, "index_meta.json"))
        if meta and isinstance(meta.get("categories"), list):
            for c in meta["categories"]:
                arr = load_json(os.path.join(DATA_DIR, c.get("file", "")))
                if isinstance(arr, list):
                    for e in arr:
                        if e and e.get("id"):
                            self.books[str(e["id"])] = e
            return
        old = load_json(os.path.join(DATA_DIR, "index.json"))
        if old and isinstance(old.get("books"), list):
            for e in old["books"]:
                if e and e.get("id"):
                    self.books[str(e["id"])] = e

    def update_entry(self, bid, book, is_update):
        entry = make_index_entry(book)
        cat = entry["category"]
        with self.lock:
            old = self.books.get(str(bid))
            if old:
                old_cat = (old.get("category") or "").strip() or "未分类"
                if old_cat != cat:
                    self.dirty.add(old_cat)
            self.books[str(bid)] = entry
            self.dirty.add(cat)
            self.processed += 1
            if is_update:
                self.updated += 1
            if self.processed % FLUSH_EVERY == 0:
                self._flush()

    def _flush(self):
        self.flushes += 1
        _write_splits(list(self.books.values()), self.opts, dirty_only=True, dirty=self.dirty)
        self.dirty.clear()

    def flush_final(self):
        with self.lock:
            _write_splits(list(self.books.values()), self.opts, dirty_only=False)
            _cleanup_stale_splits(list(self.books.values()))


def _cat_of(e):
    return (e.get("category") or "").strip() or "未分类"


def _write_splits(books, opts, dirty_only=False, dirty=None):
    groups = {}
    for e in books:
        groups.setdefault(_cat_of(e), []).append(e)
    all_cats = sorted(groups.keys())
    cat_meta = []
    for i, c in enumerate(all_cats):
        fname = "index_cat_%d.json" % i
        if dirty_only and dirty is not None and c not in dirty:
            cat_meta.append({"name": c, "file": fname, "count": len(groups[c])})
            continue
        arr = sorted(groups[c], key=lambda x: (x.get("title") or ""))
        write_json(os.path.join(DATA_DIR, fname), arr)
        cat_meta.append({"name": c, "file": fname, "count": len(arr)})
    meta = {
        "generated_at": _now(),
        "source": SHUKU_URL,
        "total": len(books),
        "categories": cat_meta,
    }
    write_json(os.path.join(DATA_DIR, "index_meta.json"), meta)


def _cleanup_stale_splits(books):
    cats = sorted({_cat_of(e) for e in books})
    valid = set("index_cat_%d.json" % i for i in range(len(cats)))
    for fn in os.listdir(DATA_DIR):
        if fn.startswith("index_cat_") and fn.endswith(".json") and fn not in valid:
            try:
                os.remove(os.path.join(DATA_DIR, fn))
            except OSError:
                pass


def build_index(opts=None):
    opts = opts or argparse.Namespace(no_mirror=True)
    os.makedirs(DATA_DIR, exist_ok=True)
    files = sorted(
        f for f in os.listdir(DATA_DIR)
        if f.endswith(".json") and not f.startswith("index_cat_") and f != "index_meta.json"
        and not os.path.isdir(os.path.join(DATA_DIR, f[:-5]))
    )
    books = []
    for fn in files:
        b = load_json(os.path.join(DATA_DIR, fn))
        if b:
            books.append(make_index_entry(b))
    _write_splits(books, opts, dirty_only=False)
    _cleanup_stale_splits(books)
    print("[INFO] 索引已生成：%d 本书 -> index_meta.json + %d 个分类文件" % (len(books), len({_cat_of(b) for b in books})))


# ----------------------------- 正文：分片写入 -----------------------------
def fetch_chapter_texts(chaps, referer, workers):
    """多线程拉章节正文，返回与 chaps 同序的 [(title, body), ...]。"""
    tmp = {}

    def worker(i, ch):
        h = fetch_html(ch["url"], referer=referer)
        body = parse_chapter_content(h) if h else ""
        return (i, ch["title"], body)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futs = [ex.submit(worker, i, ch) for i, ch in enumerate(chaps)]
        for fut in as_completed(futs):
            i, title, body = fut.result()
            tmp[i] = (title, body)
    return [tmp[i] for i in range(len(chaps))]


def write_content_shards(bid, texts):
    """把 [(title, body)] 按 SHARD_SIZE 切成 data/<id>/cNN.json。"""
    base = os.path.join(DATA_DIR, bid)
    if os.path.isdir(base):
        shutil.rmtree(base)
    os.makedirs(base, exist_ok=True)
    for i in range(0, len(texts), SHARD_SIZE):
        chunk = texts[i:i + SHARD_SIZE]
        arr = [(t + "\n" + (body or "")) for (t, body) in chunk]
        fn = os.path.join(base, "c%02d.json" % (i // SHARD_SIZE + 1))
        write_json(fn, arr)


# ----------------------------- 主流程 -----------------------------
def crawl(opts):
    os.makedirs(DATA_DIR, exist_ok=True)
    print("[INFO] 预热并解析书库首页...")
    first = warm_up()
    if not first:
        print("[ERROR] 无法抓取书库首页，退出。")
        return
    total = get_total_pages(first)
    print("[INFO] 书库总页数：%d" % total)
    p_start, p_end = (opts.pages[0], opts.pages[1]) if opts.pages else (1, total)

    print("[INFO] 多线程收集书库列表（第 %d~%d 页，workers=%d）..." % (p_start, p_end, opts.workers))
    catalog = []
    seen_ids = set()
    seen_lock = threading.Lock()

    def worker_page(p):
        url = SHUKU_URL if p == 1 else "%s/shuku_0_0_0_%d.html" % (BASE, p)
        h = fetch_html(url, referer=SHUKU_URL)
        return parse_shuku_page(h) if h else []

    with ThreadPoolExecutor(max_workers=opts.workers) as ex:
        futs = [ex.submit(worker_page, p) for p in range(p_start, p_end + 1)]
        for f in as_completed(futs):
            for b in f.result():
                with seen_lock:
                    if b["id"] in seen_ids:
                        continue
                    seen_ids.add(b["id"])
                    catalog.append(b)
    print("[INFO] 书库列表共收集到 %d 本书" % len(catalog))
    if opts.limit:
        catalog = catalog[:opts.limit]

    idx = IndexState(opts)
    idx.seed_from_index()
    cap = opts.cap

    print("[INFO] 多线程抓取详情（workers=%d）%s..." % (opts.workers, "（含前 %d 章正文）" % cap if opts.content else ""))

    def worker_book(b):
        bid = b["id"]
        path = book_path(bid)
        exist = load_json(path)
        existing_hc = bool(exist.get("hc")) if exist else False
        existing_nc = int(exist.get("nc", 0) or 0) if exist else 0
        need_meta = False
        reuse_html = None

        if not exist:
            need_meta = True
        elif opts.force:
            need_meta = True
        elif opts.update:
            h = fetch_html(b["book_url"], referer=SHUKU_URL)
            if not h:
                return
            cnt = count_chapters(h, bid)
            if cnt == int(exist.get("n", 0) or 0):
                need_meta = False
            else:
                reuse_html = h
                need_meta = True
        else:
            if (exist.get("s") or "") == "连载中":
                h = fetch_html(b["book_url"], referer=SHUKU_URL)
                if not h:
                    return
                cnt = count_chapters(h, bid)
                if cnt == int(exist.get("n", 0) or 0):
                    need_meta = False
                else:
                    reuse_html = h
                    need_meta = True
            else:
                need_meta = False

        detail = None
        if need_meta:
            html = reuse_html if reuse_html is not None else fetch_html(b["book_url"], referer=SHUKU_URL)
            if not html:
                return
            detail = parse_book_detail(html, bid)
            meta = build_meta(bid, b, detail)
            meta["at"] = _now()
        else:
            if not exist:
                return
            meta = dict(exist)
            meta.setdefault("id", bid)
            meta.setdefault("file", "%s.json" % bid)
            meta.setdefault("book_url", b["book_url"])

        hc = existing_hc if not need_meta else False
        nc = existing_nc if not need_meta else 0

        if opts.content:
            total_n = int(meta.get("n", 0) or 0)
            need_content = (not hc) or (nc < min(cap, total_n))
            if need_content and total_n > 0:
                if detail is not None:
                    chaps = detail["chapters"][:cap]
                else:
                    h2 = fetch_html(b["book_url"], referer=SHUKU_URL)
                    if not h2:
                        chaps = []
                    else:
                        chaps = parse_book_detail(h2, bid)["chapters"][:cap]
                if chaps:
                    texts = fetch_chapter_texts(chaps, b["book_url"], opts.workers)
                    write_content_shards(bid, texts)
                    hc = True
                    nc = len(texts)
                    meta["content_crawled_at"] = _now()

        meta["hc"] = hc
        meta["nc"] = nc
        write_json(path, meta)
        idx.update_entry(bid, meta, is_update=bool(exist))

    with ThreadPoolExecutor(max_workers=opts.workers) as ex:
        futs = [ex.submit(worker_book, b) for b in catalog]
        done = 0
        for f in as_completed(futs):
            try:
                f.result()
            except Exception as e:
                print("  [WARN] 书处理异常: %s" % e)
            done += 1
            if done % 200 == 0 or done == len(catalog):
                print("  [进度] 已提交 %d / %d (%.1f%%)" % (done, len(catalog), done * 100.0 / len(catalog)))

    print("[INFO] 本趟处理 %d 本（其中更新 %d 本）" % (idx.processed, idx.updated))
    idx.flush_final()
    print("[DONE]")


def main():
    ap = argparse.ArgumentParser(description="lewx.cc 小说增量爬虫（多线程/分类拆分索引/正文分片）")
    ap.add_argument("--pages", nargs=2, type=int, metavar=("START", "END"), help="只抓取书库第 START~END 页")
    ap.add_argument("--limit", type=int, help="本次最多处理的书数量")
    ap.add_argument("--workers", type=int, default=WORKERS, help="并发线程数（默认 %d）" % WORKERS)
    ap.add_argument("--force", action="store_true", help="强制重抓已存在的书")
    ap.add_argument("--update", action="store_true", help="更新所有书：先比对章节数，变了才重抓")
    ap.add_argument("--content", action="store_true", help="单遍抓取每本书前 --cap 章正文（写入 <id>/cNN.json 分片）")
    ap.add_argument("--cap", type=int, default=SHARD_SIZE, help="--content 时每本书最多抓多少章（默认 %d）" % SHARD_SIZE)
    ap.add_argument("--no-mirror", action="store_true", help="不同步到站点静态目录（R2 方案推荐）")
    ap.add_argument("--index-only", action="store_true", help="仅依据现有数据重建分类索引")
    args = ap.parse_args()

    if args.index_only:
        build_index(args)
        return
    crawl(args)


if __name__ == "__main__":
    main()
