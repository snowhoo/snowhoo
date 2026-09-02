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
多线程：目录收集 + 书页抓取 + 章节正文均并发（--workers 可调，默认 20），全局限速礼貌。
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


def book_url_of(bid):
    """由书籍 ID 推导详情页地址（不再落盘 book_url 字段）。"""
    return BASE + "/book/%s/" % bid
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TIMEOUT = 30
RETRY = 4               # 单 URL 失败重试次数
WORKERS = 20            # 默认并发线程数
MIN_INTERVAL = 0.02     # 全局最小请求间隔（秒）；章节正文量大，适度放宽
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


def is_bot_page(html):
    """判断页面是否为反爬挑战/跳转页（当前 IP 被限流时，fetch_html 跟随 __K 跳转后仍会拿回这类页）。"""
    if not html:
        return False
    if "ckc.js" in html[:800]:
        return True
    if "<title>Loading</title>" in html:
        return True
    if "window.location" in html and "__K=" in html:
        return True
    return False


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


# 中文数字 → 整数（用于解析"第四千五百二十七章"这类章节名）
_CN_NUM = {'零':0,'一':1,'壹':1,'二':2,'两':2,'贰':2,'三':3,'叁':3,'四':4,'肆':4,
           '五':5,'伍':5,'六':6,'陆':6,'七':7,'柒':7,'八':8,'捌':8,'九':9,'玖':9,
           '十':10,'拾':10,'百':100,'佰':100,'千':1000,'仟':1000,'万':10000,'萬':10000}

def cn2num(s):
    total = 0
    cur = 0
    num = 0
    for ch in s:
        v = _CN_NUM.get(ch)
        if v is None:
            return None
        if v < 10:
            num = v
        elif v < 10000:
            unit = v
            if num == 0:
                num = 1
            cur += num * unit
            num = 0
        else:  # 万
            if num == 0:
                num = 1
            cur += num
            total += cur * 10000
            cur = 0
            num = 0
    total += cur + num
    return total

# ----------------------------- 解析：书籍详情页 -----------------------------
def _iter_chapter_links(html, bid):
    """只遍历详情页 #list 中"非最新章节预览"的区块，按 DOM 顺序产出 (href, cid, title)。
    详情页上半部分是"最新章节"倒序预览（应忽略），下半部分才是正序全本列表。"""
    seg = html
    m = re.search(r'<div id="list">(.*?)</article>', html, re.S)
    if m:
        seg = m.group(1)
    for dl in re.findall(r'<dl\b.*?</dl>', seg, re.S):
        dtm = re.search(r'<dt\b.*?>(.*?)</dt>', dl, re.S)
        dt = _clean(dtm.group(1)) if dtm else ""
        if "最新章节" in dt:        # 跳过"最新章节"倒序预览区
            continue
        for href, cid, t in re.findall(r'href="(/book/%s/(\d+)\.html)"[^>]*>([^<]+)</a>' % bid, dl):
            yield href, cid, t


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
    seen = set()
    chapters = []
    for href, cid, t in _iter_chapter_links(html, bid):
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
        else:
            mxc = re.search(r"第\s*([零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+)\s*章", t)
            if mxc:
                idx = cn2num(mxc.group(1))
        chapters.append({"idx": idx, "title": t, "cid": cid, "url": BASE + href})
    # 注：页面下半部分"全本列表"本身即是正序，保持 DOM 顺序即可，不再按 idx 重排/反转。
    # 上半部分"最新章节"倒序预览区已在 _iter_chapter_links 中跳过。
    return {
        "title": title, "author": author, "author_url": author_url,
        "category": category, "status": status, "intro": intro,
        "tags": tags, "chapters": chapters,
    }


def count_chapters(html, bid):
    seen = set()
    n = 0
    for href, cid, t in _iter_chapter_links(html, bid):
        t = _clean(t)
        if not t or "全本" in t or "小说页" in t:
            continue
        if cid in seen:
            continue
        seen.add(cid)
        n += 1
    return n


# 正文尾部站点注入的广告/提示噪音：命中任一标记即从该处截断（按需在此追加新词）
FOOTER_MARKERS = (
    "下载本站免费小说阅读器",
    "手机浏览器扫码下载本站小说阅读器",
    "随时随地免费看小说",
    "求收藏", "求推荐", "求月票", "求点赞", "求订阅", "求包养", "求鲜花", "求支持",
    "请收藏本站", "请收藏本页", "记住本站", "收藏本站", "收藏本书",
    "本站域名", "本书首发", "手机浏览器",
    "扫码下载", "扫描二维码", "二维码", "下载阅读器", "阅读器下载",
    "如果您觉得", "支持正版阅读", "支持正版",
    "投推荐票", "投月票", "月票支持", "推荐票支持",
    "本章未完", "未完待续", "请关注我们", "关注我们", "微信公众号", "公众号",
    "多多支持", "麻烦大家",
)

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
    # 截断站点注入的尾部广告/提示（命中任一标记即从该处切断）
    cut = len(txt)
    for mk in FOOTER_MARKERS:
        i = txt.find(mk)
        if i != -1 and i < cut:
            cut = i
    if cut < len(txt):
        txt = txt[:cut]
    txt = re.sub(r"if\(isMobile\(\)\)\s*\{.*?\}\s*\"", "", txt, flags=re.S)
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


def build_meta(bid, b, detail):
    cover = b.get("cover") or ""
    if cover.startswith(BASE):                         # 去掉站点固定前缀，改存相对路径
        cover = cover[len(BASE):]
    elif cover.startswith("http://www.lewx.cc"):
        cover = cover[len("http://www.lewx.cc"):]
    return {
        "id": bid,
        "t": detail["title"] or b["title"],
        "a": detail["author"] or b["author"],
        "c": re.sub(r"^类别[：:]\s*", "", (detail["category"] or "").strip()),
        "s": detail["status"] or "",
        "cv": cover,
        "i": (detail["intro"] or b.get("desc") or "")[:300],
        "n": len(detail["chapters"]),
        "hc": False,
        "nc": 0,
        "at": _now(),
    }


def make_index_entry(b):
    return {
        "id": b.get("id"),
        "title": b.get("t"),
        "author": b.get("a"),
        "cover": b.get("cv"),
        "category": (b.get("c") or "").strip() or "未分类",
        "status": b.get("s"),
        "intro": (b.get("i") or "")[:300],
        "chapter_count": b.get("n"),
        "has_content": bool(b.get("hc")),
        "content_chapters": b.get("nc"),
        "crawled_at": b.get("at"),
    }


def entry_to_meta(e):
    """把分类索引里的 verbose 条目还原成内部短键 meta dict，供增量比对复用（不再落盘单书文件）。"""
    if not e:
        return None
    return {
        "id": e.get("id"),
        "t": e.get("title"),
        "a": e.get("author"),
        "c": e.get("category"),
        "s": e.get("status"),
        "cv": e.get("cover"),
        "i": e.get("intro"),
        "n": e.get("chapter_count"),
        "hc": e.get("has_content"),
        "nc": e.get("content_chapters"),
        "at": e.get("crawled_at"),
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
            write_all_book_ids(list(self.books.values()))


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
    # --index-only：依据现有 index_cat_* / index_meta 重建分类索引（已不再有单书 book.json）
    opts = opts or argparse.Namespace(no_mirror=True, toc=False)
    idx = IndexState(opts)
    idx.seed_from_index()
    idx.flush_final()
    print("[INFO] 索引已重建：%d 本书 -> index_meta.json + 分类文件" % len(idx.books))


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


def read_existing_shards(bid):
    """读取已有分片，按章节顺序恢复 [(title, body)] 列表（用于续抓时复用已抓章）。"""
    base = os.path.join(DATA_DIR, bid)
    if not os.path.isdir(base):
        return []
    out = []
    for fn in sorted(os.listdir(base)):
        if not (fn.startswith("c") and fn.endswith(".json")):
            continue
        arr = load_json(os.path.join(base, fn)) or []
        for rec in arr:
            if isinstance(rec, str):
                if "\n" in rec:
                    t, bd = rec.split("\n", 1)
                else:
                    t, bd = rec, ""
                out.append((t, bd))
    return out


# ----------------------------- 按需：单分片抓取 / TOC / id 清单 -----------------------------
def scrape_shard(bid, shard, size=SHARD_SIZE, workers=WORKERS):
    """抓取某书第 shard 个分片(50章)写入 data/<bid>/c{shard:02d}.json。
    返回 (titles, total_chapters) 或 None（抓取失败/被风控）。
    仅写这一个分片文件，不动该书其它分片（区别于 write_content_shards 整体重写）。"""
    html = fetch_html(book_url_of(bid), referer=SHUKU_URL)
    if not html:
        return None
    detail = parse_book_detail(html, bid)
    chaps = detail["chapters"]
    total = len(chaps)
    if total == 0:
        return None
    start = (shard - 1) * size
    window = chaps[start:start + size]
    if not window:
        return None
    texts = fetch_chapter_texts(window, book_url_of(bid), workers)
    base = os.path.join(DATA_DIR, bid)
    os.makedirs(base, exist_ok=True)
    # 同时写出有序标题清单（toc），供前端章节导航；零额外请求（detail 已抓）
    write_json(os.path.join(base, "toc.json"), [c["title"] for c in chaps])
    arr = [(t + "\n" + (body or "")) for (t, body) in texts]
    write_json(os.path.join(base, "c%02d.json" % shard), arr)
    return ([t for t, _ in texts], total)


def build_toc(bid):
    """抓取某书章节标题列表(按列表内部顺序)写入 data/<bid>/toc.json，返回标题数组或 None。"""
    html = fetch_html(book_url_of(bid), referer=SHUKU_URL)
    if not html:
        return None
    detail = parse_book_detail(html, bid)
    titles = [c["title"] for c in detail["chapters"]]
    base = os.path.join(DATA_DIR, bid)
    os.makedirs(base, exist_ok=True)
    write_json(os.path.join(base, "toc.json"), titles)
    return titles


def write_all_book_ids(books):
    """导出全部 book id 列表(扁平数组)到 data/all_book_ids.json，供 Worker 网关校验请求合法性。"""
    ids = sorted({str(e.get("id")) for e in books if e and e.get("id")})
    write_json(os.path.join(DATA_DIR, "all_book_ids.json"), ids)


# ----------------------------- 主流程 -----------------------------
def crawl(opts):
    os.makedirs(DATA_DIR, exist_ok=True)
    print("[INFO] 预热并解析书库首页...")
    first = warm_up()
    if not first:
        print("[ERROR] 无法抓取书库首页（请求失败或被网络拦截），退出。")
        return
    if is_bot_page(first):
        print("[ERROR] 书库首页返回反爬跳转页(__K/ckc.js)，当前 IP 疑似被 lewx.cc 限流。")
        print("        限流期内无法抓取：请稍后（通常数小时）重试，或换网络/IP 后重试。")
        print("        可稍后用 catalog_toc.bat（增量模式，已去掉强制全量）重试验证，或等限流窗口过再跑。")
        sys.exit(1)
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
    if not catalog:
        print("[ERROR] 书库列表解析为 0 本，疑似被反爬限流或返回空壳页，终止本次抓取（不更新数据）。")
        sys.exit(1)
    if opts.limit:
        catalog = catalog[:opts.limit]

    idx = IndexState(opts)
    idx.seed_from_index()
    cap = opts.cap

    print("[INFO] 多线程抓取详情（workers=%d）%s..." % (opts.workers, "（含前 %d 章正文）" % cap if opts.content else ""))

    def worker_book(b):
        bid = b["id"]
        exist_entry = idx.books.get(str(bid))
        exist = entry_to_meta(exist_entry)
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
            # 连载中 或 处于 --content 模式时，都重新核对线上章节数：
            # 这样无论书被标成"完本"还是连载中翻完本，只要线上章数 > 已缓存 nc，都会重抓补齐
            if (exist.get("s") or "") == "连载中" or opts.content:
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

        # 增量时若本地缺 toc.json，也抓一次详情补上章节列表（不抓正文）
        if opts.toc and not need_meta and exist:
            _tbase = os.path.join(DATA_DIR, str(bid))
            if not os.path.exists(os.path.join(_tbase, "toc.json")):
                need_meta = True

        detail = None
        if need_meta:
            html = reuse_html if reuse_html is not None else fetch_html(book_url_of(bid), referer=SHUKU_URL)
            if not html:
                return
            detail = parse_book_detail(html, bid)
            # 风控期 lewx.cc 可能返回"骨架页"（页面能开、但章节列表为空）。
            # toc 模式对"0 章"重试一次，避免把瞬时空窗当成"抓不到"而静默漏抓。
            _retries = 0
            while opts.toc and detail is not None and len(detail["chapters"]) == 0 and _retries < 2:
                time.sleep(MIN_INTERVAL * 3)
                _h2 = fetch_html(book_url_of(bid), referer=SHUKU_URL)
                if not _h2:
                    break
                _d2 = parse_book_detail(_h2, bid)
                detail = _d2
                _retries += 1
                if len(_d2["chapters"]) > 0:
                    break
            meta = build_meta(bid, b, detail)
            meta["at"] = _now()
            if opts.toc:
                # 章节列表（仅标题，不含正文）；详情页已抓，零额外请求
                _titles = [c["title"] for c in detail["chapters"]]
                _base = os.path.join(DATA_DIR, bid)
                os.makedirs(_base, exist_ok=True)   # 无条件建目录，避免"静默什么都不写"
                if _titles:
                    write_json(os.path.join(_base, "toc.json"), _titles)
                else:
                    print("  [WARN] 书 %s 详情页解析到 0 章（疑似骨架页/风控），本趟未写 toc.json" % bid)
        else:
            if not exist:
                return
            meta = dict(exist)
            meta.setdefault("id", bid)

        # hc/nc 以"已缓存状态"为准（need_meta 只更新书目元数据，不清除已抓正文进度）
        # 例外：--force --content 时强制把正文进度归零，整本重抓正文（用于纠正历史上抓错的旧数据）
        force_content = bool(opts.force) and bool(opts.content)
        hc = False if force_content else existing_hc
        nc = 0 if force_content else existing_nc

        if opts.content:
            total_n = int(meta.get("n", 0) or 0)
            target = min(cap, total_n)
            # 分片级续抓：c01.json 存在=前50章已有，c02.json 存在=前100章已有……
            # 只补抓 nc+1 ~ target 章；已存在的分片内容从旧分片读回，不重抓
            if total_n > 0 and nc < target:
                if detail is not None:
                    chaps = detail["chapters"][nc:target]
                else:
                    h2 = fetch_html(book_url_of(bid), referer=SHUKU_URL)
                    if not h2:
                        chaps = []
                    else:
                        chaps = parse_book_detail(h2, bid)["chapters"][nc:target]
                if chaps:
                    existing_texts = read_existing_shards(bid)[:nc] if nc > 0 else []
                    new_texts = fetch_chapter_texts(chaps, book_url_of(bid), opts.workers)
                    all_texts = existing_texts + new_texts
                    write_content_shards(bid, all_texts)
                    hc = True
                    nc = len(all_texts)

        meta["hc"] = hc
        meta["nc"] = nc
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
    ap.add_argument("--toc", action="store_true", help="抓书目同时写出每本书的 toc.json（章节标题列表，不含正文）")
    ap.add_argument("--index-only", action="store_true", help="仅依据现有数据重建分类索引")
    args = ap.parse_args()

    if args.index_only:
        build_index(args)
        return
    crawl(args)


if __name__ == "__main__":
    main()
