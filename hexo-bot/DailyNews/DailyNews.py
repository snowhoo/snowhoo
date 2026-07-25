#!/usr/bin/env python3
"""
DailyNews.py — 冯站长之家每日新闻获取（独立运行版）

功能: 自动搜索并获取冯站长之家"三分钟新闻早餐"内容，保存为JSON

运行方式:
  python DailyNews.py                    # 自动模式（搜索+获取+保存）
  python DailyNews.py --url=<文章URL>    # 手动指定URL模式
  python DailyNews.py --date=20260725    # 指定日期（默认今天）

依赖: pip install requests beautifulsoup4 lxml

输出: news/YYYYMMDD.json
"""

import requests
import re
import json
import os
import sys
import time
from datetime import datetime
from bs4 import BeautifulSoup

# ======================== 配置 ========================
NEWS_DIR = os.path.join(os.path.dirname(__file__), 'news')
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
TIMEOUT = 15
COLUMN_URL = 'https://www.jintiankansha.com/column/yLeQtrbPhc'

# ======================== 工具函数 ========================

def get_date_stamp(arg_date=None):
    if arg_date:
        return arg_date
    now = datetime.now()
    return now.strftime('%Y%m%d')

def get_chinese_date(date_stamp):
    return f"{date_stamp[:4]}年{int(date_stamp[4:6])}月{int(date_stamp[6:8])}日"

def get_short_date(date_stamp):
    return f"{int(date_stamp[4:6])}月{int(date_stamp[6:8])}日"

def get_weekday(date_stamp):
    d = datetime(int(date_stamp[:4]), int(date_stamp[4:6]), int(date_stamp[6:8]))
    weekdays = ['周一','周二','周三','周四','周五','周六','周日']
    return weekdays[d.weekday()]

def safe_get(url, timeout=TIMEOUT):
    """带重试的HTTP请求"""
    for attempt in range(2):
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

# ======================== URL 发现策略 ========================

def find_via_jintiankansha(date_stamp):
    """策略1: 从今天看啥专栏页获取文章标题"""
    print(f'[策略1] 从今天看啥专栏页获取文章信息...')
    r = safe_get(COLUMN_URL)
    if not r:
        print(f'  ✗ 专栏页获取失败')
        return None
    
    chinese_date = get_chinese_date(date_stamp)
    short_date = get_short_date(date_stamp)
    
    # 用BeautifulSoup解析文章列表
    soup = BeautifulSoup(r.text, 'lxml')
    links = soup.find_all('a', href=re.compile(r'jintiankansha\.com/t/'))
    
    for link in links:
        title = link.get_text(strip=True)
        href = link.get('href', '')
        if '三分钟新闻早餐' in title and (chinese_date in title or short_date in title):
            print(f'  ✓ 找到文章: {title}')
            print(f'  ✓ 链接: {href}')
            return {'title': title, 'link': href}
    
    # 正则兜底
    pattern = re.compile(r'href="(http://www\.jintiankansha\.com/t/[^"]+)"[^>]*>([^<]*?三分钟新闻早餐[^<]*)</a>')
    for match in pattern.finditer(r.text):
        link, title = match.group(1), match.group(2).strip()
        if chinese_date in title or short_date in title:
            print(f'  ✓ 找到文章(正则): {title}')
            return {'title': title, 'link': link}
    
    print(f'  ✗ 未找到 {chinese_date} 的文章')
    return None

def find_via_ddgs(date_stamp):
    """策略2: 通过DuckDuckGo搜索（先用ddgs库）"""
    try:
        from ddgs import DDGS
    except ImportError:
        print(f'  [提示] 未安装ddgs库，跳过')
        return None
    
    chinese_date = get_chinese_date(date_stamp)
    short_date = get_short_date(date_stamp)
    
    # 多组搜索查询
    queries = [
        f'冯站长之家 三分钟新闻早餐 {short_date} site:topnews.cn',
        f'冯站长之家 三分钟新闻早餐 {chinese_date} site:sohu.com',
        f'冯站长之家 三分钟新闻早餐 {short_date}',
    ]
    
    for query in queries:
        try:
            print(f'[策略2] 搜索: {query[:40]}...')
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=5))
                
            for r in results:
                href = r.get('href', '')
                title = r.get('title', '')
                # 只取冯站长之家相关的文章
                if ('冯站长' in title or '冯站长' in href or '新闻早餐' in title) and \
                   any(x in href for x in ['topnews.cn', 'sohu.com', '163.com', 'mp.weixin']):
                    print(f'  ✓ 找到: [{href[:80]}] {title[:40]}')
                    return {'url': href, 'source': 'ddgs', 'title': title}
        except Exception as e:
            print(f'  ddgs搜索失败: {str(e)[:50]}')
            continue
    
    return None

def find_via_bing(date_stamp):
    """策略3: 直搜cn.bing.com（JS渲染，可能找不到URL但可确认文章存在性）"""
    print(f'[策略3] Bing搜索...')
    queries = [
        f'冯站长之家 三分钟新闻早餐 {get_short_date(date_stamp)} 顶端',
        f'冯站长之家 三分钟新闻 {get_short_date(date_stamp)}',
    ]
    
    for q in queries:
        try:
            url = f'https://cn.bing.com/search?q={requests.utils.quote(q)}&ensearch=0'
            r = safe_get(url)
            if not r:
                continue
            
            # 检查是否包含文章内容（确认文章存在）
            if '冯站长之家' in r.text and '三分钟新闻早餐' in r.text:
                print(f'  ✓ Bing确认文章存在')
                # 尝试提取URL
                urls = re.findall(r'href="(https?://(?:www\.)?(?:topnews\.cn|sohu\.com|163\.com|mp\.weixin\.qq\.com)[^"]+)"', r.text)
                for u in urls:
                    print(f'  → {u[:100]}')
                    return {'url': u, 'source': 'bing'}
                # 有内容但没找到URL（JS渲染）
                print(f'  ⚠ 文章存在但URL被JS渲染隐藏')
                return {'found': True, 'source': 'bing'}
        except Exception as e:
            continue
    
    return None

# ======================== 内容提取 ========================

def extract_wechat_content(html):
    """从微信文章HTML提取正文"""
    soup = BeautifulSoup(html, 'lxml')
    
    # 找 js_content div
    js_content = soup.find(id='js_content')
    if js_content:
        return js_content.get_text(separator=' ', strip=True)
    
    # 找 rich_media_content
    rich = soup.find(class_=re.compile(r'rich_media_content'))
    if rich:
        return rich.get_text(separator=' ', strip=True)
    
    # 回退
    return soup.get_text(separator=' ', strip=True)

def extract_topnews_content(html):
    """从顶端新闻HTML提取正文"""
    soup = BeautifulSoup(html, 'lxml')
    
    for selector in ['.article-content', '.content', 'article', '.detail-content']:
        el = soup.select_one(selector)
        if el:
            return el.get_text(separator=' ', strip=True)
    
    return soup.get_text(separator=' ', strip=True)

def extract_title(html, url=''):
    """提取文章标题"""
    soup = BeautifulSoup(html, 'lxml')
    
    # meta og:title
    og = soup.find('meta', property='og:title')
    if og and og.get('content'):
        return og['content'].strip()
    
    # title标签
    title_tag = soup.find('title')
    if title_tag:
        t = title_tag.get_text(strip=True)
        for suffix in ['_微信公众平台', '_微信', '_顶端新闻', '_网易']:
            t = t.replace(suffix, '')
        return t.strip()
    
    # h1
    h1 = soup.find('h1')
    if h1:
        return h1.get_text(strip=True)
    
    return ''

def get_content(html, url):
    """智能选择解析器"""
    if 'mp.weixin.qq.com' in url or 'weixin' in url:
        return extract_wechat_content(html)
    elif 'topnews.cn' in url:
        return extract_topnews_content(html)
    else:
        text = extract_wechat_content(html)
        if len(text) < 100:
            text = extract_topnews_content(html)
        return text

def normalize_text(text):
    """合并HTML换行导致的词语断裂，然后重建编号行的换行"""
    text = re.sub(r'\n+', '\n', text)
    
    # 先合并断行
    lines = text.split('\n')
    merged = []
    buf = ''
    for line in lines:
        t = line.strip()
        if not t:
            if buf:
                merged.append(buf)
                buf = ''
            continue
        if buf:
            last = buf[-1]
            first = t[0] if t else ''
            no_merge_after = '。，！？、：；""）)]】'
            no_merge_before = '）)]】\\d.'
            if last in no_merge_after or first in no_merge_before:
                merged.append(buf)
                buf = t
            else:
                buf += t
        else:
            buf = t
    if buf:
        merged.append(buf)
    
    # 重建编号行换行：在"1）""2）"等前面加换行
    result = []
    for line in merged:
        # 合并数字断裂（如 "1\n0）" → "10）"）
        line = re.sub(r'(\d)\s+(\d)', r'\1\2', line)
        # 在编号前换行，如 "1）xxx2）xxx3）xxx" → 分行
        parts = re.split(r'(\d[）\)])', line)
        i = 0
        while i < len(parts):
            if re.match(r'\d[）\)]', parts[i]):
                result.append(parts[i] + (parts[i+1] if i+1 < len(parts) else ''))
                i += 2
            else:
                if parts[i].strip():
                    result.append(parts[i])
                i += 1
    
    # 修复编号重建导致的"1\n0）"断裂：如 "重点。 1" + "0）" → "重点。 10）"
    i = 0
    while i < len(result) - 1:
        cur = result[i].strip()
        nxt = result[i+1].strip()
        # 当前行以数字结尾，下一行以数字+）开头 → 合并
        m1 = re.match(r'^(.+?\D)(\d)$', cur)
        m2 = re.match(r'^(\d)([）\)])(.*)$', nxt)
        if m1 and m2:
            result[i] = m1.group(1) + m2.group(1) + m2.group(2) + m2.group(3)
            result.pop(i+1)
            continue
        i += 1
    
    return '\n'.join(result)

# ======================== 内容清理 ========================

def clean_text(text):
    """清理文章文本：去广告、合并断行、去尾部"""
    text = normalize_text(text)
    
    # 去顶部广告（第一个"1）"之前的内容）
    m = re.search(r'\n1[）\)]', text)
    if m and m.start() > 0:
        header = text[:m.start()]
        if any(kw in header for kw in ['研究表明', '购', '推荐', '点击', '北大博士', '数据显示', '冯站长精选', '炳济堂', '诺必达']):
            text = text[m.start():]
    
    # 逐行过滤
    ad_patterns = [
        r'^研究表明.*牙膏',
        r'^购\d+支送',
        r'^不满意全额退',
        r'^推荐.*一定要试试',
        r'^点击.*选购',
        r'^点击.*购买',
        r'^数据显示.*颈肩腰腿疼',
        r'^只靠止疼药',
        r'^冯站长精选.*老牌子',
        r'^古法熬制.*也能安心用',
        r'^贴一贴',
        r'^炳济堂',
        r'^诺必达',
        r'^粉丝专属福利',
        r'^北大博士团队',
        r'^\d+\.?\d*\s*元',
        r'^传承\d+年.*老牌子',
        r'^专为颈肩',
        r'^颈椎僵硬',
        r'^温和渗透',
        r'^老人.*敏感肌',
        r'^\*{3,}',
        r'^（来源：新华',
        r'^编辑：冯站长',
        r'^播音：',
        r'^推荐阅读',
        r'^点击上方一键',
        r'^大家好，建议',
        r'^扫描.*二维码',
        r'^预览时标签',
        r'^▶\s*',
        r'^冯站长亲测定制',
        r'^每周一曲',
        r'^一日一诗',
        r'^防失联',
        r'^申请加入',
        r'^全场\d+折',
        r'^年卡仅需',
        r'^开通即赠',
        r'^海量权益',
    ]
    compiled = [re.compile(p) for p in ad_patterns]
    
    lines = [l for l in text.split('\n') if l.strip()]
    cleaned = []
    for line in lines:
        t = line.strip()
        is_ad = False
        for p in compiled:
            if p.match(t):
                is_ad = True
                break
        if not is_ad:
            cleaned.append(t)
    
    text = '\n'.join(cleaned)
    
    # 去尾部（来源/编辑标注之后全删）— 兼容有换行和没换行的情况
    tail_markers = ['（来源：新华', '编辑：冯站长', '推荐阅读']
    cut_pos = len(text)
    for marker in tail_markers:
        pos = text.find(marker)
        if pos != -1 and pos < cut_pos:
            cut_pos = pos
    text = text[:cut_pos].strip()

    # 去健康板块内嵌跨行广告
    text = re.sub(r' 数据显示[\s\S]*?(?:购买|选购)', ' ', text)
    text = re.sub(r' 传承\d+年[\s\S]*?(?:选购|购买)', ' ', text)
    
    # 清理多余空格
    text = re.sub(r' {2,}', ' ', text)
    
    return text.strip()

def split_sections(text):
    """按板块分段"""
    sections = {'国内': [], '国际': [], '财经': [], '文教': [], '社会': [], '健康': []}
    section_names = list(sections.keys())
    section_idx = 0
    current = section_names[0] if section_names else '国内'
    
    for line in text.split('\n'):
        t = line.strip()
        if not t:
            continue
        # 新板块开始：1）或1)
        if re.match(r'^1[）\)]', t):
            if section_idx < len(section_names):
                current = section_names[section_idx]
                section_idx += 1
        
        if current in sections:
            sections[current].append(t)
    
    return {k: '\n'.join(v) for k, v in sections.items() if v}

# ======================== 主流程 ========================

def main():
    # 解参数
    args = sys.argv[1:]
    arg_url = ''
    arg_date = ''
    for a in args:
        if a.startswith('--url='):  arg_url = a[6:]
        if a.startswith('--date='): arg_date = a[7:]
    
    date_stamp = get_date_stamp(arg_date)
    output_path = os.path.join(NEWS_DIR, f'{date_stamp}.json')
    chinese_date = get_chinese_date(date_stamp)
    
    print()
    print('=' * 40)
    print(f'  冯站长之家 每日新闻获取')
    print(f'  日期: {chinese_date} ({get_weekday(date_stamp)})')
    print(f'  输出: {output_path}')
    print('=' * 40)
    print()
    
    # 检查是否已获取
    if os.path.exists(output_path):
        print(f'✅ 今日新闻已存在: {output_path}')
        return
    
    os.makedirs(NEWS_DIR, exist_ok=True)
    
    # ===== URL发现 =====
    article_url = arg_url
    article_title = ''
    source_name = ''
    
    if not article_url:
        print('[URL发现] 自动搜索文章...\n')
        
        # 策略1: jintiankansha专栏页（获取标题）
        column_info = None
        try:
            column_info = find_via_jintiankansha(date_stamp)
            if column_info:
                article_title = column_info.get('title', '')
        except Exception as e:
            print(f'  ✗ 专栏页失败: {e}')
        
        # 策略2: ddgs搜索
        try:
            result = find_via_ddgs(date_stamp)
            if result and result.get('url'):
                article_url = result['url']
                source_name = 'ddgs搜索'
                if not article_title:
                    article_title = result.get('title', '')
                print(f'  ✓ 通过ddgs获取URL: {article_url[:100]}')
        except Exception as e:
            print(f'  ✗ ddgs搜索失败: {e}')
        
        # 策略3: Bing直搜
        if not article_url:
            try:
                result = find_via_bing(date_stamp)
                if result and result.get('url'):
                    article_url = result['url']
                    source_name = 'Bing搜索'
            except Exception as e:
                print(f'  ✗ Bing搜索失败: {e}')
        
        if not article_url:
            print()
            print('❌ 无法自动发现文章URL')
            if article_title:
                print(f'   今日文章标题: {article_title}')
            print()
            print('请手动传入URL:')
            print(f'  python DailyNews.py --url=https://www.topnews.cn/news/XXX')
            print(f'  python DailyNews.py --url=https://mp.weixin.qq.com/s/XXX')
            sys.exit(1)
    else:
        print(f'[手动] 使用指定URL: {article_url}')
        source_name = '手动输入'
    
    # ===== 获取内容 =====
    print(f'\n[获取] 请求文章...')
    r = safe_get(article_url)
    if not r:
        print(f'❌ 获取失败')
        sys.exit(1)
    print(f'  ✓ HTML {len(r.text)} bytes')
    
    # ===== 解析 =====
    print(f'[解析] 提取正文...')
    title = extract_title(r.text, article_url) or article_title or f'冯站长之家 {chinese_date} 三分钟新闻早餐'
    raw_text = get_content(r.text, article_url)
    
    if not raw_text or len(raw_text) < 100:
        print(f'❌ 内容过短({len(raw_text) if raw_text else 0}字)，可能被反爬')
        sys.exit(1)
    
    print(f'  ✓ 原始正文 {len(raw_text)} 字')
    
    # ===== 清理 =====
    print(f'[清理] 去广告...')
    clean = clean_text(raw_text)
    sections = split_sections(clean)
    
    # ===== 保存 =====
    data = {
        'date': date_stamp,
        'title': title,
        'source': source_name,
        'url': article_url,
        'content': clean,
        'sections': sections,
        'fetchedAt': datetime.now().isoformat(),
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f'\n✅ 保存成功: {output_path}')
    print(f'   标题: {title}')
    print(f'   正文: {len(clean)} 字')
    print(f'   板块: {", ".join(sections.keys())}')

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n已取消')
        sys.exit(1)
    except Exception as e:
        print(f'\n❌ 错误: {e}')
        sys.exit(1)
