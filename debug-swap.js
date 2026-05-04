const fs = require('fs');
const https = require('https');
const path = require('path');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
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
          img: item.img || ''
        }));
    }
  }
  return [];
}

async function main() {
  const allNews = await fetchBaiduHot();
  const dateFile = '20260426';
  const imgDir = 'D:/hexo/source/images/hotnews';
  let body = '';

  allNews.forEach((item, i) => {
    const firstChar = item.title.charAt(0);
    const restTitle = item.title.slice(1);
    if (item.img) {
      const filename = `${dateFile}_morning_${String(i+1).padStart(2,'0')}.webp`;
      const localImg = `/images/hotnews/${filename}`;
      body += `<img src="${localImg}" class="hotnews-img" alt="热搜配图">\n`;
    }
    body += `### <strong>${firstChar}</strong>${restTitle}\n`;
    if (item.desc) body += `${item.desc}\n`;
    body += `\n`;
  });

  console.log('Body starts:', JSON.stringify(body.slice(0, 150)));

  // Try simpler swap: match ###...text\n\n<img> and swap
  const swapped = body.replace(
    /(### <strong>[^\n]+\n(?:(?!<img)[\s\S])*?)\n(<img[^>]+>)\n\n(?=###|$)/g,
    (m, content, img) => {
      return img + '\n' + content + '\n\n';
    }
  );

  const matches = swapped !== body;
  console.log('Swap changed content:', matches);

  const newIdx = swapped.indexOf('### <strong>');
  console.log('First ### after swap:', newIdx, JSON.stringify(swapped.slice(newIdx, newIdx + 120)));

  const fp = `D:/hexo/source/_posts/${dateFile}_hotnews_morning.md`;
  const now = new Date();
  const fm = `---\ntitle: test\ndate: ${now.toISOString().slice(0,19).replace('T',' ')}\n---\n\n`;
  fs.writeFileSync(fp, fm + swapped, 'utf8');
  console.log('written');
}

main().catch(e => console.error(e.message));
