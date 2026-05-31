#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TVBox 播放地址完整爬取工具 v3.0
================================
直接参考 TVBoxOSC 的 CMSV10 标准采集协议实现。
逐个测试每个可用 API 站点，爬取所有视频的播放地址。

用法:
  python tvbox-crawler.py              # 完整爬取所有站点
  python tvbox-crawler.py --test       # 测试模式 (每站5个视频)
  python tvbox-crawler.py --site 站点名 # 只爬指定站点
"""

import os
import sys
import json
import time
import requests
import traceback
from datetime import datetime
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
PLAYABLE_DIR = os.path.join(BASE_DIR, 'playable')
REPORT_DIR = os.path.join(BASE_DIR, 'report')
PARSED_DIR = os.path.join(BASE_DIR, 'parsed')
AGGREGATED_DIR = os.path.join(BASE_DIR, 'aggregated')
os.makedirs(PLAYABLE_DIR, exist_ok=True)
os.makedirs(REPORT_DIR, exist_ok=True)

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json,text/html,*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
})


def encode_idn(url):
    """对 URL 中的中文域名做 Punycode 编码"""
    if not url:
        return url
    try:
        parsed = urlparse(url)
        if parsed.hostname and any(ord(c) > 127 for c in parsed.hostname):
            encoded_host = parsed.hostname.encode('idna').decode('ascii')
            url = url.replace(parsed.hostname, encoded_host)
    except Exception:
        pass
    return url


def normalize_api_url(api):
    """归一化 API 地址"""
    if not api or not isinstance(api, str):
        return None
    api = api.strip()
    if not (api.startswith('http://') or api.startswith('https://')):
        return None
    return encode_idn(api.rstrip('?&'))


def extract_play_urls(play_url_str, play_from_str):
    """解析 vod_play_url 格式"""
    result = []
    if not play_url_str:
        return result

    from_list = [f.strip() for f in (play_from_str or '').split('$$$') if f.strip()]
    lines = play_url_str.split('$$$')

    for idx, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        current_from = from_list[idx] if idx < len(from_list) else f'线路{idx + 1}'
        episodes = line.split('#')
        for ep in episodes:
            ep = ep.strip()
            if not ep:
                continue
            sep = ep.find('$')
            if sep > 0:
                title = ep[:sep].strip()
                url = ep[sep + 1:].strip()
            else:
                title = f'第{len(result) + 1}集'
                url = ep.strip()
            if url:
                result.append({'from': current_from, 'title': title, 'url': url})
    return result


def is_playable(url):
    """判断是否可前端播放"""
    if not url:
        return False
    u = url.lower()
    exts = ['.mp4', '.m3u8', '.flv', '.ts', '.webm', '.mkv', '.mov']
    tokens = ['share/', '/token=', '?sign=', '?auth=', '?t=']
    return any(e in u for e in exts) or any(t in u for t in tokens)


def load_config():
    """加载配置文件 config.json"""
    if not os.path.exists(CONFIG_FILE):
        print(f'⚠️  config.json 不存在，回退到 parsed/ 目录')
        return None
    with open(CONFIG_FILE, 'r', encoding='utf-8-sig') as f:
        return json.load(f)


def fetch_json_text(url, timeout=15):
    """获取远程 JSON 内容，自动清理注释"""
    try:
        url = encode_idn(url)
        r = session.get(url, timeout=timeout)
        if r.status_code != 200:
            return None
        # 清理 BOM 和注释
        text = r.text.strip().lstrip('\ufeff')
        text = __import__('re').sub(r'^//.*$', '', text, flags=__import__('re').MULTILINE)
        text = __import__('re').sub(r'/\*[\s\S]*?\*/', '', text)
        return text
    except Exception:
        return None


def collect_cmsv10_sites():
    """
    从配置文件读取数据源，获取并解析所有 CMSV10 兼容的 API 站点。
    
    流程:
      config.json → 数据源URL列表 → 逐个获取JSON → 提取sites → 过滤API型
    """
    config = load_config()
    source_urls = []
    crawler_config = {}

    if config and 'sources' in config:
        source_urls = config['sources']
        crawler_config = config.get('crawler', {})
        print(f'[SRC] 从 config.json 读取 {len(source_urls)} 个数据源')
    else:
        source_urls = []

    all_sites = []
    seen_keys = set()

    # 方式一：从配置文件中的 URL 直接获取
    if source_urls:
        for url in source_urls:
            text = fetch_json_text(url, crawler_config.get('request_timeout', 15))
            if not text:
                print(f'  ⏭️ 获取失败: {url}')
                continue
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                print(f'  ⏭️ JSON解析失败: {url}')
                continue

            sname = url.split('/')[-1].split('.')[0][:20]
            # 处理JSON数组
            if isinstance(data, list):
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    item_url = item.get('url', '')
                    item_api = item.get('api', '')

                    if item_url:
                        # 有 url 字段 → 多仓：url 指向子聚合 JSON，fetch 后取 sites
                        child_text = fetch_json_text(item_url, crawler_config.get('request_timeout', 15))
                        if child_text:
                            try:
                                child_data = json.loads(child_text)
                                child_sites = child_data.get('sites', []) if isinstance(child_data, dict) else []
                                for site in child_sites:
                                    _add_site(site, sname, all_sites, seen_keys)
                            except json.JSONDecodeError:
                                pass
                    elif item_api.startswith(('http://', 'https://')):
                        # api 是完整 HTTP URL → 直接作为 CMS V10 API 站点使用
                        _add_site(item, sname, all_sites, seen_keys)
                    elif item_api:
                        # 相对路径 / 特殊值（如 ./drpy_libs/xxx.js）→ 尝试 fetch 后取 sites
                        child_text = fetch_json_text(item_api, crawler_config.get('request_timeout', 15))
                        if child_text:
                            try:
                                child_data = json.loads(child_text)
                                child_sites = child_data.get('sites', []) if isinstance(child_data, dict) else []
                                for site in child_sites:
                                    _add_site(site, sname, all_sites, seen_keys)
                            except json.JSONDecodeError:
                                pass
                continue

            # 单仓：优先提取 sites 格式，其次检测直接视频列表格式
            sites = data.get('sites', []) if isinstance(data, dict) else []
            if sites:
                for site in sites:
                    _add_site(site, sname, all_sites, seen_keys)
            elif isinstance(data, dict) and 'list' in data and 'sites' not in data:
                # 直接视频列表格式（如 360zy.com）：源本身就是可爬 API
                # 从 URL 提取站点名（取域名部分）
                parsed = urlparse(url)
                direct_name = parsed.netloc.split('.')[-2] if parsed.netloc else sname
                direct_key = f"direct_{len(all_sites)}"
                all_sites.append({
                    'key': direct_key,
                    'name': direct_name,
                    'api': url,          # 完整 URL（含 ac=list 等参数）
                    'type': -1,
                    'source': sname,
                    'is_direct': True,   # 标记为直接视频源
                })
                seen_keys.add(direct_key)
    else:
        print('[WARN] config.json 中无有效数据源配置，爬虫将无法获取站点')

    print(f'  → 发现 {len(all_sites)} 个 API 站点（其中 {sum(1 for s in all_sites if s.get("is_direct"))} 个直接视频源）')
    return all_sites


def _add_site(site, source_name, all_sites, seen_keys):
    """内部：添加一个站点到列表（去重）"""
    if not isinstance(site, dict):
        return
    key = site.get('key', '')
    if key and key in seen_keys:
        return
    if key:
        seen_keys.add(key)

    api = site.get('api', '')
    norm_api = normalize_api_url(api)
    if not norm_api:
        return

    all_sites.append({
        'key': key,
        'name': site.get('name', key),
        'api': norm_api,
        'type': site.get('type', -1),
        'source': source_name,
    })


def fetch_cmsv10_list(api, page=1):
    """CMSV10 ac=list 接口（直接视频源 URL 已含 ac=list，不再重复添加）"""
    try:
        # 检查 URL 是否已含 ac=list 参数，避免重复
        has_ac_in_url = 'ac=' in api
        if '?' in api.split('/')[-1]:
            if has_ac_in_url:
                r = session.get(api, params={'pg': page}, timeout=15)
            else:
                r = session.get(api, params={'ac': 'list', 'pg': page}, timeout=15)
        else:
            if has_ac_in_url:
                r = session.get(api.rstrip('/'), params={'pg': page}, timeout=15)
            else:
                r = session.get(api.rstrip('/'), params={'ac': 'list', 'pg': page}, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get('code') == 1:
            return data
        # 尝试 XML 格式
        if r.text.strip().startswith('<?xml'):
            from lxml import etree
            root = etree.fromstring(r.text.encode())
            items = []
            for item in (root.findall('.//video') or root.findall('.//item')):
                v = {}
                for child in item:
                    v[child.tag] = child.text or ''
                if v.get('vod_id') or v.get('id'):
                    items.append(v)
            return {'code': 1, 'list': items}
        return None
    except Exception:
        return None


def fetch_cmsv10_detail(api, vod_id):
    """CMSV10 ac=detail 接口（直接视频源 URL 已含 ac 参数，需替换而非累加）"""
    try:
        # 直接源 URL 已含 ac=list，需替换为 ac=detail
        if 'ac=' in api:
            import re
            api = re.sub(r'ac=[^&]+', 'ac=detail', api)
            r = session.get(api, params={'ids': vod_id}, timeout=15)
        elif '?' in api.split('/')[-1]:
            r = session.get(api, params={'ac': 'detail', 'ids': vod_id}, timeout=15)
        else:
            r = session.get(api.rstrip('/'), params={'ac': 'detail', 'ids': vod_id}, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json()
        # 有些API的code字段是字符串
        code = data.get('code') or data.get('ret')
        if code and data.get('list'):
            return data['list'][0]
        # 另一种格式：直接把详情放在根层级
        if data.get('vod_id') or data.get('vod_name'):
            return data
        return None
    except Exception:
        return None


def crawl_site(site, data_dir=None, max_pages=40, videos_per_page=12):
    """爬取单个站点：每页12个视频，固定40页，逐页写文件释放内存"""
    import re

    api = site['api']
    name = site['name']
    source = site['source']

    MAX_PAGES = max_pages
    VIDEOS_PER_PAGE = videos_per_page

    # 生成安全文件名前缀
    safe_prefix = re.sub(r'[^\w\u4e00-\u9fff]', '_', name).strip('_')[:50]

    total_videos = 0
    total_episodes = 0
    playable_count = 0
    playable_videos = 0
    pages_written = 0
    category_counts = {}  # {分类名: 视频数}

    result = {
        'name': name,
        'api': api,
        'source': source,
        'prefix': safe_prefix,
        'total_videos': 0,
        'total_episodes': 0,
        'playable_episodes': 0,
        'playable_videos': 0,
        'pages_written': 0,
        'videos': [],
        'error': None,
    }

    # 测试首页连通性
    home = fetch_cmsv10_list(api)
    if not home:
        result['error'] = '首页接口无响应'
        return result

    print(f'  [分页] {name}: 固定 {MAX_PAGES} 页, 每页 {VIDEOS_PER_PAGE} 个视频', flush=True)

    consecutive_empty = 0   # 连续空页计数

    for pg in range(1, MAX_PAGES + 1):
        page_data = fetch_cmsv10_list(api, page=pg)

        # 空数据：重试3次，间隔3秒，仍无数据则停止后续检索
        retry = 0
        while (not page_data) and retry < 3:
            retry += 1
            print(f'    [{name}] 页 {pg}: 无数据，重试 {retry}/3', flush=True)
            time.sleep(3)
            page_data = fetch_cmsv10_list(api, page=pg)

        if not page_data:
            print(f'    [{name}] 页 {pg}: 重试3次仍无数据，停止检索', flush=True)
            consecutive_empty += 1
            if consecutive_empty >= 3:
                print(f'    [{name}] 连续 {consecutive_empty} 页无数据，停止检索', flush=True)
                break
            continue

        items = page_data.get('list', [])
        if not items:
            # 列表为空也重试3次
            retry = 0
            while (not items) and retry < 3:
                retry += 1
                print(f'    [{name}] 页 {pg}: 列表为空，重试 {retry}/3', flush=True)
                time.sleep(3)
                page_data = fetch_cmsv10_list(api, page=pg)
                items = page_data.get('list', []) if page_data else []
            if not items:
                print(f'    [{name}] 页 {pg}: 重试3次仍无数据，停止检索', flush=True)
                consecutive_empty += 1
                if consecutive_empty >= 3:
                    print(f'    [{name}] 连续 {consecutive_empty} 页无数据，停止检索', flush=True)
                    break
                continue

        # 收集本页视频（最多 VIDEOS_PER_PAGE 个）
        page_videos = []
        for vod in items:
            if len(page_videos) >= VIDEOS_PER_PAGE:
                break
            vod_id = vod.get('vod_id', '')
            if not vod_id:
                continue

            detail = fetch_cmsv10_detail(api, vod_id)
            if not detail:
                continue

            # 分类统计：计入所有视频，不论是否可播放
            raw_class = detail.get('vod_class', '') or ''
            if raw_class.strip():
                for part in [c.strip() for c in raw_class.split(',') if c.strip()]:
                    category_counts[part] = category_counts.get(part, 0) + 1
            else:
                # 无分类的视频计入"未分类"
                category_counts['未分类'] = category_counts.get('未分类', 0) + 1

            play_url = detail.get('vod_play_url', '') or detail.get('play_url', '')
            play_from = detail.get('vod_play_from', '') or detail.get('play_from', '')
            play_info = extract_play_urls(play_url, play_from)

            if play_info:
                page_videos.append({
                    'name': detail.get('vod_name', ''),
                    'pic': detail.get('vod_pic', ''),
                    'remarks': detail.get('vod_remarks', ''),
                    'vod_class': detail.get('vod_class', ''),
                    'play_list': play_info,
                })

            time.sleep(0.1)

        if not page_videos:
            print(f'    [{name}] 页 {pg}: 无有效视频', flush=True)
            consecutive_empty += 1
            if consecutive_empty >= 3:
                print(f'    [{name}] 连续 {consecutive_empty} 页无有效视频，停止检索', flush=True)
                break
            continue

        # 成功有一页，清空连续空页计数
        consecutive_empty = 0

        # 统计累积
        total_videos += len(page_videos)
        playable_videos += len(page_videos)   # 有播放地址的视频数（每页12个上限）
        for v in page_videos:
            total_episodes += len(v['play_list'])
            playable_count += sum(1 for p in v['play_list'] if is_playable(p['url']))

        # 立即写文件并释放内存
        fname = save_site_page(name, api, source, page_videos, pg, MAX_PAGES, data_dir, safe_prefix)
        if fname:
            pages_written += 1

        # 释放内存
        del page_videos

        if pages_written % 10 == 0:
            print(f'    [{name}] 页 {pg}/{MAX_PAGES}: 已写 {pages_written} 页, 累计 {total_videos} 个视频', flush=True)

        time.sleep(0.3)  # 页面间限速

    result['total_videos'] = total_videos
    result['total_episodes'] = total_episodes
    result['playable_episodes'] = playable_count
    result['playable_videos'] = playable_videos
    result['pages_written'] = pages_written
    result['category_counts'] = category_counts

    if result['total_videos'] == 0:
        result['error'] = '未找到可播放视频'

    return result


def save_site_page(site_name, api, source, videos, page_num, total_pages, data_dir, safe_prefix):
    """将单页视频数据保存为 JS 文件（每页独立文件，允许空页）"""
    import re

    # 确保目录存在（并发场景下可能已被清理）
    os.makedirs(data_dir, exist_ok=True)

    filename = f'{safe_prefix}-{page_num:02d}.js'
    filepath = os.path.join(data_dir, filename)

    page_videos = []
    for v in videos:
        v_eps = []
        for ep in v['play_list']:
            v_eps.append({
                'title': ep['title'],
                'url': ep['url'],
                'from': ep['from'],
                'playable': is_playable(ep['url']),
            })

        # 封面缺失用占位图
        raw_pic = v.get('pic', '') or v.get('vod_pic', '')
        vod_pic = raw_pic if raw_pic.startswith('http') else ''

        page_videos.append({
            'vod_name': v['name'],
            'vod_pic': vod_pic,
            'remarks': v.get('remarks', ''),
            'vod_class': v.get('vod_class', ''),
            'ep_count': len(v_eps),
            'playable_count': sum(1 for e in v_eps if e['playable']),
            'episodes': v_eps,
        })

    # 无有效视频不写文件
    if not page_videos:
        return None

    data = {
        'name': site_name,
        'api': api,
        'source': source,
        'videos': page_videos,
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(f'window._TVBOX_SITE_DATA = {json.dumps(data, ensure_ascii=False)};')

    return filepath



def main():
    args = sys.argv[1:]
    
    # 从 config.json 读取设置，命令行参数优先
    config = load_config()
    crawler_cfg = config.get('crawler', {}) if config else {}
    
    if '--test' in args:
        test_mode = True
    else:
        test_mode = crawler_cfg.get('test_mode', False)
    
    specific_site = None
    for i, arg in enumerate(args):
        if arg == '--site' and i + 1 < len(args):
            specific_site = args[i + 1]

    print('=' * 60)
    print('  TVBox 播放地址完整爬取 v3.0')
    print(f'  时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print(f'  模式: {"测试" if test_mode else "全量"}')
    print('=' * 60)

    # 加载站点
    all_sites = collect_cmsv10_sites()
    print(f'\n[SITE] 发现 {len(all_sites)} 个 API 站点')

    if specific_site:
        sites = [s for s in all_sites if specific_site.lower() in s['name'].lower() or specific_site.lower() in s['key'].lower()]
        print(f'[SEARCH] 筛选 "{specific_site}": {len(sites)} 个')
    else:
        sites = all_sites

    if not sites:
        print('⚠️ 没有找到站点')
        return

    # 并发爬取，每完成一页立即写出 JS 并释放内存
    max_workers = crawler_cfg.get('max_workers', 9)
    max_pages = crawler_cfg.get('max_pages', 40)
    videos_per_page = crawler_cfg.get('videos_per_page', 12)
    site_stats = []
    # 直接生成到 Hexo source/js/sevencolor/3/data，不再用中间目录
    data_dir = os.path.normpath(os.path.join(BASE_DIR, '..', '..', 'source', 'js', 'sevencolor' , '3' , 'data'))
    if os.path.exists(data_dir):
        import shutil
        for item in os.listdir(data_dir):
            path = os.path.join(data_dir, item)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
    os.makedirs(data_dir, exist_ok=True)

    def crawl_one(site):
        """供线程池调用的单站爬取函数"""
        name = site['name']
        print(f'  [CRAWL] {name}... ', flush=True)
        result = crawl_site(site, data_dir, max_pages, videos_per_page)
        # 记录统计，videos 已在 crawl_site 内逐页释放
        stats = {
            'name': result['name'],
            'api': result['api'],
            'source': result['source'],
            'prefix': result.get('prefix', ''),
            'total_videos': result['total_videos'],
            'total_episodes': result['total_episodes'],
            'playable_episodes': result['playable_episodes'],
            'playable_videos': result.get('playable_videos', 0),
            'pages_written': result.get('pages_written', 0),
            'category_counts': result.get('category_counts', {}),
            'error': result.get('error'),
        }
        if stats['error']:
            print(f'❌ {stats["error"]}')
        else:
            print(f'✅ {stats["total_videos"]}个视频, {stats["playable_episodes"]}/{stats["total_episodes"]}个可播放, {stats["pages_written"]}页', flush=True)
        time.sleep(10)  # 站间限速，避免被封
        return stats

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(crawl_one, site): site for site in sites}
        for future in as_completed(futures):
            try:
                site_stats.append(future.result())
            except Exception as e:
                site = futures[future]
                print(f'❌ {site["name"]} 线程异常: {e}')
                site_stats.append({
                    'name': site['name'],
                    'api': site.get('api', ''),
                    'total_videos': 0,
                    'total_episodes': 0,
                    'playable_episodes': 0,
                    'error': str(e),
                })
            time.sleep(0.5)  # 站间限速

    # 生成 index.js（新格式，含 prefix + page_count）
    site_index = []
    for s in site_stats:
        if s.get('error') or not s.get('prefix'):
            continue
        site_index.append({
            'name': s['name'],
            'api': s['api'],
            'prefix': s['prefix'],
            'page_count': s.get('pages_written', 0),
            'file': f"{s['prefix']}-01.js",   # 前端默认加载第1页
            'total': s['total_videos'],
            'playable_videos': s.get('playable_videos', 0),
            'playable': s['playable_episodes'],
            'total_episodes': s['total_episodes'],
            'categories': s.get('category_counts', {}),
        })

    with open(os.path.join(data_dir, 'index.js'), 'w', encoding='utf-8') as f:
        f.write(f'window._TVBOX_INDEX = {json.dumps(site_index, ensure_ascii=False)};')

    # 报告
    report = {
        'time': datetime.now().isoformat(),
        'total_sites': len(sites),
        'succeeded': sum(1 for s in site_stats if not s.get('error')),
        'failed': sum(1 for s in site_stats if s.get('error')),
        'total_videos': sum(s['total_videos'] for s in site_stats),
        'total_episodes': sum(s['total_episodes'] for s in site_stats),
        'total_playable': sum(s['playable_episodes'] for s in site_stats),
        'sites': [{'name': s['name'], 'api': s['api'],
                    'videos': s['total_videos'],
                    'episodes': s['total_episodes'], 'playable': s['playable_episodes'],
                    'pages': s.get('pages_written', 0),
                    'error': s.get('error')} for s in site_stats],
    }
    os.makedirs(REPORT_DIR, exist_ok=True)
    with open(os.path.join(REPORT_DIR, 'crawl-report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f'  站点: {report["succeeded"]}/{report["total_sites"]} 成功')
    print(f'  视频: {report["total_videos"]} 个')
    print(f'  地址: {report["total_episodes"]} 条 ({report["total_playable"]} 可播放)')
    print(f'  [DIR] data/ — {len(site_index)} 个站点, 分页文件')
    print(f'  [SRC] report/crawl-report.json')
    print('=' * 60)


if __name__ == '__main__':
    main()
