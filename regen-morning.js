const fs = require('fs');
const https = require('https');
const path = require('path');

// 原始抓取逻辑
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchBaiduHot() {
  const html = await httpGet('https://top.baidu.com/board?tab=realtime');
  const match = html.match(/<!--s-data:(\{.*?\})-->/s);
  if (!match) return [];
  const json = JSON.parse(match[1]);
  const cards = json?.data?.cards || [];
  for (const card of cards) {
    if (card.component === 'hotList' && Array.isArray(card.content)) {
      return card.content
        .filter(item => !item.isTop && !item.pin && !item.isPinned)
        .map(item => ({
          title: item.query || item.word || '',
          desc: item.desc || '',
          url: item.rawUrl || `https://www.baidu.com/s?wd=${encodeURIComponent(item.query || item.word)}`,
          source: '百度热搜',
          img: item.img || ''
        }));
    }
  }
  return [];
}

async function main() {
  const allNews = await fetchBaiduHot();
  if (allNews.length === 0) { console.log('no data'); return; }

  const now = new Date();
  const dateFile = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const dateStr = `${now.getFullYear()}年${String(now.getMonth()+1).padStart(2,'0')}月${String(now.getDate()).padStart(2,'0')}日`;
  const title = `${dateStr} 小红故事热搜晨报`;

  const imgDir = path.join('D:/hexo/source/images/hotnews');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  let body = `> 来源：互联网 | 采集时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;

  allNews.forEach((item, i) => {
    const firstChar = item.title.charAt(0);
    const restTitle = item.title.slice(1);
    // 图片在前，文字在后（float: right 让文字向左环绕）
    if (item.img) {
      const filename = `${dateFile}_morning_${String(i+1).padStart(2,'0')}.webp`;
      const filepath = path.join(imgDir, filename);
      // 图片已存在则复用
      if (fs.existsSync(filepath) || fs.existsSync(filepath.replace('.webp','.jpg'))) {
        const localImg = `/images/hotnews/${filename}`;
        body += `<img src="${localImg}" class="hotnews-img" alt="热搜配图">\n`;
      }
    }
    body += `### <strong>${firstChar}</strong>${restTitle}\n`;
    if (item.desc) body += `${item.desc}\n`;
    body += `\n`;
  });

  const frontmatter = {
    title,
    date: now,
    updated: now,
    categories: ['新闻热搜'],
    tags: ['热搜', '今日要闻'],
    cover: '/images/hotnews-morning.svg',
    toc: true
  };

  const fm = `---\n${Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map(x => `  - ${x}`).join('\n')}`;
    if (v instanceof Date) return `${k}: ${v.toISOString().slice(0,19).replace(/T/, ' ')}`;
    return `${k}: ${v}`;
  }).join('\n')}\n---\n\n`;

  // 交换：每个条目的 img 移到标题+描述之前
  // body 格式：###标题\n描述\n\n<img>\n\n###标题\n
  // \n 在 desc 和 img 之间，\n\n 在 img 和下一个 ### 之间
  const swapped = body.replace(
    /(### <strong>[^\n]+\n(?:(?!<img)[\s\S])*?)\n(<img src="\/images\/hotnews\/[^"]*"[^>]*>)\n\n(?=###|<\/body>|$)/g,
    (m, content, img) => img + '\n' + content + '\n\n'
  );

  const filepath = `D:/hexo/source/_posts/${dateFile}_hotnews_morning.md`;
  fs.writeFileSync(filepath, fm + swapped, 'utf8');
  console.log('written:', filepath, 'items:', allNews.length);
}

main().catch(e => console.error(e.message));
