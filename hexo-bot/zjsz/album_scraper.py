# -*- coding: utf-8 -*-
"""
照见苏州 - 微信文章专辑增量爬取脚本
=====================================
用法:
  python album_scraper.py                         # 全量爬取（首次使用）
  python album_scraper.py --incremental            # 增量爬取（每日更新）
  python album_scraper.py --force                  # 强制全部重爬
  python album_scraper.py -i -o D:/path/to/output  # 指定输出目录

爬取策略:
  微信专辑 API 最多返回 20 篇（最旧的），无法拿到最新文章。
  正确做法是从最新文章顺藤摸瓜 ——
  每篇文章的 HTML 中都嵌有 next_article_link，指向下一篇。

  全量首次: 专辑 API 拿基础 20 篇 → 再 follow next_article 抓到最新
  增量模式: 从最新文章开始 follow next_article →
            遇到已存在的文章 → 说明数据完整，立即结束 ✅

输出:
  data.js — 前端数据（var ARTICLE_DATA），按日期倒序（最新在前）
"""

import requests
import json
import re
import time
import os
import sys
import argparse
from functools import cmp_to_key

# ---- 配置 ----
BIZ = "MjM5ODAyNzAxOQ=="
ALBUM_ID = "4531578487815798786"
API_URL = "https://mp.weixin.qq.com/mp/appmsgalbum"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

API_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": f"https://mp.weixin.qq.com/mp/appmsgalbum?__biz={BIZ}&action=getalbum&album_id={ALBUM_ID}",
    "X-Requested-With": "XMLHttpRequest",
    "Accept-Language": "zh-CN,zh;q=0.9",
}

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR_NAME = "zjsz_images"  # 图片存放的子目录名 (相对于 outdir)


def data_js_path(outdir=None):
    """返回 data.js 的完整路径。"""
    d = _resolve_dir(outdir)
    return os.path.join(d, "data.js")


def img_dir_path(outdir=None):
    """返回图片存放目录。"""
    d = _resolve_dir(outdir)
    img_dir = os.path.join(d, IMG_DIR_NAME)
    os.makedirs(img_dir, exist_ok=True)
    return img_dir


def _resolve_dir(outdir=None):
    if outdir:
        d = os.path.abspath(outdir)
    else:
        d = DATA_DIR
    os.makedirs(d, exist_ok=True)
    return d


def log(msg):
    print(f"[album_scraper] {msg}", file=sys.stderr)


# ============================================================
#  图片下载
# ============================================================

def download_image(url: str, msgid: str, outdir: str) -> str:
    """
    下载文章封面图到本地，返回本地相对路径（如 zjsz_images/xxx.jpg）。
    如果已存在则直接返回路径。
    """
    if not url:
        return ""
    img_dir = img_dir_path(outdir)
    # 从 URL 推断扩展名
    ext = ".jpg"
    m = re.search(r"wx_fmt=(\w+)", url)
    if m:
        ext = "." + m.group(1)
    local_name = f"{msgid}{ext}"
    local_path = os.path.join(img_dir, local_name)
    relative_path = f"./{IMG_DIR_NAME}/{local_name}"

    if os.path.exists(local_path):
        return relative_path  # 已存在，跳过

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(resp.content)
            log(f"  图片已下载: {relative_path}")
        else:
            log(f"  图片下载失败 (HTTP {resp.status_code}): {url[:60]}")
            return url  # 下载失败，保留原 URL
    except Exception as e:
        log(f"  图片下载异常: {e}")
        return url

    return relative_path


# ============================================================
#  工具：从 HTML 中提取文章信息 + next_article_link
# ============================================================

def parse_cgi_block(html_text: str) -> tuple:
    """
    从文章 HTML 解析 cgiDataNew JSON 块。
    返回 (block_text, next_url, next_title)
    若找不到 cgiDataNew 则返回 (None, None, None)
    """
    idx = html_text.find("cgiDataNew")
    if idx == -1:
        return None, None, None

    start = html_text.find("{", idx)
    if start == -1:
        return None, None, None

    depth = 0; in_sq = False; in_dq = False; end = start
    for i in range(start, len(html_text)):
        ch = html_text[i]
        if in_sq:
            if ch == "\\": i += 1; continue
            if ch == "'": in_sq = False
        elif in_dq:
            if ch == "\\": i += 1; continue
            if ch == '"': in_dq = False
        else:
            if ch == "'": in_sq = True
            elif ch == '"': in_dq = True
            elif ch == "{": depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0: end = i + 1; break

    block = html_text[start:end]

    m = re.search(r"next_article_link\s*:\s*'([^']*)'", block)
    next_url = m.group(1).replace("\\x26amp;", "&") if m else None
    m = re.search(r"next_article_title\s*:\s*'([^']*)'", block)
    next_title = m.group(1) if m else None

    return block, next_url, next_title


def extract_article(block: str, url: str) -> dict:
    """从 cgiDataNew JSON 块中提取文章字段"""
    def get_val(key):
        p = re.compile(
            r"(?:^|,|\n)\s*" + re.escape(key) +
            r"\s*:\s*'((?:[^'\\]|\\.)*?)'(?:\s*\*\s*\d+)?\s*(?:,|\n|$)",
            re.MULTILINE,
        )
        m = p.search(block)
        if m:
            return m.group(1).replace("\\x0a", "\n").replace("\\n", "\n").replace("\\'", "'")
        return ""

    msgid = ""
    m = re.search(r"mid=(\d+)", url)
    if m:
        msgid = m.group(1)

    # 优先使用 widescreen 原图
    # 1. picture_page_info_list[0].cdn_url（文章轮播原图，widescreen）
    # 2. share_cover.cdn_url（分享封面）
    # 3. cdn_url（最终保底）
    image_url = ""

    # 尝试从 picture_page_info_list 取第一张原图
    m_pic = re.search(
        r"picture_page_info_list\s*:\s*\[\s*(?:\{[^}]*cdn_url\s*:\s*'([^']*)'[^}]*\})",
        block, re.DOTALL
    )
    if m_pic:
        image_url = m_pic.group(1).replace("\\x26amp;", "&").replace("\\x26 ", "&")

    # 尝试从 share_cover 取图
    if not image_url:
        m_share = re.search(
            r"share_cover\s*:\s*\{[^}]*cdn_url\s*:\s*'([^']*)'",
            block, re.DOTALL
        )
        if m_share:
            image_url = m_share.group(1)

    # 保底：用 cdn_url
    if not image_url:
        image_url = get_val("cdn_url")

    return {
        "title": get_val("title"),
        "description": get_val("content_noencode") or get_val("desc"),
        "image_url": image_url,
        "create_time": get_val("create_time"),
        "nick_name": get_val("nick_name") or "苏州日报",
        "msgid": msgid,
        "url": url,
    }


def fetch_page(url: str):
    """请求文章页面，返回 HTML 文本"""
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    return resp.text


# ============================================================
#  核心：从最新文章向前爬（增量模式）
# ============================================================

def crawl_forward_from(start_url: str, known_msgids: set) -> list:
    """
    从 start_url 出发，顺着 next_article_link 一篇篇向前爬。
    遇到已知 msgid → 停止（数据完整）。
    返回新爬取的文章列表（已按时间正序排列）。
    """
    new_articles = []
    current_url = start_url
    known = set(known_msgids)  # 已知 msgid 集合
    step = 0

    while current_url:
        log(f"  读取页面: {current_url[:70]}...")
        try:
            html_text = fetch_page(current_url)
        except Exception as e:
            log(f"  请求失败: {e}")
            break

        block, next_url, next_title = parse_cgi_block(html_text)

        if not next_url or next_url == current_url:
            log(f"  没有下一篇了，已是最新")
            break

        # 提取下一篇的 msgid
        m = re.search(r"mid=(\d+)", next_url)
        next_msgid = m.group(1) if m else ""

        # ★ 核心逻辑：遇到已存在的 → 说明数据已齐全，立即结束
        if next_msgid in known:
            log(f"  下一篇 [{next_title[:20] if next_title else ''}] 已存在 → 数据完整，结束")
            break

        step += 1
        log(f"  [{step}] 发现新文章: {next_title[:25] if next_title else '未知'} (msgid={next_msgid})")
        time.sleep(1.5)

        # 爬取新文章
        try:
            new_html = fetch_page(next_url)
            new_block, _, _ = parse_cgi_block(new_html)
            if new_block:
                article = extract_article(new_block, next_url)
                if article.get("title"):
                    new_articles.append(article)
                    known.add(next_msgid)
                    log(f"    ✓ {article['title'][:30]} ({article.get('create_time', '')})")
                else:
                    raise ValueError("title empty")
            else:
                raise ValueError("no cgi block")
        except Exception:
            # 保底：保留标题和封面
            fallback = {
                "title": next_title or f"文章{next_msgid}",
                "description": "",
                "image_url": "",
                "create_time": "",
                "nick_name": "苏州日报",
                "msgid": next_msgid,
                "url": next_url,
            }
            new_articles.append(fallback)
            known.add(next_msgid)
            log(f"    ⚠ 仅保留标题")

        current_url = next_url

    return new_articles


# ============================================================
#  来源：专辑 API（仅首次全量爬取时使用）
# ============================================================

def fetch_from_album_api() -> list:
    """从专辑 API 获取基础文章列表（最旧的 20 篇）"""
    log("正在获取专辑 API 列表...")
    params = {
        "action": "getalbum",
        "__biz": BIZ,
        "album_id": ALBUM_ID,
        "count": 50,
        "begin": 0,
        "f": "json",
    }
    resp = requests.get(API_URL, params=params, headers=API_HEADERS, timeout=30)
    data = resp.json()
    article_list = data.get("getalbum_resp", {}).get("article_list", [])
    log(f"专辑 API 返回 {len(article_list)} 篇")

    items = []
    for art in article_list:
        url = art.get("url", "")
        msgid = str(art.get("msgid", ""))
        # 尝试直接提取详细信息
        try:
            html_text = fetch_page(url)
            block, _, _ = parse_cgi_block(html_text)
            if block:
                article = extract_article(block, url)
                if article.get("title"):
                    items.append(article)
                    continue
        except Exception:
            pass

        # 保底
        items.append({
            "title": art.get("title", ""),
            "description": "",
            "image_url": art.get("cover_img_first", ""),
            "create_time": art.get("create_time", ""),
            "nick_name": "苏州日报",
            "msgid": msgid,
            "url": url,
        })
        time.sleep(0.5)

    # 找到最新一篇文章的 URL 用于后续 next_article 链
    newest_url = ""
    for art in article_list:
        u = art.get("url", "")
        if u:
            newest_url = u  # API 按时间升序返回，最后一个就是最新的

    return items, newest_url


# ============================================================
#  排序 & 保存
# ============================================================

def sort_articles(articles: list) -> list:
    """按 create_time 倒序排列，无时间排最后"""
    def cmp(a, b):
        ta = a.get("create_time", "") or ""
        tb = b.get("create_time", "") or ""
        if not ta and not tb: return 0
        if not ta: return 1
        if not tb: return -1
        if ta > tb: return -1
        if ta < tb: return 1
        return 0
    articles.sort(key=cmp_to_key(cmp))
    return articles


def save_articles(articles: list, outdir=None):
    """下载图片并写入 data.js"""
    sort_articles(articles)
    outpath = data_js_path(outdir)

    # 下载每篇文章的封面图到本地
    for art in articles:
        if not art.get("image_url"):
            continue
        msgid = art.get("msgid", "")
        if not msgid:
            continue
        # 已经是本地路径则跳过
        if art["image_url"].startswith(f"./{IMG_DIR_NAME}"):
            continue
        local_path = download_image(art["image_url"], msgid, outdir)
        if local_path:
            art["image_url"] = local_path

    # 输出 data.js（去掉 url 字段，前端不需要）
    clean = []
    for art in articles:
        a = {k: v for k, v in art.items() if k != "url"}
        clean.append(a)
    js = "// 照见苏州 - 文章数据\n// 由 album_scraper.py 自动生成\nvar ARTICLE_DATA = " + json.dumps(clean, ensure_ascii=False) + ";\n"
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(js)
    log(f"已保存 {len(clean)} 条数据到 {outpath}")


def get_latest_article_url() -> str:
    """从专辑 API 获取最新文章的 URL（仅用于增量模式起点）"""
    params = {"action": "getalbum", "__biz": BIZ, "album_id": ALBUM_ID, "count": 50, "begin": 0, "f": "json"}
    try:
        resp = requests.get(API_URL, params=params, headers=API_HEADERS, timeout=30)
        data = resp.json()
        article_list = data.get("getalbum_resp", {}).get("article_list", [])
        for art in reversed(article_list):
            u = art.get("url", "")
            if u:
                return u
    except Exception as e:
        log(f"获取专辑 API 最新 URL 失败: {e}")
    return ""


# ============================================================
#  主流程
# ============================================================

def scrape_all(incremental: bool = False, force_content: bool = False, outdir: str = None):
    existing = {} if force_content else load_existing_data(outdir)

    if incremental and existing:
        # ---- 增量模式：只从最新文章向前爬 ----
        log("增量模式：从最新文章向前爬取")
        sorted_arts = sort_articles(list(existing.values()))

        # 找第一篇有 url 的文章作为爬取起点
        newest_url = ""
        newest_title = ""
        newest_time = ""
        for art in sorted_arts:
            u = art.get("url", "")
            if u:
                newest_url = u
                newest_title = art.get("title", "")
                newest_time = art.get("create_time", "")
                break
        if not newest_url:
            log("现有数据无 url 字段，从专辑 API 获取最新文章 URL")
            newest_url = get_latest_article_url()
            if not newest_url:
                log("无法获取起始 URL，降级为全量模式重新构建")
                return scrape_all(incremental=False, force_content=force_content, outdir=outdir)
            newest_title = "(从专辑 API 获取起点)"
            newest_time = ""
        log(f"最新已知: {newest_title[:25]} ({newest_time})")

        known_ids = set(existing.keys())
        new_articles = crawl_forward_from(newest_url, known_ids)

        if not new_articles:
            log("没有新文章，数据已是最新")
            return

        # 合并
        for art in new_articles:
            existing[art["msgid"]] = art
        save_articles(list(existing.values()), outdir)
        log(f"新增 {len(new_articles)} 篇，总计 {len(existing)} 篇 🎉")

    else:
        # ---- 全量模式：专辑 API + next_article 链 ----
        log("全量模式：先通过专辑 API 获取基础数据")
        album_articles, newest_from_api = fetch_from_album_api()
        all_articles = {a["msgid"]: a for a in album_articles}

        if newest_from_api:
            log(f"开始 follow next_article 链获取更新文章...")
            known_ids = set(all_articles.keys())
            new_articles = crawl_forward_from(newest_from_api, known_ids)
            for art in new_articles:
                all_articles[art["msgid"]] = art

        save_articles(list(all_articles.values()), outdir)
        log(f"全量爬取完成！总计 {len(all_articles)} 篇")


# ============================================================
#  加载已有数据
# ============================================================

def load_existing_data(outdir=None) -> dict:
    """从 data.js 加载已有文章，返回 {msgid: article}"""
    result = {}
    inpath = data_js_path(outdir)
    if not os.path.exists(inpath):
        return result
    try:
        with open(inpath, "r", encoding="utf-8") as f:
            js_text = f.read()
        m = re.search(r"var ARTICLE_DATA\s*=\s*(\[.*?\])\s*;", js_text, re.DOTALL)
        if m:
            existing = json.loads(m.group(1))
            for art in existing:
                mid = art.get("msgid", "")
                if mid:
                    result[mid] = art
        log(f"已加载 {len(result)} 条现有数据 (来自 {inpath})")
    except Exception as e:
        log(f"现有数据文件读取失败: {e}")
    return result


# ============================================================
#  CLI 入口
# ============================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="微信文章专辑增量爬取工具")
    parser.add_argument("--incremental", "-i", action="store_true", help="增量：只爬新增")
    parser.add_argument("--force", "-f", action="store_true", help="强制全部重爬")
    parser.add_argument("--outdir", "-o", default=None, help="输出目录（data.js 的存放路径）")
    args = parser.parse_args()
    scrape_all(incremental=args.incremental, force_content=args.force, outdir=args.outdir)
