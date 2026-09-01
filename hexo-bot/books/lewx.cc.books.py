#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lewx.cc 小说增量爬虫（多线程 + 边爬边更新索引 + 分类拆分索引）
=============================================================

按增量方式抓取 https://www.lewx.cc/shuku.html 中所有小说，
每本小说存为一个 JSON 到 data/ 目录，并生成索引。

特性：
  - 反爬绕过：站点首次访问返回 ckc.js 挑战页，脚本自动读取 data-param1
    并以 cookie 形式带上，后续请求正常返回（页面为 gbk 编码）。
  - 多线程：目录收集与每本书详情抓取均用线程池并发（--workers 可调，默认 10），
    配合全局限速，既提速又不过度打扰站点。
  - 边爬边更新索引（加固点 1）：爬取过程中按固定批次把已抓到的书实时写回索引，
    即便中途中断，索引也只包含「已成功落盘的书」，下次重跑会从断点续跑，
    不会再出现「跑完才写索引、一中断全丢」的问题。
  - 分类拆分索引（加固点 3）：不再生成单个巨大的 index.json，而是生成
    index_meta.json（小，含分类清单/总数/更新时间）+ 每个分类一个
    index_cat_<N>.json。前端按需只加载相关分类，单文件体积大幅下降。
  - 增量（默认）：已存在的非连载中书直接跳过；「连载中书」也会自动复查——
    抓详情页比对章节数，没变则跳过、变了才解析写盘（刷新 crawled_at）。
  - 更新（--update）：对所有已存在的书做章节数 diff 前置。
  - 每本书写盘时记录 crawled_at（UTC 时间戳）。
  - --force 强制重抓全部。
  - 断点续跑：中途中断后重跑即可，只会补齐未完成的书。
  - 镜像：默认把 data/ 下生成/更新的文件同步到站点静态目录
    D:\\hexo\\source\\app_n\\books_data\\，供 books.html 通过 HTTP 读取。
    （用 --no-mirror 可关闭。用 R2 方案时建议 --no-mirror。）

索引文件说明（data/ 下）：
  index_meta.json        小文件：{generated_at, source, total, categories:[{name,file,count}]}
  index_cat_<N>.json    每个分类一个：book 摘要数组（按书名排序）
  <id>.json             每本书完整数据（章节列表 / 正文 content）

用法示例：
  python lewx.cc.books.py                 # 增量抓取全部，边爬边更新索引，生成分类索引并镜像
  python lewx.cc.books.py --workers 8    # 用 8 个线程
  python lewx.cc.books.py --pages 1 3    # 仅抓取书库第 1~3 页
  python lewx.cc.books.py --limit 5      # 本次最多处理 5 本书
  python lewx.cc.books.py --force        # 强制重新抓取所有已存在的书
  python lewx.cc.books.py --update       # 更新章节数有变化的书
  python lewx.cc.books.py --no-chapters  # 只抓书库目录（不抓每本书的章节列表）
  python lewx.cc.books.py --content 824164        # 下载指定书的全文内容
  python lewx.cc.books.py --content all --limit 3 # 下载前 3 本书的全文（示例）
  python lewx.cc.books.py --index-only   # 仅依据现有 data/*.json 重建分类索引
  python lewx.cc.books.py --no-mirror    # 不入镜像目录（R2 方案推荐）
"""

import os
import re
import sys
import json
import time
import argparse
import threading
import urllib.request
import urllib.error
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

# ----------------------------- 配置 -----------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")                 # 主存档：D:\hexo\hexo-bot\books\data
MIRROR_DIR = os.path.normpath(                              # 站点静态目录（供 books.html 读取）
    os.path.join(SCRIPT_DIR, "..", "..", "source", "app_n", "books_data")
)

BASE = "https://www.lewx.cc"
SHUKU_URL = BASE + "/shuku.html"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 30
RETRY = 4               # 单 URL 失败重试次数
WORKERS = 10            # 默认并发线程数（--workers 可覆盖）
MIN_INTERVAL = 0.15     # 全局最小请求间隔（秒），用于礼貌限速；并发上限约 1/MIN_INTERVAL 请求/秒
FLUSH_EVERY = 200       # 每处理多少本书，把内存索引 flush 一次到磁盘（边爬边更新）

# 默认不携带任何 cookie：站点对“过期/写死 cookie”会返回另一种反爬（window.location 重定向），
# 因此首请求保持空 cookie，拿到 ckc.js 挑战页后由脚本自动提取 data-param1 解出真页。
COOKIE = ""

# 线程安全原语
_cookie_lock = threading.Lock()
_rate_lock = threading.Lock()
_last_req = [0.0]


# ----------------------------- 网络 -----------------------------
def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _throttle():
    """全局限速：保证两次请求间隔不小于 MIN_INTERVAL。"""
    with _rate_lock:
        now = time.time()
        delta = MIN_INTERVAL - (now - _last_req[0])
        if delta > 0:
            time.sleep(delta)
        _last_req[0] = time.time()


def fetch_html(url, referer=None, _depth=0):
    """抓取页面并解码为 gbk 文本；自动处理 ckc.js 挑战页。返回 str 或 None。"""
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

    # 命中反爬挑战页（形式一）：ckc.js + data-param1
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

    # 命中反爬挑战页（形式二）：JS 重定向 window.location="/shuku.html?__K=..."（字符串被拆碎混淆）
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
    """主线程预热：触发反爬挑战解析出 cookie，并取回书库首页。"""
    return fetch_html(SHUKU_URL, referer=BASE + "/")


# ----------------------------- 解析：书库列表页 -----------------------------
def get_total_pages(html):
    """从分页“尾页”链接提取总页数，如 /shuku_0_0_0_213.html -> 213。"""
    m = re.search(r'href="/shuku_0_0_0_(\d+)\.html"[^>]*>尾页</a>', html)
    if m:
        return int(m.group(1))
    if re.search(r'href="/book/\d+/"', html):
        return 1
    return 1


def parse_shuku_page(html):
    """解析书库列表页，返回 book 元信息列表。"""
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
            "id": bid,
            "title": title,
            "author": author,
            "author_url": author_url,
            "cover": cover,
            "desc": desc,
            "book_url": BASE + "/book/%s/" % bid,
        })
    return books


# ----------------------------- 解析：书籍详情页 -----------------------------
def parse_book_detail(html, bid):
    """解析书籍详情页：分类/状态/简介/标签 + 全部章节列表。"""
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

    tags = re.findall(r'<a href="/tag/[^"]+"[^>]*>([^<]+)</a>', html)
    tags = [_clean(t) for t in tags]

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
        chapters.append({
            "idx": idx,
            "title": t,
            "cid": cid,
            "url": BASE + href,
        })
    if chapters and chapters[0]["idx"] and chapters[-1]["idx"] and chapters[0]["idx"] > chapters[-1]["idx"]:
        chapters.reverse()

    return {
        "title": title,
        "author": author,
        "author_url": author_url,
        "category": category,
        "status": status,
        "intro": intro,
        "tags": tags,
        "chapters": chapters,
    }


def count_chapters(html, bid):
    """轻量：仅统计书籍详情页的章节链接数（用于增量 diff 前置，不构造完整列表）。"""
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
    """提取章节正文文本（<div id="booktxt"> 内容，<br> 转换行）。"""
    m = re.search(r'<div id="booktxt">(.*?)</div>', html, re.S)
    if not m:
        return ""
    txt = m.group(1)
    txt = re.sub(r"<br\s*/?>", "\n", txt)
    txt = re.sub(r"<[^>]+>", "", txt)
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
    os.makedirs(os.path.dirname(path), exist_ok=True)
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


def make_index_entry(b):
    """从一本书的完整数据生成索引用的精简条目。"""
    return {
        "id": b.get("id"),
        "title": b.get("title"),
        "author": b.get("author"),
        "cover": b.get("cover"),
        "category": (b.get("category") or "").strip() or "未分类",
        "status": b.get("status"),
        "intro": (b.get("intro") or "")[:120],
        "tags": b.get("tags", []),
        "chapter_count": b.get("chapter_count") or len(b.get("chapters", [])),
        "has_content": bool(b.get("content")),
        "book_url": b.get("book_url"),
        "file": "%s.json" % b.get("id"),
        "crawled_at": b.get("crawled_at"),
    }


# ----------------------------- 索引：分类拆分 + 边爬边更新 -----------------------------
class IndexState:
    """线程安全的内存索引，支持边爬边 flush 到磁盘（分类拆分）。"""

    def __init__(self, opts):
        self.opts = opts
        self.books = {}          # bid -> entry
        self.dirty = set()       # 需要重写文件的分类名
        self.lock = threading.Lock()
        self.processed = 0
        self.updated = 0
        self.flushes = 0

    def seed_from_index(self):
        """用已有的索引（meta + 分类文件，或旧的单一 index.json）作为基础，保证跨次运行/中断连续。"""
        meta = load_json(os.path.join(DATA_DIR, "index_meta.json"))
        if meta and isinstance(meta.get("categories"), list):
            for c in meta["categories"]:
                arr = load_json(os.path.join(DATA_DIR, c.get("file", "")))
                if isinstance(arr, list):
                    for e in arr:
                        if e and e.get("id"):
                            self.books[str(e["id"])] = e
            return
        # 兼容：仅有旧的单一 index.json（首次过渡）
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
        """把内存索引写回磁盘（仅重写脏分类 + meta）。调用时需持 self.lock。"""
        self.flushes += 1
        _write_splits(list(self.books.values()), self.opts, dirty_only=True, dirty=self.dirty)
        self.dirty.clear()

    def flush_final(self):
        """爬取结束时的最终 flush（全量重写，并清理残留文件）。"""
        with self.lock:
            _write_splits(list(self.books.values()), self.opts, dirty_only=False)
            _cleanup_stale_splits(list(self.books.values()))
            # 删除旧的单一 index.json（已被分类拆分取代）
            for name in ("index.json",):
                p = os.path.join(DATA_DIR, name)
                if os.path.exists(p):
                    os.remove(p)
                mp = os.path.join(MIRROR_DIR, name)
                if not self.opts.no_mirror and os.path.exists(mp):
                    os.remove(mp)


def _cat_of(e):
    return (e.get("category") or "").strip() or "未分类"


def _write_splits(books, opts, dirty_only=False, dirty=None):
    """生成 index_meta.json + 各 index_cat_<N>.json。

    dirty_only=True 时只重写 dirty 里的分类文件（其余保持不变，加快边爬边更新）；
    meta 始终全量重写（体积小）。
    """
    groups = {}
    for e in books:
        groups.setdefault(_cat_of(e), []).append(e)
    all_cats = sorted(groups.keys())
    cat_meta = []
    for i, c in enumerate(all_cats):
        key = "index_cat_%d" % i
        fname = key + ".json"
        if dirty_only and dirty is not None and c not in dirty:
            # 该分类未变化，仅登记 meta（文件保持原样）
            cat_meta.append({"name": c, "file": fname, "count": len(groups[c])})
            continue
        arr = sorted(groups[c], key=lambda x: (x.get("title") or ""))
        write_json(os.path.join(DATA_DIR, fname), arr)
        if not opts.no_mirror:
            write_json(os.path.join(MIRROR_DIR, fname), arr)
        cat_meta.append({"name": c, "file": fname, "count": len(arr)})
    meta = {
        "generated_at": _now(),
        "source": SHUKU_URL,
        "total": len(books),
        "categories": cat_meta,
    }
    write_json(os.path.join(DATA_DIR, "index_meta.json"), meta)
    if not opts.no_mirror:
        write_json(os.path.join(MIRROR_DIR, "index_meta.json"), meta)


def _cleanup_stale_splits(books):
    """删除不再存在的 index_cat_<N>.json 残留文件。"""
    cats = sorted({_cat_of(e) for e in books})
    valid = set("index_cat_%d.json" % i for i in range(len(cats)))
    for fn in os.listdir(DATA_DIR):
        if fn.startswith("index_cat_") and fn.endswith(".json") and fn not in valid:
            try:
                os.remove(os.path.join(DATA_DIR, fn))
            except OSError:
                pass
            mp = os.path.join(MIRROR_DIR, fn)
            if os.path.exists(mp):
                try:
                    os.remove(mp)
                except OSError:
                    pass


def build_index(opts=None):
    """全量扫描 data/*.json（排除索引文件）生成分类拆分索引。--index-only 也走这里。"""
    opts = opts or argparse.Namespace(no_mirror=False)
    os.makedirs(DATA_DIR, exist_ok=True)
    files = sorted(
        f for f in os.listdir(DATA_DIR)
        if f.endswith(".json") and f != "index.json"
        and not f.startswith("index_cat_") and f != "index_meta.json"
    )
    books = []
    for fn in files:
        b = load_json(os.path.join(DATA_DIR, fn))
        if b:
            books.append(make_index_entry(b))
    _write_splits(books, opts, dirty_only=False)
    _cleanup_stale_splits(books)
    old = os.path.join(DATA_DIR, "index.json")
    if os.path.exists(old):
        os.remove(old)
    if not opts.no_mirror and os.path.exists(os.path.join(MIRROR_DIR, "index.json")):
        os.remove(os.path.join(MIRROR_DIR, "index.json"))
    ncat = len({_cat_of(b) for b in books})
    print("[INFO] 索引已生成：%d 本书 -> index_meta.json + %d 个分类文件" % (len(books), ncat))


# ----------------------------- 主流程 -----------------------------
def crawl(opts):
    os.makedirs(DATA_DIR, exist_ok=True)
    if not opts.no_mirror:
        os.makedirs(MIRROR_DIR, exist_ok=True)

    # 1) 预热 cookie + 确定书库页码范围
    print("[INFO] 预热并解析书库首页...")
    first = warm_up()
    if not first:
        print("[ERROR] 无法抓取书库首页，退出。")
        return
    total = get_total_pages(first)
    print("[INFO] 书库总页数：%d" % total)
    if opts.pages:
        p_start, p_end = opts.pages[0], opts.pages[1]
    else:
        p_start, p_end = 1, total

    # 2) 多线程收集书库目录
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

    # 3) 索引状态：以已有索引为基础（中断续跑连续）
    idx = IndexState(opts)
    idx.seed_from_index()

    # 4) 多线程抓取详情（章节列表）
    print("[INFO] 多线程抓取详情（workers=%d）..." % opts.workers)

    def worker_book(b):
        bid = b["id"]
        path = book_path(bid)
        exist = load_json(path)
        reuse_html = None
        need_write = False

        if not exist:
            need_write = True
        elif opts.force:
            need_write = True
        elif opts.update:
            h = fetch_html(b["book_url"], referer=SHUKU_URL)
            if not h:
                return
            cnt = count_chapters(h, bid)
            local_n = len(exist.get("chapters", []))
            if cnt == local_n:
                return
            reuse_html = h
            need_write = True
        else:
            if exist.get("status") == "连载中":
                h = fetch_html(b["book_url"], referer=SHUKU_URL)
                if not h:
                    return
                cnt = count_chapters(h, bid)
                local_n = len(exist.get("chapters", []))
                if cnt == local_n:
                    return
                reuse_html = h
                need_write = True
            else:
                return

        if not need_write:
            return
        html = reuse_html if reuse_html is not None else fetch_html(b["book_url"], referer=SHUKU_URL)
        if not html:
            return
        detail = parse_book_detail(html, bid)
        book = {
            "id": bid,
            "title": detail["title"] or b["title"],
            "author": detail["author"] or b["author"],
            "author_url": detail["author_url"] or b["author_url"],
            "cover": b["cover"],
            "category": detail["category"],
            "status": detail["status"],
            "intro": detail["intro"] or b["desc"],
            "tags": detail["tags"],
            "book_url": b["book_url"],
            "chapter_count": len(detail["chapters"]),
            "crawled_at": _now(),
            "chapters": detail["chapters"] if not opts.no_chapters else (exist.get("chapters") if exist else []),
            "content": exist.get("content", {}) if exist else {},
        }
        write_json(path, book)
        if not opts.no_mirror:
            write_json(os.path.join(MIRROR_DIR, "%s.json" % bid), book)
        idx.update_entry(bid, book, is_update=bool(exist))

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
    # 5) 最终全量重建索引（保证完整，并清理残留）
    idx.flush_final()
    print("[DONE]")


def download_content(opts):
    """下载指定书（或全部，配合 --limit）的章节全文到对应 book json。"""
    os.makedirs(DATA_DIR, exist_ok=True)
    if opts.content == "all":
        files = sorted(f for f in os.listdir(DATA_DIR) if f.endswith(".json") and f != "index.json"
                       and not f.startswith("index_cat_") and f != "index_meta.json")
        if opts.limit:
            files = files[:opts.limit]
    else:
        files = ["%s.json" % opts.content]

    for fn in files:
        bid = fn[:-5]
        path = book_path(bid)
        book = load_json(path)
        if not book:
            print("[WARN] 未找到 %s，先抓取目录再下载内容。" % fn)
            continue
        chs = book.get("chapters", [])
        content = book.get("content", {}) or {}
        if not chs:
            print("[WARN] %s 无章节列表，跳过（请先不带 --content 跑一次）。" % bid)
            continue
        print("[INFO] 下载《%s》全文，共 %d 章..." % (book.get("title", bid), len(chs)))
        done = 0
        for ch in chs:
            cid = ch["cid"]
            if cid in content and content[cid]:
                continue
            h = fetch_html(ch["url"], referer=book["book_url"])
            if not h:
                print("  [WARN] 章节 %s 抓取失败" % cid)
                continue
            content[cid] = parse_chapter_content(h)
            done += 1
            if done % 50 == 0:
                book["content"] = content
                write_json(path, book)
                if not opts.no_mirror:
                    write_json(os.path.join(MIRROR_DIR, "%s.json" % bid), book)
                print("    ...已下载 %d 章" % done)
        book["content"] = content
        book["content_crawled_at"] = _now()
        write_json(path, book)
        if not opts.no_mirror:
            write_json(os.path.join(MIRROR_DIR, "%s.json" % bid), book)
        print("[INFO] 《%s》全文下载完成：%d/%d 章" % (book.get("title", bid), len(content), len(chs)))
    print("[DONE]")


def main():
    ap = argparse.ArgumentParser(description="lewx.cc 小说增量爬虫（多线程/分类拆分索引）")
    ap.add_argument("--pages", nargs=2, type=int, metavar=("START", "END"),
                    help="只抓取书库第 START~END 页")
    ap.add_argument("--limit", type=int, help="本次最多处理的书数量")
    ap.add_argument("--workers", type=int, default=WORKERS, help="并发线程数（默认 %d）" % WORKERS)
    ap.add_argument("--force", action="store_true", help="强制重抓已存在的书")
    ap.add_argument("--update", action="store_true", help="更新所有书：先比对章节数，变了才重抓详情写盘")
    ap.add_argument("--no-chapters", action="store_true", help="只抓目录，不抓章节列表")
    ap.add_argument("--content", metavar="ID|all", help="下载指定书/全部书的全文内容")
    ap.add_argument("--no-mirror", action="store_true", help="不同步到站点静态目录（R2 方案推荐）")
    ap.add_argument("--index-only", action="store_true", help="仅依据现有数据重建分类索引")
    args = ap.parse_args()

    if args.index_only:
        build_index(args)
        return
    if args.content:
        download_content(args)
        return
    crawl(args)


if __name__ == "__main__":
    main()
