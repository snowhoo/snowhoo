const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '..', 'source', '_posts', '20260426_hotnews_morning.md');
const content = fs.readFileSync(filePath, 'utf8');

// 修复：图片后没有空行的添加空行
const fixed = content.replace(
  /<img src="(\/[^"]+)" class="hotnews-img" alt="热搜配图">\n(?!### |$)/g,
  '<img src="$1" class="hotnews-img" alt="热搜配图">\n\n'
);

fs.writeFileSync(filePath, fixed, 'utf8');
console.log('Fixed article markdown');
