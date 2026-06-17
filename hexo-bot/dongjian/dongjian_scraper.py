# -*- coding: utf-8 -*-
"""
洞见 - 微信公众号文章爬取脚本
===================================
用法:
  python dongjian_scraper.py                         # 全量爬取（首次使用）
  python dongjian_scraper.py --incremental            # 增量爬取（每日更新）
  python dongjian_scraper.py --force                  # 强制全部重爬
  python dongjian_scraper.py -i -o D:/path/to/output  # 指定输出目录

爬取策略:
  通过第三方聚合站点 jintiankansha.com 获取洞见公众号的文章列表。

输出:
  dongjian.js — 前端数据（var DONGJIAN_DATA），按日期倒序（最新在前）
"""

import requests
import json
import re
import time
import os
import sys
import argparse
from datetime import datetime, timedelta
from functools import cmp_to_key
from urllib.parse import unquote

# ---- 配置 ----
BIZ = "MjM5MDc0NTY2OA=="
ACCOUNT_NAME = "洞见"
ACCOUNT_DESC = "不是每一种观点，都可以叫洞见"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
}

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR_NAME = "dongjian_images"
OUTPUT_JS_NAME = "dongjian.js"
JS_VAR_NAME = "DONGJIAN_DATA"

JTK_COLUMN_URL = "https://www.jintiankansha.com/column/zO3ulKaXOS"
JTK_ARTICLE_PREFIX = "http://www.jintiankansha.com/t/"


def data_js_path(outdir=None):
    d = _resolve_dir(outdir)
    return os.path.join(d, OUTPUT_JS_NAME)


def img_dir_path(outdir=None):
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
    print(f"[dongjian_scraper] {msg}", file=sys.stderr)


# ============================================================
#  时间解析
# ============================================================

def parse_relative_time(rel_text: str) -> str:
    """将相对时间（如'20 小时前'、'3 天前'）转为绝对时间字符串"""
    now = datetime.now()
    rel_text = rel_text.strip()
    
    if '分钟' in rel_text:
        m = re.search(r'(\d+)', rel_text)
        if m:
            minutes = int(m.group(1))
            dt = now - timedelta(minutes=minutes)
            return dt.strftime("%Y-%m-%d %H:%M")
    elif '小时' in rel_text:
        m = re.search(r'(\d+)', rel_text)
        if m:
            hours = int(m.group(1))
            dt = now - timedelta(hours=hours)
            return dt.strftime("%Y-%m-%d %H:%M")
    elif '天' in rel_text:
        m = re.search(r'(\d+)', rel_text)
        if m:
            days = int(m.group(1))
            dt = now - timedelta(days=days)
            return dt.strftime("%Y-%m-%d %H:%M")
    elif '昨天' in rel_text:
        dt = now - timedelta(days=1)
        return dt.strftime("%Y-%m-%d") + " 20:20"
    elif '前天' in rel_text:
        dt = now - timedelta(days=2)
        return dt.strftime("%Y-%m-%d") + " 20:20"
    
    return ""


def parse_exact_time(text: str) -> str:
    """从文本中提取精确时间"""
    m = re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', text)
    if m:
        return m.group(1)
    return ""


# ============================================================
#  文章列表抓取
# ============================================================

def fetch_article_list(max_pages=10) -> list:
    """
    从 jintiankansha.com 洞见专栏抓取文章列表。
    每页约 20 篇，按时间倒序排列。
    """
    log(f"正在从 jintiankansha 获取洞见文章列表...")
    all_articles = []

    for page in range(1, max_pages + 1):
        url = JTK_COLUMN_URL if page == 1 else f"{JTK_COLUMN_URL}?page={page}"
        log(f"  获取第 {page} 页: {url}")
        
        try:
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.encoding = "utf-8"
            html = resp.text

            articles = parse_jtk_page(html)
            if not articles:
                log(f"  第 {page} 页没有文章，翻页结束")
                break

            all_articles.extend(articles)
            log(f"  第 {page} 页: {len(articles)} 篇")

            # 检查是否有下一页
            if not has_next_page(html):
                break

            time.sleep(1)
        except Exception as e:
            log(f"  第 {page} 页失败: {e}")
            break

    log(f"总计获取 {len(all_articles)} 篇")
    return all_articles


def parse_jtk_page(html: str) -> list:
    """
    解析 jintiankansha 页面中的文章卡片列表。
    结构: <div class="cell item"> 包含一个 <table>，其中有图片、标题、时间等。
    """
    articles = []
    items = html.split('<div class="cell item">')
    
    for item in items:
        # 跳过广告项（没有文章链接的）
        if 'jintiankansha.com/t/' not in item:
            continue
        
        # 提取链接和标题
        link_m = re.search(r'href="(http://www\.jintiankansha\.com/t/([^"/?]+))"[^>]*>([^<]{5,})</a>', item)
        if not link_m:
            continue
        
        full_url = link_m.group(1)
        short_id = link_m.group(2)
        title = link_m.group(3).strip()
        
        if len(title) < 5:
            continue
        
        # 提取封面图片 URL
        img_m = re.search(r'<img[^>]*src="([^"]*mmbiz[^"]*)"', item)
        image_url = img_m.group(1) if img_m else ""
        
        # 提取发布时间（相对时间）
        time_text = ""
        rel_m = re.search(r'(\d+\s*(?:天|小时|分钟)\s*前)', item)
        if rel_m:
            time_text = parse_relative_time(rel_m.group(1))
        elif '昨天' in item:
            time_text = parse_relative_time('昨天')
        elif '前天' in item:
            time_text = parse_relative_time('前天')
        
        # 提取描述（通过内容摘要行）
        desc = ""
        
        article = {
            "title": title,
            "url": full_url,
            "image_url": image_url,
            "create_time": time_text,
            "nick_name": ACCOUNT_NAME,
            "description": desc,
            "msgid": f"jtk_{short_id}",
        }
        articles.append(article)
    
    return articles


def has_next_page(html: str) -> bool:
    """检测是否有下一页"""
    # 查找"下一页"链接
    if '下一页' in html:
        next_idx = html.find('下一页')
        # 检查前后是否有 disabled 样式
        before = html[max(0, next_idx - 200):next_idx]
        if 'disabled' not in before:
            return True
    return False


# ============================================================
#  文章详情（获取精确时间和描述）
# ============================================================

def fetch_article_detail(url: str) -> tuple:
    """
    从文章详情页获取精确时间和描述。
    返回 (exact_time, description)
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        html = resp.text
        
        # 精确时间
        exact_time = parse_exact_time(html)
        
        # 描述（文章正文前几段）
        desc = ""
        # jintiankansha 的文章正文在特定结构中
        # 查找文章内容区域
        content_patterns = [
            r'<div[^>]*class="[^"]*topic_content[^"]*"[^>]*>(.*?)</div>',
            r'<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)</div>',
            r'<article[^>]*>(.*?)</article>',
        ]
        for pat in content_patterns:
            m = re.search(pat, html, re.DOTALL)
            if m:
                text = re.sub(r'<[^>]+>', '', m.group(1))
                text = re.sub(r'\s+', ' ', text).strip()
                # 过滤掉太短的和广告内容
                if len(text) > 30 and '广告' not in text[:20]:
                    desc = text[:300]
                    break
        
        return exact_time, desc
    except Exception as e:
        log(f"  详情获取失败: {e}")
        return "", ""


# ============================================================
#  图片下载
# ============================================================

def download_image(url: str, msgid: str, outdir: str) -> str:
    if not url:
        return ""
    img_dir = img_dir_path(outdir)
    
    ext = ".jpg"
    m = re.search(r"wx_fmt=(\w+)", url)
    if m:
        ext = "." + m.group(1)
    
    local_name = f"{msgid}{ext}"
    local_path = os.path.join(img_dir, local_name)
    relative_path = f"./{IMG_DIR_NAME}/{local_name}"

    if os.path.exists(local_path):
        return relative_path

    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            with open(local_path, "wb") as f:
                f.write(resp.content)
            log(f"  图片已下载: {relative_path}")
        else:
            log(f"  图片下载失败 (HTTP {resp.status_code}): {url[:60]}")
            return url
    except Exception as e:
        log(f"  图片下载异常: {e}")
        return url

    return relative_path


# ============================================================
#  排序 & 保存
# ============================================================

def sort_articles(articles: list) -> list:
    """按 create_time 倒序排列"""
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
    """下载图片并写入 dongjian.js"""
    sort_articles(articles)
    outpath = data_js_path(outdir)

    for art in articles:
        img_url = art.get("image_url", "")
        if not img_url:
            continue
        msgid = art.get("msgid", "")
        if not msgid:
            continue
        if img_url.startswith(f"./{IMG_DIR_NAME}"):
            continue
        local_path = download_image(img_url, msgid, outdir)
        if local_path:
            art["image_url"] = local_path

    clean = []
    for art in articles:
        a = {
            "title": art.get("title", ""),
            "description": art.get("description", ""),
            "image_url": art.get("image_url", ""),
            "create_time": art.get("create_time", ""),
            "nick_name": art.get("nick_name", ACCOUNT_NAME),
            "msgid": art.get("msgid", ""),
        }
        clean.append(a)

    js = (
        f"// {ACCOUNT_NAME} - 文章数据\n"
        f"// 由 dongjian_scraper.py 自动生成\n"
        f"// 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
        f"var {JS_VAR_NAME} = " + json.dumps(clean, ensure_ascii=False) + ";\n"
    )
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(js)
    log(f"已保存 {len(articles)} 条数据到 {outpath}")


# ============================================================
#  加载已有数据
# ============================================================

def load_existing_data(outdir=None) -> dict:
    result = {}
    inpath = data_js_path(outdir)
    if not os.path.exists(inpath):
        return result
    try:
        with open(inpath, "r", encoding="utf-8") as f:
            js_text = f.read()
        m = re.search(rf"var {re.escape(JS_VAR_NAME)}\s*=\s*(\[.*?\])\s*;", js_text, re.DOTALL)
        if m:
            existing = json.loads(m.group(1))
            for art in existing:
                mid = art.get("msgid", "")
                if mid:
                    result[mid] = art
        log(f"已加载 {len(result)} 条现有数据")
    except Exception as e:
        log(f"现有数据文件读取失败: {e}")
    return result


# ============================================================
#  主流程
# ============================================================

def scrape_all(incremental: bool = False, force_content: bool = False, outdir: str = None):
    existing = {} if force_content else load_existing_data(outdir)

    # 获取文章列表
    jtk_articles = fetch_article_list(max_pages=10)
    if not jtk_articles:
        log("未能获取到任何文章数据！")
        return

    if incremental and existing:
        # 增量模式
        new_count = 0
        known_ids = set(existing.keys())
        for art in jtk_articles:
            mid = art["msgid"]
            if mid not in known_ids:
                existing[mid] = art
                new_count += 1

        if new_count == 0:
            log("没有新文章，数据已是最新 ✅")
            return

        # 获取新文章的详请
        log(f"发现 {new_count} 篇新文章")
        for art in existing.values():
            if not art.get("description") and art.get("url"):
                mid = art.get("msgid", "")
                if mid not in known_ids or not existing[mid].get("description"):
                    exact_time, desc = fetch_article_detail(art["url"])
                    if exact_time:
                        art["create_time"] = exact_time
                    if desc:
                        art["description"] = desc
                    time.sleep(0.5)

        save_articles(list(existing.values()), outdir)
        log(f"新增 {new_count} 篇，总计 {len(existing)} 篇 🎉")
    else:
        # 全量模式 - 用 dict 去重
        all_articles = {}
        for art in jtk_articles:
            all_articles[art["msgid"]] = art

        # 获取前 10 篇文章的精确时间和描述
        log("获取文章详情（精确时间+描述）...")
        count = 0
        keys = list(all_articles.keys())[:10]
        for mid in keys:
            art = all_articles[mid]
            if art.get("url"):
                exact_time, desc = fetch_article_detail(art["url"])
                if exact_time:
                    art["create_time"] = exact_time
                if desc:
                    art["description"] = desc
                count += 1
                log(f"  [{count}] 已获取: {art['title'][:25]}")
                time.sleep(0.5)

        save_articles(list(all_articles.values()), outdir)
        log(f"全量爬取完成！总计 {len(all_articles)} 篇")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=f"{ACCOUNT_NAME} 微信公众号文章爬取工具")
    parser.add_argument("--incremental", "-i", action="store_true", help="增量：只爬新增")
    parser.add_argument("--force", "-f", action="store_true", help="强制全部重爬")
    parser.add_argument("--outdir", "-o", default=None, help=f"输出目录")
    args = parser.parse_args()
    scrape_all(incremental=args.incremental, force_content=args.force, outdir=args.outdir)
