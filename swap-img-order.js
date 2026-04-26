const fs = require('fs');
const f = 'D:/hexo/source/_posts/20260426_hotnews_morning.md';
let c = fs.readFileSync(f, 'utf8');

const results = [];
let pos = 0;

while (true) {
  const idx = c.indexOf('\n\n### <strong>', pos);
  if (idx === -1) break;

  pos = idx + 2; // 跳过 \n\n，指到 ###
}

let last = c.slice(pos).replace(/\n+$/, '');
const parts = last.split('\n\n').filter(p => p.includes('hotnews-img'));
results.push(...parts);

const processed = results.map(block => {
  const imgMatch = block.match(/<img src="\/images\/hotnews\/[^"]*"[^>]*>/);
  if (!imgMatch) return block;
  const imgTag = imgMatch[0];
  const imgIdx = block.indexOf(imgTag);
  const before = block.slice(0, imgIdx).replace(/\n+$/, '');
  const after = block.slice(imgIdx + imgTag.length).replace(/^\n+/, '');
  let parts2 = [];
  if (before) parts2.push(before);
  parts2.push(imgTag);
  if (after) parts2.push(after);
  return parts2.join('\n');
});

const newContent = processed.join('\n\n');
fs.writeFileSync(f, newContent, 'utf8');
console.log('done, processed', processed.length, 'items');
