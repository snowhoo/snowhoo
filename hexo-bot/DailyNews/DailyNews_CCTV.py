#!/usr/bin/env python3
"""
DailyNews_CCTV.py — 央视新闻每日获取（增量模式）

功能:
  从央视新闻各栏目独立API获取当天新闻，按栏目分类保存为JSON。
  栏目来源直接对应央视网菜单栏，而非关键词分类。

栏目与API对照（从央视网菜单栏提取）:
  新闻 → news.cctv.com           → news_1.jsonp (JPEGP)
  国内 → news.cctv.com/china/    → china_1.jsonp
  国际 → news.cctv.com/world/    → world_1.jsonp
  经济 → news.cctv.com/ → economy_1.jsonp (JPEGP)
  社会 → news.cctv.com/society/  → society_1.jsonp
  法治 → news.cctv.com/law/      → law_1.jsonp
  文娱 → news.cctv.com/ent/      → ent_1.jsonp
  科技 → news.cctv.com/tech/     → tech_1.jsonp
  生活 → news.cctv.com/life/     → life_1.jsonp
  军事 → military.cctv.com/      → data/index.json

运行:
  python DailyNews_CCTV.py                      # 获取当天新闻
  python DailyNews_CCTV.py --date=20260726       # 获取指定日期
  python DailyNews_CCTV.py --force               # 强制重新获取（忽略增量）
  python DailyNews_CCTV.py --detail              # 同时获取全文（较慢）

输出:
  D:/hexo/source/app/news_CCTV/YYYYMMDD/{栏目名}.json

依赖:
  pip install requests beautifulsoup4 lxml
"""

import requests
import re
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup

# ======================== 配置 ========================

OUTPUT_BASE = r'D:\hexo\source\app\news_CCTV'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
TIMEOUT = 15
RETRY = 2

# 所有栏目的API配置（菜单栏来源）
# type: "jsonp" = news.cctv.com 的 JSONP 接口, "json_index" = 子域名的 data/index.json
COLUMNS = [
    {"name": "新闻",  "type": "jsonp",      "api_name": "news"},
    {"name": "国内",  "type": "jsonp",      "api_name": "china"},
    {"name": "国际",  "type": "jsonp",      "api_name": "world"},
    {"name": "经济",  "type": "jsonp",      "api_name": "economy"},
    {"name": "社会",  "type": "jsonp",      "api_name": "society"},
    {"name": "法治",  "type": "jsonp",      "api_name": "law"},
    {"name": "文娱",  "type": "jsonp",      "api_name": "ent"},
    {"name": "科技",  "type": "jsonp",      "api_name": "tech"},
    {"name": "生活",  "type": "jsonp",      "api_name": "life"},
    {"name": "军事",  "type": "json_index",  "domain": "military"},
]

ALL_COLUMN_NAMES = [c["name"] for c in COLUMNS]

JSONP_TEMPLATE = 'https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/{name}_1.jsonp'
JSON_INDEX_TEMPLATE = 'https://{domain}.cctv.com/data/index.json'
XML_TEMPLATE = 'https://news.cctv.com/{year}/{month}/{day}/{id}.xml'

# ======================== 工具函数 ========================

def get_beijing_tz():
    return timezone(timedelta(hours=8))

def get_date_stamp(arg_date=None):
    if arg_date:
        return arg_date
    return datetime.now(get_beijing_tz()).strftime('%Y%m%d')

def parse_date_stamp(ds):
    return ds[:4], ds[4:6], ds[6:8]

def get_chinese_date(ds):
    return f"{ds[:4]}年{int(ds[4:6])}月{int(ds[6:8])}日"

def get_weekday(ds):
    d = datetime(int(ds[:4]), int(ds[4:6]), int(ds[6:8]))
    weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return weekdays[d.weekday()]

def safe_get(url, timeout=TIMEOUT):
    for attempt in range(RETRY):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            r.encoding = 'utf-8'
            if r.status_code == 200:
                return r
        except Exception as e:
            if attempt == 0:
                time.sleep(2)
                continue
            raise
    return None

def parse_jsonp(text):
    """解析JSONP响应: news({...}) 或 ({...})"""
    m = re.search(r'^\w+\s*\(\s*(\{.*\})\s*\)\s*$', text.strip(), re.DOTALL)
    if m:
        return json.loads(m.group(1))
    m = re.search(r'\(\s*(\{.*\})\s*\)$', text.strip(), re.DOTALL)
    if m:
        return json.loads(m.group(1))
    return None

def normalize_item(item, date_stamp, source_type='jsonp'):
    """
    将不同API格式的新闻条目统一为标准结构
    返回标准化的 dict，如果日期不匹配返回 None
    """
    # 先判断日期
    if source_type == 'jsonp':
        dt = item.get('focus_date', '')[:10].replace('-', '')
    else:
        dt = item.get('dateTime', '')[:10].replace('-', '')

    if dt != date_stamp:
        return None

    # 只保留 ARTI 类型（文字新闻），过滤 PHOA 等
    item_type = item.get('type', 'ARTI')
    if item_type not in ('ARTI', ''):
        return None

    entry = {
        'id': item.get('id', ''),
        'title': item.get('title', '').strip(),
        'url': item.get('url', ''),
    }

    # 不同来源的字段名映射
    if source_type == 'jsonp':
        entry['brief'] = item.get('brief', '').strip()
        entry['dateTime'] = item.get('focus_date', '')
        entry['keywords'] = item.get('keywords', '')
        entry['image'] = item.get('image', '')
    else:  # json_index
        entry['brief'] = item.get('description', item.get('brief', '')).strip()
        entry['dateTime'] = item.get('dateTime', '')
        entry['keywords'] = item.get('keywords', item.get('content', ''))
        entry['image'] = item.get('image', '')

    # 补全 URL 协议
    if entry['url'] and entry['url'].startswith('//'):
        entry['url'] = 'https:' + entry['url']

    return entry

def extract_full_content(item_id, date_stamp):
    """从XML接口获取文章全文"""
    year, month, day = parse_date_stamp(date_stamp)
    url = XML_TEMPLATE.format(year=year, month=month, day=day, id=item_id)
    r = safe_get(url)
    if not r:
        return None

    try:
        soup = BeautifulSoup(r.text, 'xml')
        content_el = soup.find('CONTENT')
        if content_el and content_el.text:
            raw_html = content_el.text
            raw_html = re.sub(r'\[!--begin:.*?end--\]', '', raw_html)
            text = BeautifulSoup(raw_html, 'lxml').get_text(separator=' ', strip=True)
            text = re.sub(r'\s+', ' ', text).strip()
            if len(text) > 30:
                return text
    except Exception:
        pass
    return None

def fetch_column(column_config, date_stamp, fetch_detail=False):
    """
    从API获取某个栏目的新闻列表
    column_config: {name, type, api_name (for jsonp), domain (for json_index)}
    返回: [normalized_item, ...]
    """
    # 构造 URL
    if column_config['type'] == 'jsonp':
        url = JSONP_TEMPLATE.format(name=column_config['api_name'])
    else:
        url = JSON_INDEX_TEMPLATE.format(domain=column_config['domain'])

    r = safe_get(url)
    if not r:
        print(f'  ✗ 请求失败: {url}')
        return []

    # 解析数据
    if column_config['type'] == 'jsonp':
        data = parse_jsonp(r.text)
        if not data:
            print(f'  ✗ JSONP解析失败')
            return []
        raw_items = data.get('data', {}).get('list', [])
    else:
        try:
            data = r.json()
        except json.JSONDecodeError:
            print(f'  ✗ JSON解析失败')
            return []
        raw_items = data.get('rollData', [])

    if not raw_items:
        return []

    # 标准化并过滤
    items = []
    for item in raw_items:
        entry = normalize_item(item, date_stamp, column_config['type'])
        if entry is None:
            continue

        # 可选：获取全文
        if fetch_detail and entry['id'] and entry['id'].startswith('ARTI'):
            content = extract_full_content(entry['id'], date_stamp)
            if content:
                entry['content'] = content

        items.append(entry)

    return items

def save_column_json(column_name, items, date_stamp):
    """保存栏目新闻为JSON文件"""
    output_dir = os.path.join(OUTPUT_BASE, date_stamp)
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(output_dir, f'{column_name}.json')

    data = {
        'date': date_stamp,
        'column': column_name,
        'count': len(items),
        'updatedAt': datetime.now(get_beijing_tz()).strftime('%Y-%m-%d %H:%M:%S'),
        'items': items,
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return output_path

def check_if_complete(date_stamp):
    """检查当天数据是否已经完整获取（增量判断）"""
    output_dir = os.path.join(OUTPUT_BASE, date_stamp)
    if not os.path.isdir(output_dir):
        return False

    for col in ALL_COLUMN_NAMES:
        filepath = os.path.join(output_dir, f'{col}.json')
        if not os.path.isfile(filepath) or os.path.getsize(filepath) < 50:
            return False
    return True

# ======================== 主流程 ========================

def main():
    args = sys.argv[1:]
    arg_date = ''
    force_refetch = False
    fetch_detail = False

    for a in args:
        if a.startswith('--date='):
            arg_date = a[7:]
        elif a == '--force':
            force_refetch = True
        elif a == '--detail':
            fetch_detail = True

    date_stamp = get_date_stamp(arg_date)
    chinese_date = get_chinese_date(date_stamp)
    weekday = get_weekday(date_stamp)
    output_dir = os.path.join(OUTPUT_BASE, date_stamp)

    print()
    print('=' * 50)
    print(f'  央视新闻每日获取 - 栏目API模式')
    print(f'  日期: {chinese_date} ({weekday})')
    print(f'  输出: {output_dir}')
    print(f'  全文: {"是" if fetch_detail else "否（仅摘要）"}')
    print('=' * 50)
    print()

    # ===== 增量检查 =====
    if not force_refetch and check_if_complete(date_stamp):
        print(f'✅ 当天数据已完整获取，跳过')
        print(f'   目录: {output_dir}')
        return

    # ===== 获取各栏目 =====
    print('【获取】从各栏目API获取当天新闻...')
    print()

    column_items = {}
    total_items = 0

    for col_config in COLUMNS:
        col_name = col_config['name']
        api_desc = col_config.get('api_name', col_config.get('domain', '?'))
        print(f'  [{col_name}] (/{api_desc}) ...', end=' ')

        items = fetch_column(col_config, date_stamp, fetch_detail)
        column_items[col_name] = items
        print(f'{len(items)} 条')
        total_items += len(items)
        time.sleep(0.3)

    print(f'\n  共获取 {total_items} 条新闻\n')

    # ===== 保存JSON =====
    print('【保存】写入JSON文件...')
    saved_files = []
    for col_name in ALL_COLUMN_NAMES:
        items = column_items.get(col_name, [])
        filepath = save_column_json(col_name, items, date_stamp)
        saved_files.append(filepath)
        print(f'  ✅ {col_name}: {len(items)} 条 → {os.path.basename(filepath)}')

    # 汇总
    summary_path = os.path.join(output_dir, '_summary.json')
    summary = {
        'date': date_stamp,
        'chineseDate': chinese_date,
        'weekday': weekday,
        'columns': {},
        'totalItems': total_items,
        'updatedAt': datetime.now(get_beijing_tz()).strftime('%Y-%m-%d %H:%M:%S'),
    }
    for col_name in ALL_COLUMN_NAMES:
        summary['columns'][col_name] = len(column_items.get(col_name, []))
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f'  ✅ 汇总: {os.path.basename(summary_path)}')
    print()
    print(f'✅ 全部完成！共保存 {len(saved_files)} 个文件')
    print(f'   目录: {output_dir}')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已取消')
        sys.exit(1)
    except Exception as e:
        print(f'\n❌ 错误: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
