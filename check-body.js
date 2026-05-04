const fs = require('fs');
const https = require('https');
const path = require('path');

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

  const imgDir = path.join('D:/hexo/source/images/hotnews');
  let body = '';

  allNews.forEach((item, i) => {
    const firstChar = item.title.charAt(0);
    const restTitle = item.title.slice(1);
    if (item.img) {
      const filename = `${dateFile}_morning_${String(i+1).padStart(2,'0')}.webp`;
      const filepath = path.join(imgDir, filename);
      if (fs.existsSync(filepath) || fs.existsSync(filepath.replace('.webp','.jpg'))) {
        const localImg = `/images/hotnews/${filename}`;
        body += `<img src="${localImg}" class="hotnews-img" alt="热搜配图">\n`;
      }
    }
    body += `### <strong>${firstChar}</strong>${restTitle}\n`;
    if (item.desc) body += `${item.desc}\n`;
    body += `\n`;
  });

  // Debug: find first <img> in body
  const imgIdx = body.indexOf('<img');
  console.log('First img at:', imgIdx);
  console.log(JSON.stringify(body.slice(Math.max(0, imgIdx - 30), imgIdx + 120)));

  // Test regex
  const pattern = /\n(<img src="\/images\/hotnews\/[^"]*"[^>]*>)\n\n(### <strong>[^\n]+\n(?:(?!<img)[\s\S])*?)(?=\n\n<img|\n\n###|$)/g;
  const matches = body.match(pattern);
  console.log('Pattern matches:', matches ? matches.length : 0);
  if (matches) console.log('First match:', JSON.stringify(matches[0].slice(0, 100)));
}

main().catch(e => console.error(e.message));
