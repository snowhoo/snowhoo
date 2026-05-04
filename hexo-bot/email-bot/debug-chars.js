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

let markdown = td.turndown(processedHtml);

// Show actual chars
const placeholder = '__IMG_BASE64_1000__';
console.log('Searching for:', JSON.stringify(placeholder));
console.log('In markdown:', JSON.stringify(markdown).substring(0, 100));
console.log('Found?', markdown.includes(placeholder));

// Show char codes around the placeholder area
const idx = markdown.indexOf('IMG');
if (idx >= 0) {
  const chars = [];
  for (let i = Math.max(0, idx-2); i < Math.min(markdown.length, idx+20); i++) {
    chars.push(markdown.charCodeAt(i).toString(16));
  }
  console.log('Char codes around IMG:', chars.join(' '));
}
