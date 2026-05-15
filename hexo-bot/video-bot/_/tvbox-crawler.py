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
        print(f'📋 从 config.json 读取 {len(source_urls)} 个数据源')
    else:
        # 回退：从 parsed/ aggregated/ 目录读取已有数据
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
            # 处理多仓 (JSON数组，每个元素有url指向子源)
            if isinstance(data, list):
                for item in data:
                    child_url = item.get('url', '') or item.get('api', '')
                    if child_url:
                        child_text = fetch_json_text(child_url, crawler_config.get('request_timeout', 15))
                        if child_text:
                            try:
                                child_data = json.loads(child_text)
                                sites = child_data.get('sites', []) if isinstance(child_data, dict) else []
                                for site in sites:
                                    _add_site(site, sname, all_sites, seen_keys)
                            except json.JSONDecodeError:
                                pass
                continue

            # 单仓 (标准 JSON)
            sites = data.get('sites', []) if isinstance(data, dict) else []
            for site in sites:
                _add_site(site, sname, all_sites, seen_keys)

    # 方式二：回退到 parsed/ aggregated/ 目录
    for data_dir in [PARSED_DIR, AGGREGATED_DIR]:
        if not os.path.isdir(data_dir):
            continue
        for fname in sorted(os.listdir(data_dir)):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(data_dir, fname)
            try:
                with open(fpath, 'r', encoding='utf-8-sig') as f:
                    data = json.load(f)
            except Exception:
                continue
            sname = fname.replace('.json', '')
            sites = data.get('sites', [])
            if not isinstance(sites, list):
                continue
            for site in sites:
                _add_site(site, sname, all_sites, seen_keys)

    print(f'  → 发现 {len(all_sites)} 个 API 站点')
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
    """CMSV10 ac=list 接口"""
    try:
        if '?' in api.split('/')[-1]:
            r = session.get(api, params={'ac': 'list', 'pg': page}, timeout=15)
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
    """CMSV10 ac=detail 接口"""
    try:
        if '?' in api.split('/')[-1]:
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


def crawl_site(site, test_mode=False):
    """爬取单个站点的所有播放地址"""
    api = site['api']
    name = site['name']

    result = {
        'name': name,
        'api': api,
        'source': site['source'],
        'total_videos': 0,
        'total_episodes': 0,
        'playable_episodes': 0,
        'videos': [],
        'error': None,
    }

    # Step 1: 获取首页列表
    home = fetch_cmsv10_list(api)
    if not home:
        result['error'] = '首页接口无响应'
        return result

    items = home.get('list', [])
    if not items:
        result['error'] = '首页列表为空'
        return result

    # page 字段可能是字符串或对象
    page_info = home.get('page', {})
    if isinstance(page_info, dict):
        total_pages = int(page_info.get('pagecount', 1) or 1)
    else:
        # page 是数字或字符串，pagecount在响应根层级
        total_pages = int(home.get('pagecount', 1) or 1)

    # 安全防护：限制最大分页
    config = load_config()
    max_pages = (config or {}).get('crawler', {}).get('max_pages_per_site', 20) or 20
    if total_pages > max_pages:
        print(f'  ⚠ {name}: pagecount={total_pages}>MAX={max_pages}，已截断', flush=True)
        total_pages = max_pages

    print(f'  [分页] {name}: {total_pages} 页', flush=True)

    # Step 2: 遍历分页获取详情
    videos_added = 0
    for pg in range(1, total_pages + 1):
        print(f'    [页] {pg}/{total_pages}...', flush=True)
        if pg > 1:
            page_data = fetch_cmsv10_list(api, page=pg)
            if not page_data:
                break
            items = page_data.get('list', [])
            if not items:
                break

        for vod in items:
            vod_id = vod.get('vod_id', '')
            if not vod_id:
                continue

            detail = fetch_cmsv10_detail(api, vod_id)
            if not detail:
                continue

            play_url = detail.get('vod_play_url', '') or detail.get('play_url', '')
            play_from = detail.get('vod_play_from', '') or detail.get('play_from', '')
            play_info = extract_play_urls(play_url, play_from)

            if play_info:
                result['videos'].append({
                    'vod_id': vod_id,
                    'name': detail.get('vod_name', ''),
                    'pic': detail.get('vod_pic', ''),
                    'remarks': detail.get('vod_remarks', ''),
                    'vod_class': detail.get('vod_class', ''),
                    'play_list': play_info,
                })
                result['total_episodes'] += len(play_info)
                result['playable_episodes'] += sum(1 for p in play_info if is_playable(p['url']))
                videos_added += 1
                if videos_added % 10 == 0:
                    print(f'      [视频] {name}: {videos_added} 个...', flush=True)

            time.sleep(0.1)

    result['total_videos'] = len(result['videos'])
    if result['total_videos'] == 0:
        result['error'] = '未找到可播放视频'
    return result


def generate_html(sites_data):
    """生成前端播放器 HTML"""
    site_groups = {}
    for site in sites_data:
        if site.get('error') or not site.get('videos'):
            continue
        key = f"{site['name']} ({site['source']})"
        items = []
        for v in site['videos']:
            for ep in v['play_list'][:20]:  # 每个视频最多20集
                items.append({
                    'video_name': v['name'],
                    'title': ep['title'],
                    'url': ep['url'],
                    'from': ep['from'],
                    'playable': is_playable(ep['url']),
                })
        if items:
            site_groups[key] = items

    all_items = [i for g in site_groups.values() for i in g]
    playable_items = [i for i in all_items if i['playable']]

    rows = []
    for group_name, items in site_groups.items():
        rows.append(f'<div class="group"><h3>📡 {group_name} ({len(items)})</h3>')
        for item in items:
            badge = '<span class="badge ok">可播放</span>' if item['playable'] else '<span class="badge no">需验证</span>'
            label = f"{item['video_name']} - {item['title']}" if item['title'] else item['video_name']
            rows.append(f'''
  <div class="item" data-name="{item['video_name']}">
    <div><span class="name">{label}</span>{badge}<span class="from">{item['from']}</span></div>
    <div class="url">{item['url'][:80]}</div>
    <button onclick="play({json.dumps(item['url'])},{json.dumps(label)})">▶</button>
  </div>''')
        rows.append('</div>')

def save_site_data(site_result, data_dir):
    """将单个站点的数据保存为 JSON 文件"""
    import re
    if site_result.get('error') or not site_result.get('videos'):
        return None

    safe_name = re.sub(r'[^\w\u4e00-\u9fff]', '_', site_result['name'])
    safe_name = safe_name.strip('_')[:50]
    filename = f'{safe_name}.json'
    filepath = os.path.join(data_dir, filename)

    episodes = []
    for v in site_result['videos']:
        v_eps = []
        for ep in v['play_list']:
            e = {
                'title': ep['title'],
                'url': ep['url'],
                'from': ep['from'],
                'playable': is_playable(ep['url']),
            }
            episodes.append(e)
            v_eps.append(e)
        v['_episodes'] = v_eps  # 保留层级结构

    data = {
        'name': site_result['name'],
        'api': site_result['api'],
        'source': site_result['source'],
        'total_videos': len(site_result['videos']),
        'total_episodes': len(episodes),
        'playable_count': sum(1 for e in episodes if e['playable']),
        # 层级结构：视频 → 剧集
        'videos': [{
            'vod_name': v['name'],
            'vod_pic': v.get('pic', ''),
            'remarks': v.get('remarks', ''),
            'vod_class': v.get('vod_class', ''),
            'ep_count': len(v['_episodes']),
            'playable_count': sum(1 for e in v['_episodes'] if e['playable']),
            'episodes': v['_episodes'],
        } for v in site_result['videos']],
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 同时生成 .js 文件（用于 file:// 协议加载）
    js_filepath = filepath.replace('.json', '.js')
    with open(js_filepath, 'w', encoding='utf-8') as f:
        f.write(f'window._TVBOX_SITE_DATA = {json.dumps(data, ensure_ascii=False)};')

    return {
        'name': site_result['name'],
        'file': filename,
        'total': len(episodes),
        'playable': data['playable_count'],
    }


def generate_player_html():
    """生成前端播放器（数据由 data/all.js 提供，script src 加载）"""
    return '''<!DOCTYPE html><html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TVBox 播放器</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Microsoft YaHei',sans-serif;background:#0f0f0f;color:#e0e0e0;padding:20px;max-width:1200px;margin:0 auto}
h1{color:#ff6b35;font-size:22px;margin-bottom:15px}
.toolbar{display:flex;gap:10px;margin:10px 0;flex-wrap:wrap;align-items:center}
.toolbar select,.toolbar input,.toolbar button{padding:8px 12px;border:1px solid #444;border-radius:6px;background:#1a1a2e;color:#e0e0e0;font-size:14px}
.toolbar select{flex:1;min-width:200px;cursor:pointer}
.toolbar input{flex:2;min-width:150px}
.toolbar button{background:#ff6b35;color:#fff;border:none;cursor:pointer}
.toolbar button:hover{background:#e65100}
.stats{display:flex;gap:15px;margin:10px 0;flex-wrap:wrap}
.stat{background:#1a1a2e;padding:10px 18px;border-radius:8px;text-align:center}
.stat .n{font-size:24px;font-weight:bold;color:#4fc3f7}
.stat .l{font-size:12px;color:#78909c}
.player-box{background:#000;border-radius:10px;overflow:hidden;margin:15px 0}
#player{width:100%;aspect-ratio:16/9;background:#000}
.status-bar{background:#1a1a2e;padding:8px 15px;border-radius:6px;margin:8px 0;font-size:13px;color:#78909c}
.video-card{background:#16213e;border-radius:8px;padding:10px 14px;margin:5px 0;display:flex;align-items:center;gap:8px;cursor:pointer}
.video-card:hover{background:#1a2744}
.video-card .vname{color:#e0e0e0;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.video-card .vmeta{color:#78909c;font-size:11px;flex-shrink:0}
.video-card .vexpand{color:#ff6b35;font-size:10px;flex-shrink:0;transition:transform .2s}
.ep-list{padding-left:16px}
.ep-item{background:#1a1a2e;border-radius:6px;padding:6px 10px;margin:2px 0;display:flex;align-items:center;gap:6px;font-size:12px}
.ep-item .eptitle{color:#b0bec5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ep-item .epfrom{color:#78909c;font-size:10px;flex-shrink:0}
.ep-item button{background:#ff6b35;color:#fff;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:10px}
.ep-item button:hover{background:#e65100}
.badge{padding:1px 5px;border-radius:3px;font-size:10px;flex-shrink:0}
.badge.yes{background:#2e7d32;color:#fff}
.badge.no{background:#c62828;color:#fff}
.pagination{display:flex;gap:5px;justify-content:center;margin:15px 0;flex-wrap:wrap}
.pagination button{padding:5px 12px;border:1px solid #444;border-radius:4px;background:#1a1a2e;color:#e0e0e0;cursor:pointer;font-size:12px}
.pagination button.active{background:#ff6b35;border-color:#ff6b35}
.pagination button:hover:not(.active){background:#333}
.pagination button:disabled{opacity:0.4;cursor:default}
.loading{text-align:center;padding:40px;color:#78909c;font-size:16px}
.empty{text-align:center;padding:40px;color:#78909c}
</style></head><body>
<h1>📺 TVBox 播放器</h1>
<div class="stats" id="stats"></div>
<div class="toolbar">
  <select id="sourceSelect" onchange="switchSource()">
    <option value="">— 请选择数据源 —</option>
  </select>
  <input type="text" id="searchInput" placeholder="搜索影片名称..." oninput="doSearch()">
  <button onclick="doSearch()">搜索</button>
</div>
<div class="player-box"><video id="player" controls></video></div>
<div id="status" class="status-bar">⏹ 选择一个数据源开始播放</div>
<div id="content" class="loading">⏳ 正在加载...</div>
<div class="pagination" id="pagination"></div>

<script>
/*===== 所有数据内嵌 =====*/
var TVBOX_DATA = ''' + index_json + ''';

var PAGE_SIZE = 20;
var currentFile = '';
var currentData = null;
var currentPage = 1;
var currentFiltered = [];

function loadIndex() {
  var names = Object.keys(TVBOX_DATA);
  if (!names.length) {
    document.getElementById('content').innerHTML = '<div class="empty">❌ 无数据，请先运行爬虫</div>';
    return;
  }
  var sel = document.getElementById('sourceSelect');
  var totalAll = 0, playableAll = 0;
  names.sort();
  names.forEach(function(k) {
    var d = TVBOX_DATA[k];
    totalAll += d.total_episodes || 0;
    playableAll += d.playable_count || 0;
    var opt = document.createElement('option');
    opt.value = k;
    opt.textContent = d.name + ' (' + (d.playable_count||0) + '/' + (d.total_episodes||0) + ')';
    sel.appendChild(opt);
  });
  document.getElementById('stats').innerHTML =
    '<div class="stat"><div class="n">' + names.length + '</div><div class="l">数据源</div></div>' +
    '<div class="stat"><div class="n">' + totalAll + '</div><div class="l">总地址</div></div>' +
    '<div class="stat"><div class="n">' + playableAll + '</div><div class="l">可播放</div></div>';
  document.getElementById('content').innerHTML = '<div class="empty">✅ 已加载，请选择数据源</div>';
}

function switchSource() {
  var key = document.getElementById('sourceSelect').value;
  if (!key) {
    document.getElementById('content').innerHTML = '<div class="empty">请选择一个数据源</div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  currentData = TVBOX_DATA[key];
  document.getElementById('status').textContent = '📡 ' + currentData.name + ' - ' + currentData.total_videos + '个视频，' + currentData.total_episodes + '条地址';
  currentPage = 1;
  doSearch();
}

function doSearch() {
  if (!currentData) return;
  var q = document.getElementById('searchInput').value.toLowerCase().trim();
  // 搜索视频名称和剧集标题
  currentFiltered = (currentData.videos || []).filter(function(v) {
    if (!q) return true;
    if ((v.vod_name||'').toLowerCase().includes(q)) return true;
    return (v.episodes||[]).some(function(e) { return (e.title||'').toLowerCase().includes(q); });
  });
  currentPage = 1;
  renderPage();
}

function renderPage() {
  var total = currentFiltered.length;
  var pages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > pages) currentPage = pages;
  var start = (currentPage - 1) * PAGE_SIZE;
  var pageItems = currentFiltered.slice(start, start + PAGE_SIZE);
  
  var allEps = 0, allPlayable = 0;
  pageItems.forEach(function(v) { allEps += v.ep_count||0; allPlayable += v.playable_count||0; });
  
  var html = '<div class="stats"><div class="stat"><div class="n">' + total + '</div><div class="l">视频</div></div></div>';
  
  for (var i = 0; i < pageItems.length; i++) {
    var v = pageItems[i];
    var eps = v.episodes || [];
    var badge = (v.playable_count > 0) ? '<span class="badge yes">可播</span>' : '<span class="badge no">需验证</span>';
    var epInfo = (v.ep_count || 0) + '集 · ' + (v.playable_count||0) + '可播';
    var vid = 'vid_' + i + '_' + currentPage;
    
    // 视频卡片（可点击展开）
    html += '<div class="video-card" onclick="toggleEpisodes(this)" data-vid="' + vid + '">' +
      '<span class="vname">' + (v.vod_name||'') + '</span>' + badge +
      '<span class="vmeta">' + epInfo + '</span>' +
      '<span class="vexpand">▶</span></div>' +
      '<div class="ep-list" id="' + vid + '" style="display:none">';
    
    // 剧集列表（默认收起）
    for (var j = 0; j < eps.length; j++) {
      var e = eps[j];
      var eb = e.playable ? '<span class="badge yes">可播</span>' : '<span class="badge no">需验证</span>';
      var safeUrl = (e.url||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      html += '<div class="ep-item" data-url="' + safeUrl + '" data-name="' + (v.vod_name||'') + ' - ' + (e.title||'') + '">' +
        '<span class="eptitle">' + (e.title||'') + '</span>' + eb +
        '<span class="epfrom">' + (e.from||'') + '</span>' +
        '<button onclick="event.stopPropagation();playFromData(this)">▶</button></div>';
    }
    
    html += '</div>';
  }
  
  if (!pageItems.length) html += '<div class="empty">无匹配结果</div>';
  document.getElementById('content').innerHTML = html;
  
  // 分页按钮
  var pg = '<button onclick="goPage(1)"' + (currentPage<=1?' disabled':'') + '>◀◀</button>';
  pg += '<button onclick="goPage(' + (currentPage-1) + ')"' + (currentPage<=1?' disabled':'') + '>◀</button>';
  for (var pi = Math.max(1, currentPage-3); pi <= Math.min(pages, currentPage+3); pi++) {
    pg += '<button class="' + (pi===currentPage?'active':'') + '" onclick="goPage(' + pi + ')">' + pi + '</button>';
  }
  pg += '<button onclick="goPage(' + (currentPage+1) + ')"' + (currentPage>=pages?' disabled':'') + '>▶</button>';
  pg += '<button onclick="goPage(' + pages + ')"' + (currentPage>=pages?' disabled':'') + '>▶▶</button>';
  document.getElementById('pagination').innerHTML = pg;
}

function toggleEpisodes(el) {
  var id = el.dataset.vid;
  var sub = document.getElementById(id);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

function goPage(p) { currentPage = p; renderPage(); }

function play(url, name) {
  var p = document.getElementById('player');
  p.src = url;
  p.play().catch(function(){});
  document.getElementById('status').textContent = '▶️ ' + name;
}

function playFromData(btn) {
  // 从最近的 .ep-item 读取 data-url 和 data-name
  var item = btn.closest('.ep-item') || btn.parentElement;
  play(item.dataset.url, item.dataset.name);
}

loadIndex();
</script></body></html>'''


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
    print(f'\n📡 发现 {len(all_sites)} 个 API 站点')

    if specific_site:
        sites = [s for s in all_sites if specific_site.lower() in s['name'].lower() or specific_site.lower() in s['key'].lower()]
        print(f'🔍 筛选 "{specific_site}": {len(sites)} 个')
    else:
        sites = all_sites

    if not sites:
        print('⚠️ 没有找到站点')
        return

    # 逐个爬取
    results = []
    for site in sites:
        print(f'  📥 {site["name"]}... ', end='', flush=True)
        result = crawl_site(site, test_mode)
        results.append(result)
        if result['error']:
            print(f'❌ {result["error"]}')
        else:
            print(f'✅ {result["total_videos"]}个视频, {result["playable_episodes"]}/{result["total_episodes"]}个可播放')

    # 输出
    print('\n' + '=' * 60)
    print('  生成输出...')

    # 1. 创建 data/ 目录，按站点分文件存储
    data_dir = os.path.join(PLAYABLE_DIR, 'data')
    os.makedirs(data_dir, exist_ok=True)

    site_index = []
    for site in results:
        info = save_site_data(site, data_dir)
        if info:
            site_index.append(info)

    # 写索引文件 (JSON + JS)
    with open(os.path.join(data_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(site_index, f, ensure_ascii=False, indent=2)

    # 3. 生成 all.js（所有站点数据合集，播放器通过 script src 加载）
    all_data = {}
    for info in site_index:
        fname = info['file']
        fpath = os.path.join(data_dir, fname)
        try:
            with open(fpath, 'r', encoding='utf-8-sig') as f:
                all_data[fname] = json.load(f)
        except Exception:
            pass
    with open(os.path.join(data_dir, 'all.js'), 'w', encoding='utf-8') as f:
        f.write(f'var TVBOX_DATA = {json.dumps(all_data, ensure_ascii=False)};')

    # 4. HTML 播放器（由 gen-player.py 生成）
    import subprocess
    subprocess.run([sys.executable, os.path.join(BASE_DIR, 'gen-player.py')],
                   capture_output=True)

    # 2. 播放地址列表（完整文本版保留）
    with open(os.path.join(PLAYABLE_DIR, 'playable-urls-all.txt'), 'w', encoding='utf-8') as f:
        f.write(f'# TVBox 播放地址 ({datetime.now().strftime("%Y-%m-%d %H:%M")})\n\n')
        for site in results:
            if site.get('error'):
                f.write(f'## ❌ {site["name"]}: {site["error"]}\n')
                continue
            for v in site['videos']:
                for ep in v['play_list']:
                    tag = '✅' if is_playable(ep['url']) else '⚠️'
                    f.write(f'{tag} {site["name"]} - {v["name"]} - {ep["title"]}\n  {ep["url"]}\n')

    # 4. 报告
    report = {
        'time': datetime.now().isoformat(),
        'total_sites': len(sites),
        'succeeded': sum(1 for r in results if not r.get('error')),
        'failed': sum(1 for r in results if r.get('error')),
        'total_videos': sum(r['total_videos'] for r in results),
        'total_episodes': sum(r['total_episodes'] for r in results),
        'total_playable': sum(r['playable_episodes'] for r in results),
        'sites': [{'name': r['name'], 'api': r['api'], 'videos': r['total_videos'], 
                    'episodes': r['total_episodes'], 'playable': r['playable_episodes'],
                    'error': r.get('error')} for r in results],
    }
    with open(os.path.join(REPORT_DIR, 'crawl-report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f'  站点: {report["succeeded"]}/{report["total_sites"]} 成功')
    print(f'  视频: {report["total_videos"]} 个')
    print(f'  地址: {report["total_episodes"]} 条 ({report["total_playable"]} 可播放)')
    print(f'  📁 data/ — {len(site_index)} 个站点数据文件')
    total_eps = sum(r['total_episodes'] for r in results if not r.get('error'))
    print(f'  🎬 player.html — 播放器（数据源自 data/all.js）')
    print(f'  📋 report/crawl-report.json')
    print('=' * 60)


if __name__ == '__main__':
    main()
