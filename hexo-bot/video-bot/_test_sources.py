import json, subprocess, os

bot_dir = r'D:\hexo\hexo-bot\video-bot'
with open(os.path.join(bot_dir, 'config.json'), 'r', encoding='utf-8') as f:
    config = json.load(f)

sources = config['sources']
print(f'Total sources: {len(sources)}')

for i, url in enumerate(sources):
    try:
        result = subprocess.run(
            ['curl', '-s', '-o', 'nul', '-w', '%{http_code}', '-m', '5', url],
            capture_output=True, text=True, timeout=10
        )
        code = result.stdout.strip()
        print(f'{i+1:2}. [{code}] {url[:70]}')
    except Exception as e:
        print(f'{i+1:2}. [ERR] {str(e)[:50]}')