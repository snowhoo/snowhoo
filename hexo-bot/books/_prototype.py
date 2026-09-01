import json, os, shutil

DATA = 'D:/hexo/hexo-bot/books/data'
PROT = 'D:/hexo/hexo-bot/books/_prototype'
CHUNK = 10  # 每文件章节数

# ---- 短键映射（精简 metadata）----
def compact_book(b):
    return {
        'id': b.get('id'),
        't': b.get('title'),
        'a': b.get('author'),
        'c': b.get('category'),
        's': b.get('status'),
        'cv': b.get('cover'),
        'i': (b.get('intro') or '')[:300],   # 简介截断，省空间
        'n': len(b.get('chapters', [])),
        'hc': bool(b.get('content')),
        'at': b.get('crawled_at') or b.get('content_crawled_at'),
    }

# 重建「标题\n正文」字符串（模拟下载时把标题并入正文）
def entry(title, body):
    return (title or '') + '\n' + (body or '')

# ---- 用本地 517128 验证新格式 ----
shutil.rmtree(PROT, ignore_errors=True)
os.makedirs(PROT, exist_ok=True)
b = json.load(open(os.path.join(DATA, '517128.json'), encoding='utf-8'))
chs = b.get('chapters', [])
content = b.get('content', {})
pairs = [(c['title'], content.get(c['cid'], '')) for c in chs]

# 新格式写盘
nb = compact_book(b)
nb_path = os.path.join(PROT, '517128', 'book.json')
os.makedirs(os.path.dirname(nb_path), exist_ok=True)
json.dump(nb, open(nb_path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

chunk_files = 0
max_chunk = 0
for i in range(0, len(pairs), CHUNK):
    grp = pairs[i:i+CHUNK]
    arr = [entry(t, body) for t, body in grp]
    p = os.path.join(PROT, '517128', 'c%02d.json' % (i//CHUNK + 1))
    json.dump(arr, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    chunk_files += 1
    max_chunk = max(max_chunk, os.path.getsize(p))

old_size = os.path.getsize(os.path.join(DATA, '517128.json'))
new_total = os.path.getsize(nb_path) + sum(
    os.path.getsize(os.path.join(PROT, '517128', f)) for f in os.listdir(os.path.join(PROT, '517128')))
new_files = os.listdir(os.path.join(PROT, '517128'))

# 校验回读
arr0 = json.load(open(os.path.join(PROT, '517128', 'c01.json'), encoding='utf-8'))
rebuilt_title = arr0[0].split('\n', 1)[0]
print('=== 517128 实测（7 章）===')
print('旧单文件大小: %.3f KB' % (old_size/1024))
print('新格式文件: %s' % new_files)
print('新 book.json: %.3f KB | 内容分片总数: %d | 最大分片: %.3f KB'
      % (os.path.getsize(nb_path)/1024, chunk_files, max_chunk/1024))
print('新格式合计: %.3f KB（vs 旧 %.3f KB）' % (new_total/1024, old_size/1024))
print('回读首章标题: %s' % rebuilt_title)
print('回读章节数: %d (期望 %d)' % (len(arr0), len(pairs)))

# ---- 模拟大书（14400 章）体积对比 ----
print('\n=== 模拟 14400 章大书 体积对比 ===')
AVG_CHAR = 2800          # 单章正文均长
BYTE = 2                 # 中文 utf-8 约 2 字节
PER_CH_META = 90         # 旧格式每章 {cid,title,url} 约 90B
ch = 14400
old_single = ch*(PER_CH_META + AVG_CHAR*BYTE)          # 旧：chapters数组+content同文件
new_book = 300                                           # 新 book.json ~300B
new_chunks = (ch + CHUNK - 1)//CHUNK
new_max = CHUNK*AVG_CHAR*BYTE                           # 单分片最大
new_total_big = new_book + new_chunks*CHUNK*AVG_CHAR*BYTE
print('旧格式单文件: %.1f MB（一打开就下载这么多）' % (old_single/1e6))
print('新格式: book.json %.0f B + %d 个分片，单分片最大 %.1f KB，内容总量 %.1f MB'
      % (new_book, new_chunks, new_max/1024, new_total_big/1e6))
print('-> 单文件上限从 %.1f MB 降到 %.1f KB' % (old_single/1e6, new_max/1024))

# 全站对象数估算（新格式）
print('\n=== 全站对象数估算（新格式, 10章/文件）===')
import glob
fs = [f for f in os.listdir(DATA) if f.endswith('.json') and not f.startswith('index')]
total_ch = 0
for f in fs[:2000]:
    try:
        d = json.load(open(os.path.join(DATA, f), encoding='utf-8'))
    except: 
        continue
    total_ch += len(d.get('chapters', []))
avg_ch = total_ch/2000
est_books = 10615
est_ch = int(avg_ch*est_books)
est_chunks = (est_ch + CHUNK - 1)//CHUNK
print('抽样 2000 本平均章数: %.0f | 全站估算章数: %d' % (avg_ch, est_ch))
print('全站内容分片文件数 ≈ %d（每书1个book.json + 分片）' % (est_books + est_chunks))
print('注: R2 免费额度 1000万次写入/月、对象数无硬性上限，此量级安全')
