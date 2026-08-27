# -*- coding: utf-8 -*-
"""
洞见 - 微信公众号文章爬取脚本
================================
参考 yedu 的 peopleapp 抓取模式，洞见使用 jintiankansha 作为数据源。
需要 WeChat Cookie 才能提取音频，否则仅爬取文章元数据。

用法:
  python dongjian_scraper.py                         # 全量爬取
  python dongjian_scraper.py --incremental            # 增量更新
  python dongjian_scraper.py --cookies cookies.txt    # 带Cookie提取音频

Cookie 格式（每行一个）:
  mp.weixin.qq.com	TRUE	/	FALSE	1748712510	key	value
  可用 Chrome 插件 EditThisCookie 导出
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
from http.cookiejar import MozillaCookieJar

BIZ = "MjM5MDc0NTY2OA=="
ACCOUNT_NAME = "洞见"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR_NAME = "dongjian_images"
OUTPUT_JS_NAME = "dongjian.js"
JS_VAR_NAME = "DONGJIAN_DATA"
JTK_COLUMN_URL = "https://www.jintiankansha.com/column/zO3ulKaXOS"


class DongjianScraper:
    def __init__(self, outdir=None, cookie_file=None):
        self.outdir = outdir or DATA_DIR
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.cookie_file = cookie_file
        self._load_cookies()

    def _load_cookies(self):
        """加载 Cookie 文件（用于访问微信文章）"""
        if self.cookie_file and os.path.exists(self.cookie_file):
            try:
                jar = MozillaCookieJar(self.cookie_file)
                jar.load()
                self.session.cookies.update(jar)
                log(f"已加载 Cookie: {self.cookie_file}")
            except Exception as e:
                log(f"Cookie 加载失败: {e}")

    def data_js_path(self):
        os.makedirs(self.outdir, exist_ok=True)
        return os.path.join(self.outdir, OUTPUT_JS_NAME)

    def img_dir_path(self):
        d = os.path.join(self.outdir, IMG_DIR_NAME)
        os.makedirs(d, exist_ok=True)
        return d

    # ---- 时间 ----
    def parse_rel_time(self, text):
        now = datetime.now()
        if '分钟' in text:
            m = re.search(r'(\d+)', text)
            if m: return (now - timedelta(minutes=int(m.group(1)))).strftime("%Y-%m-%d %H:%M")
        elif '小时' in text:
            m = re.search(r'(\d+)', text)
            if m: return (now - timedelta(hours=int(m.group(1)))).strftime("%Y-%m-%d %H:%M")
        elif '天' in text:
            m = re.search(r'(\d+)', text)
            if m: return (now - timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d %H:%M")
        elif '昨天' in text: return (now - timedelta(days=1)).strftime("%Y-%m-%d") + " 20:20"
        elif '前天' in text: return (now - timedelta(days=2)).strftime("%Y-%m-%d") + " 20:20"
        return ""

    # ---- 从 jintiankansha 抓取列表 ----
    def fetch_list(self, max_pages=10):
        log(f"从 jintiankansha 获取文章列表...")
        articles = []
        for page in range(1, max_pages + 1):
            url = JTK_COLUMN_URL if page == 1 else f"{JTK_COLUMN_URL}?page={page}"
            try:
                r = self.session.get(url, timeout=30)
                r.encoding = "utf-8"
                html = r.text
                items = html.split('<div class="cell item">')
                count = 0
                for item in items:
                    if 'jintiankansha.com/t/' not in item: continue
                    m = re.search(r'href="(http://www\.jintiankansha\.com/t/([^"/?]+))"[^>]*>([^<]{5,})</a>', item)
                    if not m: continue
                    articles.append({
                        "title": m.group(3).strip(),
                        "url": m.group(1),
                        "msgid": f"jtk_{m.group(2)}",
                        "image_url": (re.search(r'<img[^>]*src="([^"]*mmbiz[^"]*)"', item) or [None, ""]).group(1),
                        "create_time": self.parse_rel_time((re.search(r'(\d+\s*(?:天|小时|分钟)\s*前)', item) or [None, ""]).group(0)) if re.search(r'(\d+\s*(?:天|小时|分钟)\s*前)', item) else (self.parse_rel_time('昨天') if '昨天' in item else self.parse_rel_time('前天') if '前天' in item else ""),
                        "description": "",
                        "nick_name": ACCOUNT_NAME,
                        "audio_url": "",
                        "audio_name": "",
                    })
                    count += 1
                log(f"  第 {page} 页: {count} 篇")
                if '下一页' not in html or 'disabled' in html[max(0, html.find('下一页')-200):html.find('下一页')]: break
                time.sleep(0.5)
            except Exception as e:
                log(f"  第 {page} 页失败: {e}")
                break
        log(f"总计 {len(articles)} 篇")
        return articles

    # ---- 音频提取（从 jintiankansha 或微信原文） ----
    def fetch_audio(self, jtk_url):
        """尝试从文章页面提取音频"""
        try:
            r = self.session.get(jtk_url, timeout=30)
            r.encoding = "utf-8"
            html = r.text
            audio_src, audio_name = "", ""
            for fid in re.findall(r'voice_encode_fileid="([^"]+)"', html):
                audio_src = f"https://res.wx.qq.com/voice/getvoice?mediaid={fid}"
            if not audio_src:
                m = re.search(r'<audio[^>]*src="([^"]+)"', html)
                if m: audio_src = m.group(1)
            m = re.search(r'<mp-common-mpaudio[^>]*name="([^"]+)"', html)
            if m: audio_name = m.group(1)
            et = (re.search(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', html) or [None, ""]).group(1)
            desc = ""
            for pat in [r'<div[^>]*class="[^"]*topic_content[^"]*"[^>]*>(.*?)</div>',
                         r'<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)</div>']:
                m = re.search(pat, html, re.DOTALL)
                if m:
                    t = re.sub(r'<[^>]+>', '', m.group(1))
                    t = re.sub(r'\s+', ' ', t).strip()
                    if len(t) > 30: desc = t[:300]; break
            return audio_src, audio_name, et or "", desc
        except Exception as e:
            return "", "", "", ""

    # ---- 图片下载 ----
    def dl_img(self, url, msgid):
        if not url: return ""
        d = self.img_dir_path()
        ext = (re.search(r"wx_fmt=(\w+)", url) or [None, ".jpg"]).group(1) or "jpg"
        fn = f"{msgid}.{ext}"
        lp = os.path.join(d, fn)
        rp = f"./{IMG_DIR_NAME}/{fn}"
        if os.path.exists(lp): return rp
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                with open(lp, "wb") as f: f.write(r.content)
        except: return url
        return rp

    # ---- 保存 ----
    def save(self, articles):
        def cmp(a, b):
            ta, tb = a.get("create_time","") or "", b.get("create_time","") or ""
            if not ta and not tb: return 0
            if not ta: return 1
            if not tb: return -1
            return -1 if ta > tb else 1 if ta < tb else 0
        articles.sort(key=cmp_to_key(cmp))
        for art in articles:
            i = art.get("image_url","")
            if i and not i.startswith(f"./{IMG_DIR_NAME}"):
                l = self.dl_img(i, art.get("msgid",""))
                if l: art["image_url"] = l
        js = (
            f"// {ACCOUNT_NAME} - 文章数据\n"
            f"// 由 dongjian_scraper.py 生成\n"
            f"// {datetime.now().strftime('%Y-%m-%d %H:%M')}\n"
            f"var {JS_VAR_NAME} = " +
            json.dumps(articles, ensure_ascii=False) + ";\n"
        )
        with open(self.data_js_path(), "w", encoding="utf-8") as f: f.write(js)
        log(f"保存 {len(articles)} 条")

    def load_existing(self):
        p = self.data_js_path()
        if not os.path.exists(p): return {}
        try:
            with open(p, encoding="utf-8") as f: t = f.read()
            m = re.search(rf"var {re.escape(JS_VAR_NAME)}\s*=\s*(\[.*?\])\s*;", t, re.DOTALL)
            if m:
                data = json.loads(m.group(1))
                return {a.get("msgid",""): a for a in data if a.get("msgid")}
        except: pass
        return {}

    # ---- 主流程 ----
    def run(self, incremental=False, force=False, audio_only=False):
        if audio_only:
            arts = self.load_existing()
            if not arts: log("无现有数据"); return
            log(f"音频补全: {len(arts)} 篇")
            n = 0
            for mid, a in arts.items():
                if a.get("audio_url") or not a.get("url"): continue
                log(f"  {a['title'][:25]}...")
                src, name, et, desc = self.fetch_audio(a["url"])
                if src: a["audio_url"] = src; a["audio_name"] = name; n += 1
                if et: a["create_time"] = et
                if desc: a["description"] = desc
                time.sleep(0.5)
            self.save(list(arts.values()))
            log(f"找到 {n} 个音频")
            return

        existing = {} if force else self.load_existing()
        jtk = self.fetch_list(10)
        if not jtk: return

        if incremental and existing:
            n = 0
            known = set(existing.keys())
            for a in jtk:
                if a["msgid"] not in known: existing[a["msgid"]] = a; n += 1
            if n == 0: log("没有新文章 ✅"); return
            log(f"新增 {n} 篇")
            for a in existing.values():
                if not a.get("audio_url") and a.get("url"):
                    src, name, et, desc = self.fetch_audio(a["url"])
                    if src: a["audio_url"] = src; a["audio_name"] = name
                    if et: a["create_time"] = et
                    if desc: a["description"] = desc
                    time.sleep(0.5)
            self.save(list(existing.values()))
            log(f"总计 {len(existing)} 篇")
        else:
            all_a = {a["msgid"]: a for a in jtk}
            log("获取音频和详情...")
            for i, mid in enumerate(list(all_a.keys())[:10]):
                a = all_a[mid]
                if a.get("url"):
                    src, name, et, desc = self.fetch_audio(a["url"])
                    if src: a["audio_url"] = src; a["audio_name"] = name
                    if et: a["create_time"] = et
                    if desc: a["description"] = desc
                    time.sleep(0.5)
            self.save(list(all_a.values()))
            log(f"完成！{len(all_a)} 篇")


def log(msg):
    print(f"[dongjian_scraper] {msg}", file=sys.stderr)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("-i", "--incremental", action="store_true")
    p.add_argument("-f", "--force", action="store_true")
    p.add_argument("-a", "--audio-only", action="store_true")
    p.add_argument("-o", "--outdir", default=None)
    p.add_argument("--cookies", default=None, help="Cookie 文件路径")
    args = p.parse_args()
    
    cd = args.outdir or os.path.join(DATA_DIR, "..", "..", "source", "js", "sevencolor", "1")
    if not os.path.exists(cd): cd = args.outdir or DATA_DIR
    
    s = DongjianScraper(outdir=cd, cookie_file=args.cookies)
    s.run(incremental=args.incremental, force=args.force, audio_only=args.audio_only)
