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

const html = `<p>看这张图：<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="icon"></p>`;

let processedHtml = html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

console.log('Processed HTML:');
console.log(processedHtml);
console.log('');

let markdown = td.turndown(processedHtml);

// Show char codes around the img src
const idx = markdown.indexOf('data:image');
if (idx >= 0) {
  const chars = [];
  for (let i = Math.max(0, idx-3); i < Math.min(markdown.length, idx+30); i++) {
    const c = markdown.charCodeAt(i);
    chars.push(c === 32 ? '_' : String.fromCharCode(c));
  }
  console.log('Chars around data:image:', chars.join(''));
  console.log('Char codes:', Array.from(markdown.slice(idx, idx+20)).map(c => c.charCodeAt(0).toString(16)).join(' '));
}
