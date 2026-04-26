const fs = require('fs');
const c = fs.readFileSync('D:/hexo/source/_posts/20260426_hotnews_morning.md', 'utf8');
// 找到第一个 h3 后的 250 字符
const i = c.indexOf('### <strong>');
console.log(JSON.stringify(c.slice(i, i + 250)));
