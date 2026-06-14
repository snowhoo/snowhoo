#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TV-LOGO 直播频道 Logo 下载工具
从已有 JS 数据文件中提取 logo 地址并下载
并发 5 链接，超时 30s，重试 3 次
"""

import os
import re
import sys
import json
import urllib.request
from pathlib import Path
from urllib.parse import urlparse, urlunparse, quote
from concurrent.futures import ThreadPoolExecutor, as_completed

DATA_DIR = Path(r"D:\hexo\source\js\sevencolor\3\data")
OUTPUT_DIR = DATA_DIR / "TV-LOGO"
CONCURRENT = 5
TIMEOUT = 30
MAX_RETRIES = 3


def encode_url(url: str) -> str:
    parsed = urlparse(url)
    path = ''.join(quote(ch) if ord(ch) > 127 else ch for ch in parsed.path)
    return urlunparse(parsed._replace(path=path))


def download_one(args) -> tuple:
    """下载单个 logo，返回 (filename, success, size_kb, error_msg)"""
    url, filepath = args
    filename = filepath.name
    encoded_url = encode_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/webp,image/*,*/*",
        "Referer": "https://tb.zbds.top/",
    }

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(encoded_url, headers=headers)
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                data = resp.read()
                if len(data) < 200:
                    return (filename, False, 0, "too small")
                filepath.write_bytes(data)
                return (filename, True, len(data) / 1024, None)
        except urllib.request.HTTPError as e:
            if e.code == 404:
                return (filename, False, 0, "404")
            if attempt < MAX_RETRIES - 1:
                import time
                time.sleep(1)
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                import time
                time.sleep(1)
            elif attempt == MAX_RETRIES - 1:
                return (filename, False, 0, str(e)[:50])
    return (filename, False, 0, "max retries")


def extract_logos_from_js(filepath: Path) -> set:
    content = filepath.read_text("utf-8")
    match = re.search(r'window\._TVBOX_SITE_DATA\s*=\s*({.*?});', content, re.DOTALL)
    if not match:
        return set()
    try:
        data = json.loads(match.group(1))
        urls = set()
        for v in data.get("videos", []):
            pic = v.get("vod_pic", "")
            if pic and pic.startswith("http"):
                urls.add(pic)
        return urls
    except json.JSONDecodeError:
        return set()


def main():
    print("=" * 50)
    print(" TV-LOGO Downloader")
    print(f" Concurrent: {CONCURRENT}, Timeout: {TIMEOUT}s, Retries: {MAX_RETRIES}")
    print("=" * 50)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 从所有直播数据文件中提取 logo URL
    all_urls = set()
    for f in sorted(DATA_DIR.glob("直播_电视-*.js")):
        urls = extract_logos_from_js(f)
        all_urls.update(urls)
        print(f"  [READ] {f.name}: {len(urls)} logos")

    unique = sorted(all_urls)
    print(f"\n  [TOTAL] {len(unique)} unique logos")

    # 只下载不存在的
    tasks = []
    for url in unique:
        filename = url.split("/")[-1]
        if not filename:
            continue
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        filepath = OUTPUT_DIR / filename
        if filepath.exists() and filepath.stat().st_size > 200:
            continue
        tasks.append((url, filepath))

    print(f"  [TASKS] {len(tasks)} to download\n")

    if not tasks:
        print("  All logos already downloaded!")
        return

    success = 0
    fail = 0
    with ThreadPoolExecutor(max_workers=CONCURRENT) as pool:
        futures = {pool.submit(download_one, t): t for t in tasks}
        for i, future in enumerate(as_completed(futures), 1):
            filename, ok, size, err = future.result()
            if ok:
                success += 1
                print(f"  [{i}/{len(tasks)}] OK  {filename} ({size:.0f} KB)")
            else:
                fail += 1
                print(f"  [{i}/{len(tasks)}] FAIL {filename}  {err or ''}")

    print(f"\n{'=' * 50}")
    print(f" Done!  OK: {success}  FAIL: {fail}  Total: {len(tasks)}")
    print(f" Dir: {OUTPUT_DIR}")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
