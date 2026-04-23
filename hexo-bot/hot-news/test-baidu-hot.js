const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Extract Baidu hot search
async function fetchBaiduHot() {
  const html = await fetch('https://top.baidu.com/board?tab=realtime');
  const match = html.match(/<!--s-data:(\{.*?\})-->/s);
  if (!match) return [];
  try {
    const json = JSON.parse(match[1]);
    const cards = json?.data?.cards || [];
    for (const card of cards) {
      if (card.component === 'hotList' && Array.isArray(card.content)) {
        return card.content.map(item => ({
          title: item.query || item.word || '',
          desc: item.desc || '',
          url: item.rawUrl || item.url || '',
          score: item.hotScore || '',
          source: '百度热搜'
        }));
      }
    }
  } catch (e) {
    console.error('Baidu parse error:', e.message);
  }
  return [];
}

// Test
(async () => {
  const items = await fetchBaiduHot();
  console.log('百度热搜获取到', items.length, '条');
  items.slice(0, 5).forEach(item => {
    console.log('标题:', item.title);
    console.log('描述:', item.desc.slice(0, 80) + '...');
    console.log('---');
  });
})();
