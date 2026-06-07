#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Video API — 轻量预览版
从爬虫产出数据文件直接提供 JSON 接口

启动: python server.py
端口: 8765
"""

import json
import os
import re
import sys
import io
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── 配置 ──────────────────────────────
DATA_DIR = r'D:\hexo\source\js\sevencolor\3\data'
PORT = 8765

app = Flask(__name__)
CORS(app)  # 允许跨域

# UTF-8 输出
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


# ── 数据加载 ──────────────────────────

def load_index():
    """加载 index.js，返回站点列表"""
    path = os.path.join(DATA_DIR, 'index.js')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    # 提取 JSON 数组
    text = text.replace('window._TVBOX_INDEX = ', '')
    text = text.strip().rstrip(';')
    return json.loads(text)


def load_page(filename):
    """加载单个数据文件，返回视频列表"""
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('window._TVBOX_SITE_DATA = ', '')
    text = text.strip().rstrip(';')
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def find_page_file(site_prefix, page):
    """根据站点前缀和页码找到数据文件名"""
    n = str(page)
    if len(n) < 2:
        n = '0' + n
    target = f'{site_prefix}-{n}.js'
    path = os.path.join(DATA_DIR, target)
    if os.path.exists(path):
        return target
    return None


# ── 缓存 ──────────────────────────────

_cache = {
    'index': None,
    'index_time': 0,
    'data': {},  # {filename: (data, mtime)}
}


def get_index():
    now = os.path.getmtime(os.path.join(DATA_DIR, 'index.js'))
    if _cache['index'] is None or now > _cache['index_time']:
        _cache['index'] = load_index()
        _cache['index_time'] = now
    return _cache['index']


def get_page(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return None
    mtime = os.path.getmtime(path)
    cached = _cache['data'].get(filename)
    if cached and cached[1] >= mtime:
        return cached[0]
    data = load_page(filename)
    if data:
        _cache['data'][filename] = (data, mtime)
        # 限制缓存大小
        if len(_cache['data']) > 200:
            oldest = min(_cache['data'], key=lambda k: _cache['data'][k][1])
            del _cache['data'][oldest]
    return data


# ── API 路由 ──────────────────────────

@app.route('/')
def root():
    return jsonify({
        'name': 'Video API',
        'version': '0.1.0',
        'endpoints': [
            'GET /sites                       — 站点列表',
            'GET /data?site=<名称>&page=<N>    — 站点分页数据',
            'GET /data?prefix=<前缀>&page=<N>  — 按前缀查分页',
            'GET /search?q=<关键词>            — 全局搜索影片',
            'GET /categories?site=<名称>       — 站点分类统计',
        ]
    })


@app.route('/sites')
def sites():
    """返回所有站点索引"""
    idx = get_index()
    result = []
    for s in idx:
        result.append({
            'name': s.get('name', ''),
            'prefix': s.get('prefix', ''),
            'api': s.get('api', ''),
            'page_count': s.get('page_count', 0),
            'total': s.get('total', 0),
            'playable': s.get('playable', 0),
            'file': s.get('file', ''),
            'categories': s.get('categories', {}),
        })
    return jsonify({'count': len(result), 'sites': result})


@app.route('/data')
def data():
    """返回指定站点的单页数据"""
    site = request.args.get('site', '').strip()
    prefix = request.args.get('prefix', '').strip()
    page = request.args.get('page', '1').strip()

    try:
        page = int(page)
    except ValueError:
        return jsonify({'error': 'page 必须为数字'}), 400

    idx = get_index()
    found = None
    for s in idx:
        if site and s.get('name', '') == site:
            found = s
            break
        if prefix and s.get('prefix', '') == prefix:
            found = s
            break

    if not found:
        sites_avail = [s['name'] for s in idx[:20]]
        return jsonify({'error': '站点未找到', 'available': sites_avail}), 404

    if page < 1 or page > found.get('page_count', 0):
        return jsonify({'error': f'页码超出范围 (1-{found["page_count"]})'}), 400

    filename = find_page_file(found['prefix'], page)
    if not filename:
        return jsonify({'error': f'数据文件不存在: {found["prefix"]}-{page}'}), 404

    data = get_page(filename)
    if not data:
        return jsonify({'error': '数据加载失败'}), 500

    return jsonify({
        'site': found['name'],
        'prefix': found['prefix'],
        'page': page,
        'page_count': found.get('page_count', 0),
        'videos': data.get('videos', []),
    })


@app.route('/search')
def search():
    """全局搜索影片（简化版，只搜当前缓存的页面）"""
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '请提供搜索关键词 q'}), 400

    # 获取站点列表
    idx = get_index()
    if not idx:
        return jsonify({'error': '无数据'}), 404

    results = []
    limit = int(request.args.get('limit', 50))
    found = 0

    for site in idx:
        if found >= limit:
            break
        # 只搜每个站点的第一页（预览版简化）
        filename = find_page_file(site['prefix'], 1)
        if not filename:
            continue
        data = get_page(filename)
        if not data:
            continue
        for v in data.get('videos', []):
            name = v.get('name', '')
            if q.lower() in name.lower():
                results.append({
                    'vod_name': name,
                    'vod_pic': v.get('pic', ''),
                    'vod_remarks': v.get('remarks', ''),
                    'vod_class': v.get('vod_class', ''),
                    'site': site['name'],
                    'play_list': v.get('play_list', []),
                })
                found += 1
                if found >= limit:
                    break

    return jsonify({'count': len(results), 'results': results, 'limit': limit})


@app.route('/categories')
def categories():
    """返回站点的分类统计"""
    site = request.args.get('site', '').strip()
    prefix = request.args.get('prefix', '').strip()

    idx = get_index()
    found = None
    for s in idx:
        if site and s.get('name', '') == site:
            found = s
            break
        if prefix and s.get('prefix', '') == prefix:
            found = s
            break

    if not found:
        return jsonify({'error': '站点未找到'}), 404

    cats = found.get('categories', {})
    sorted_cats = dict(sorted(cats.items(), key=lambda x: x[1], reverse=True))
    return jsonify({'site': found['name'], 'categories': sorted_cats})


# ── 启动 ──────────────────────────────

if __name__ == '__main__':
    idx = load_index()
    site_count = len(idx) if idx else 0
    file_count = len([f for f in os.listdir(DATA_DIR) if f.endswith('.js') and f != 'index.js'])

    print(f'Video API v0.1.0')
    print(f'  数据目录: {DATA_DIR}')
    print(f'  站点数: {site_count}')
    print(f'  数据文件: {file_count}')
    print(f'  监听端口: {PORT}')
    print(f'  跨域: 已启用')
    print(f'=' * 50)

    app.run(host='0.0.0.0', port=PORT, debug=False)
