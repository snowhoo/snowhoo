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
['h3', 'h4', 'h5', 'h6'].forEach(tag => {
  td.addRule(`heading${tag}`, {
    filter: tag,
    replacement: (content) => `<strong>${content}</strong>`
  });
});

const html = `<h3>这是h3标题</h3><p>这是正文</p><h4>h4内容</h4>`;
const md = td.turndown(html);
console.log('Input:', html);
console.log('Output:', md);
console.log('Has ###?', md.includes('###'));