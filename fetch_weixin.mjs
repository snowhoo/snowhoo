import https from 'https';
import fs from 'fs';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://mp.weixin.qq.com/',
  }
};

https.get('https://mp.weixin.qq.com/s/eEgeTisqQBxQTACNnYvmCg', options, res => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    // 找 JS 中的 img_url 变量
    const imgRegex = /"img_url":"([^"]+)"/g;
    let match;
    const imgs = [];
    while ((match = imgRegex.exec(html)) !== null) {
      let url = match[1].replace(/\\\//g, '/');
      if (url && url.startsWith('http')) {
        imgs.push(url);
      }
    }

    // 去重
    const unique = [...new Set(imgs)];
    console.log('找到图片 (' + unique.length + ' 张):');
    unique.forEach((u, i) => console.log(i + 1 + ': ' + u));

    // 保存
    fs.writeFileSync('D:/hexo/weixin_full.html', html);
    console.log('HTML 已保存');
    fs.writeFileSync('D:/hexo/weixin_imgs.txt', unique.join('\n'));
    console.log('图片列表已保存到 weixin_imgs.txt');
  });
}).on('error', e => console.error('err:', e.message));
