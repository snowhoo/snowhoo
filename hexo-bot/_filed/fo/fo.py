# -*- coding: utf-8 -*-
"""
佛颂音频数据爬虫 - 基于 y.fzps.org/lm.htm 分类结构
按用户8个分类输出单独JS文件
"""
import urllib.request, ssl, re, json, os, time
ssl._create_default_https_context = ssl._create_unverified_context

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
BASE = 'https://y.fzps.org'
OUTPUT_DIR = r'D:\hexo\source\js\sevencolor\1\fo_data'

# ===== 步骤1: 定义分类结构 =====
# 从 lm.htm 提取的8个主分类及其子分类URL
CATEGORY_STRUCTURE = [
    {
        'name': '佛教歌曲',
        'filename': 'fo_01_feige.js',
        'icon': '🎵',
        'subcats': [
            ('耀一法师', '/b23.htm'), ('黄慧音', '/b24.htm'), ('黄帅', '/b25.htm'),
            ('慧普法师', '/b26.htm'), ('童声', '/b27.htm'), ('印良法师', '/b28.htm'),
            ('印能法师', '/b29.htm'), ('则旭法师', '/b30.htm'), ('桑吉平措', '/b39.htm'),
            ('怀静法师', '/b42.htm'), ('乔安舞', '/b51.htm'), ('柯佩磊', '/b52.htm'),
            ('李佳宁', '/b53.htm'), ('李文发', '/b54.htm'), ('门盛法师', '/b55.htm'),
            ('宗铄法师', '/b58.htm'), ('果慧法师', '/b88.htm'), ('衍祥法师', '/b89.htm'),
            ('莲歌子歌曲', '/b92.htm'), ('李娜', '/b93.htm'), ('上官萍', '/b94.htm'),
            ('任静', '/b95.htm'), ('圣净法师', '/b96.htm'), ('许俊华', '/b100.htm'),
            ('齐豫', '/b101.htm'), ('传愿法师', '/b102.htm'), ('孟庭苇', '/b103.htm'),
            ('心悦法师', '/b104.htm'), ('龚玥', '/b105.htm'), ('陈振国', '/b106.htm'),
            ('周亮', '/b107.htm'),
        ]
    },
    {
        'name': '念佛佛号',
        'filename': 'fo_02_nianfo.js',
        'icon': '🙏',
        'subcats': [
            ('弥陀圣号', '/b1.htm'), ('观音圣号', '/b2.htm'), ('地藏圣号', '/b3.htm'),
            ('释迦佛圣号', '/b4.htm'), ('药师佛圣号', '/b5.htm'), ('东林佛号', '/b84.htm'),
            ('开松老和尚', '/b91.htm'),
        ]
    },
    {
        'name': '咒语系列',
        'filename': 'fo_03_zhouyu.js',
        'icon': '📿',
        'subcats': [
            ('大悲咒', '/b6.htm'), ('楞严咒', '/b7.htm'), ('六字大明咒', '/b8.htm'),
            ('往生咒', '/b9.htm'), ('药师咒', '/b10.htm'), ('准提咒', '/b11.htm'),
            ('文殊心咒', '/b38.htm'), ('灭定业真言', '/b98.htm'),
        ]
    },
    {
        'name': '佛经念诵',
        'filename': 'fo_04_niansong.js',
        'icon': '📖',
        'subcats': [
            ('弥陀经念诵', '/b12.htm'), ('地藏经念诵', '/b13.htm'), ('法华经念诵', '/b14.htm'),
            ('华严经念诵', '/b15.htm'), ('金刚经念诵', '/b16.htm'), ('楞严经念诵', '/b17.htm'),
            ('普门品念诵', '/b18.htm'), ('无量寿经念诵', '/b19.htm'), ('心经念诵', '/b20.htm'),
            ('药师经念诵', '/b21.htm'), ('早晚课', '/b22.htm'), ('普贤行愿品', '/b37.htm'),
            ('涅槃经念诵', '/b40.htm'), ('慧律法师念诵', '/b43.htm'), ('仁炟法师', '/b46.htm'),
            ('聆志居士', '/b47.htm'), ('善音居士', '/b48.htm'), ('妙喜居士', '/b49.htm'),
            ('慧平法师', '/b50.htm'), ('佛光山唱诵', '/b86.htm'), ('法鼓山唱诵', '/b87.htm'),
            ('文殊讲堂', '/b90.htm'), ('栴檀居士', '/b117.htm'), ('莲唤居士', '/b118.htm'),
        ]
    },
    {
        'name': '偈赞经忏',
        'filename': 'fo_05_jizan.js',
        'icon': '🎼',
        'subcats': [
            ('心安禅寺唱诵', '/b41.htm'), ('宗泽法师', '/b44.htm'), ('华严字母', '/b45.htm'),
            ('明谷法师', '/b56.htm'), ('文殊院上江腔', '/b57.htm'), ('晨钟暮鼓', '/b85.htm'),
            ('水陆法会', '/b97.htm'), ('忏悔', '/b99.htm'),
        ]
    },
    {
        'name': '清心梵乐',
        'filename': 'fo_06_fanyue.js',
        'icon': '🎶',
        'subcats': [
            ('阿弥陀佛', '/b108.htm'), ('观音菩萨', '/b109.htm'), ('地藏菩萨', '/b110.htm'),
            ('释迦牟尼佛', '/b111.htm'), ('弥勒菩萨', '/b112.htm'), ('药师佛', '/b113.htm'),
            ('文殊菩萨', '/b114.htm'), ('普贤菩萨', '/b115.htm'), ('八十八佛', '/b116.htm'),
        ]
    },
    {
        'name': '有声书',
        'filename': 'fo_07_youshengshu.js',
        'icon': '🔊',
        'subcats': []  # 直接从 5.htm 抓取
    },
    {
        'name': '音频讲座',
        'filename': 'fo_08_jiangzuo.js',
        'icon': '🎙️',
        'subcats': [
            # 法师讲座
            ('大安法师讲座', '/jz59.htm'), ('道证法师讲座', '/jz60.htm'),
            ('宏海法师讲座', '/jz61.htm'), ('惠空法师讲座', '/jz62.htm'),
            ('慧律法师讲座', '/jz63.htm'), ('界诠法师讲座', '/jz64.htm'),
            ('净界法师讲座', '/jz65.htm'), ('梦参法师讲座', '/jz66.htm'),
            ('妙华法师讲座', '/jz67.htm'), ('显明法师讲座', '/jz68.htm'),
            ('智海长老讲座', '/jz69.htm'), ('第一义谛', '/jz70.htm'),
            ('慧律法师楞伽', '/jz71.htm'), ('梦参法师华严', '/jz72.htm'),
            ('大安法师问答', '/jz74.htm'), ('慧律法师楞严', '/jz75.htm'),
            ('印光大师讲座', '/jz76.htm'), ('慧律法师华严', '/jz77.htm'),
            ('慧律法师圆觉', '/jz78.htm'),
            # 佛经开示
            ('地藏经讲座', '/jz73.htm'), ('阿弥陀经讲座', '/jz79.htm'),
            ('楞严经讲座', '/jz80.htm'), ('金刚经讲座', '/jz81.htm'),
            ('临终讲座', '/jz82.htm'), ('心经讲座', '/jz83.htm'),
        ]
    },
]

def fetch_page(url, retries=3):
    """Fetch a page with retry logic"""
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            resp = urllib.request.urlopen(req, timeout=30)
            raw = resp.read()
            return raw.decode('gbk', errors='replace')
        except Exception as e:
            if i < retries - 1:
                time.sleep(2)
                continue
            print(f'  [ERROR] Failed to fetch {url}: {e}', flush=True)
            return None

def scrape_items_from_page(url):
    """
    Universal scraper for all page types (b*.htm, jz*.htm, 5.htm, 6.htm).
    Handles multiple link patterns:
      - <a href="/s/muXXX.htm"> (b pages, with leading /)
      - <a href="s/XXX.htm"> (jz pages, relative)
      - <a href="/s/XXX.htm"> (5.htm, with leading /)
    """
    text = fetch_page(url)
    if not text:
        return []
    
    items = []
    # Combined pattern: matches /s/muXXX.htm, s/XXX.htm, and /s/XXX.htm
    pattern = r'<a href="(/?s/(?:mu)?\d+\.htm)"[^>]*><div class="content">.*?<h2>([^<]+)</h2>.*?<img src="([^"]+)"'
    matches = re.findall(pattern, text, re.DOTALL)
    
    for href, title, cover in matches:
        cover = cover.strip()
        if cover.startswith('//'):
            cover = 'https:' + cover
        # Normalize URL
        if href.startswith('/'):
            detail_url = BASE + href
        else:
            detail_url = BASE + '/' + href
        items.append({
            'title': title.strip(),
            'detail_url': detail_url,
            'url': detail_url,
            'cover': cover,
            'audio': None,
            'text': None,
        })
    return items

def fetch_audio_from_detail(detail_url):
    """
    Fetch audio URL from detail page.
    Music detail (muXXX): <audio src="//yg.yyxcfg.com/a/a/2/540.m4a">
    Lecture detail (s/XXX): audio URL embedded in JavaScript like //yg.yyxcfg.com/a/a/21/dafs/p17612-1.m4a
    """
    text = fetch_page(detail_url)
    if not text:
        return None
    
    # Try audio tag first
    audio_matches = re.findall(r'<audio[^>]*src="([^"]+)"', text)
    if audio_matches:
        src = audio_matches[0]
        if src.startswith('//'):
            src = 'https:' + src
        return src
    
    # Try source tag inside audio
    source_matches = re.findall(r'<source[^>]*src="([^"]+)"', text)
    if source_matches:
        src = source_matches[0]
        if src.startswith('//'):
            src = 'https:' + src
        return src
    
    # Search for yg.yyxcfg.com audio URLs in JavaScript
    js_audio = re.findall(r'(//yg\.yyxcfg\.com[^"\' ]+\.(?:m4a|mp3))', text)
    if js_audio:
        src = js_audio[0]
        if src.startswith('//'):
            src = 'https:' + src
        return src
    
    return None

def save_js_file(category, items):
    """Save items as a JS file"""
    filename = os.path.join(OUTPUT_DIR, category['filename'])
    
    js_items = []
    for item in items:
        js_items.append({
            'title': item['title'],
            'cover': item['cover'],
            'audio': item['audio'] or '',
            'url': item['url'],
            'subcat': item.get('subcat', ''),
        })
    
    js_content = f"""// {category['name']} - 佛颂音频数据
// 总计 {len(js_items)} 条
const fo_{category['filename'].replace('fo_', '').replace('.js', '')} = {json.dumps(js_items, ensure_ascii=False, indent=2)};
"""
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f'  [SAVED] {filename} ({len(js_items)} items)')

# ===== 主流程 =====
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for cat_idx, category in enumerate(CATEGORY_STRUCTURE):
        print(f'\n{"="*60}')
        print(f'[{cat_idx+1}/8] 分类: {category["name"]}')
        print(f'{"="*60}')
        
        all_items = []
        
        if category['name'] == '有声书':
            # 从 5.htm 直接抓取
            print(f'  抓取 5.htm (有声书)...')
            items = scrape_items_from_page(f'{BASE}/5.htm')
            print(f'  找到 {len(items)} 条')
            all_items.extend(items)
            
        elif category['name'] == '音频讲座':
            # 从 6.htm 直接抓取 + 所有子分类
            print(f'  抓取 6.htm (音频讲座)...')
            items = scrape_items_from_page(f'{BASE}/6.htm')
            print(f'  找到 {len(items)} 条')
            all_items.extend(items)
            
            # 再抓取每个子分类
            for sub_name, sub_url in category['subcats']:
                print(f'  抓取子分类 {sub_name} ({sub_url})...')
                items = scrape_items_from_page(BASE + sub_url)
                print(f'    找到 {len(items)} 条')
                for item in items:
                    item['subcat'] = sub_name
                all_items.extend(items)
                
        else:
            # 抓取每个子分类
            for sub_name, sub_url in category['subcats']:
                print(f'  抓取子分类 {sub_name} ({sub_url})...')
                items = scrape_items_from_page(BASE + sub_url)
                print(f'    找到 {len(items)} 条')
                for item in items:
                    item['subcat'] = sub_name
                all_items.extend(items)
        
        # 去重
        seen = set()
        unique_items = []
        for item in all_items:
            key = item['detail_url']
            if key not in seen:
                seen.add(key)
                unique_items.append(item)
        
        print(f'  去重后: {len(unique_items)} 条')
        
        # 抓取音频地址 (限速)
        print(f'  开始抓取音频地址...')
        for idx, item in enumerate(unique_items):
            if idx % 10 == 0:
                print(f'    进度: {idx}/{len(unique_items)}')
            audio = fetch_audio_from_detail(item['detail_url'])
            if audio:
                item['audio'] = audio
            time.sleep(0.3)  # 限速
        
        # 统计有音频的
        with_audio = sum(1 for i in unique_items if i['audio'])
        print(f'  有音频地址: {with_audio}/{len(unique_items)}')
        
        # 保存 JS 文件
        save_js_file(category, unique_items)
    
    print(f'\n{"="*60}')
    print(f'全部完成!')
    print(f'输出目录: {OUTPUT_DIR}')

if __name__ == '__main__':
    main()