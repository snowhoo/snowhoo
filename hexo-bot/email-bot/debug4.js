const path = require('path');
const BASE = 'D:/hexo/hexo-bot';
const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.addRule('externalImages', {
  filter: 'img',
  replacement: (content, node) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return `<img src="${src}" class="email-img" alt="${alt}">`;
  }
});

const processedHtml = `<p>看这张图：__IMG_BASE64_1000__</p>`;
let markdown = td.turndown(processedHtml);

console.log('Input HTML:', processedHtml);
console.log('Output markdown:', markdown);
console.log('JSON:', JSON.stringify(markdown));

// Check chars
const idx = markdown.indexOf('IMG');
if (idx >= 0) {
  const chars = [];
  for (let i = idx - 3; i < idx + 25; i++) {
    const c = markdown.charCodeAt(i);
    chars.push(c.toString(16));
  }
  console.log('Char codes around IMG:', chars.join(' '));
  console.log('String chars:', Array.from(markdown.slice(idx-3, idx+22)).join(''));
}
