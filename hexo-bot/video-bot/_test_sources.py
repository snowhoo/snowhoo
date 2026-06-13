import json, subprocess, os

bot_dir = r'D:\hexo\hexo-bot\video-bot'
with open(os.path.join(bot_dir, 'config.json'), 'r', encoding='utf-8') as f:
    config = json.load(f)

sources = config['sources']
print(f'Total sources: {len(sources)}')

for i, item in enumerate(sources):
    # 兼容旧格式（纯字符串）和新格式（{name,url}）
    if isinstance(item, str):
        url = item
        name = item[:30]
    else:
        url = item.get('url', '')
        name = item.get('name', url[:30])
    if not url:
        print(f'{i+1:2}. [SKIP] 无 URL')
        continue
    try:
        result = subprocess.run(
            ['curl', '-s', '-o', 'nul', '-w', '%{http_code}', '-m', '5', url],
            capture_output=True, text=True, timeout=10
        )
        code = result.stdout.strip()
        print(f'{i+1:2}. [{code}] {name} — {url[:60]}')
    except Exception as e:
        print(f'{i+1:2}. [ERR] {name} — {str(e)[:50]}')