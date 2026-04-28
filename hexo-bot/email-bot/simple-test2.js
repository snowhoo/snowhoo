// Minimal test to verify base64 image fix
const path = require('path');
const fs = require('fs');
const BASE = 'D:/hexo/hexo-bot';
const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));
const dayjs = require(path.join(BASE, 'node_modules', 'dayjs'));
const sharp = require(path.join(BASE, 'node_modules', 'sharp'));

const testImgDir = path.join(BASE, 'email-bot', 'test-output');
if (!fs.existsSync(testImgDir)) fs.mkdirSync(testImgDir, { recursive: true });

// Test 1: base64 image only
const html1 = `<p>看这张图：<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="icon"></p>`;

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.addRule('externalImages', {
  filter: 'img',
  replacement: (content, node) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    if (src.startsWith('/images/email-attachments/')) {
      return `<img src="${src}" class="email-img" alt="${alt}">`;
    }
    return `<img src="${src}" class="email-img" alt="${alt}">`;
  }
});

let processedHtml = html1;

let base64Idx = 1000;
const savedImgs = [];

processedHtml = processedHtml.replace(
  /<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*>/gi,
  (match, ext, data) => {
    const buf = Buffer.from(data, 'base64');
    const imgIdx = base64Idx;
    const name = `test-b${imgIdx}.jpg`;
    const fp = path.join(testImgDir, name);
    try {
      sharp(buf).resize(1200, null, { withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true }).toFile(fp);
    } catch (_) { fs.writeFileSync(fp, buf); }
    savedImgs.push({ index: imgIdx, name,
      html: `<img src="/images/email-attachments/${name}" class="email-img" alt="${name}">` });
    base64Idx++;
    return `__IMG_BASE64_${imgIdx}__`;
  }
);

processedHtml = processedHtml
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

let markdown = td.turndown(processedHtml);

console.log('Before replacement:');
console.log(JSON.stringify(markdown));

savedImgs.forEach(img => {
  const placeholder = `__IMG_BASE64_${img.index}__`;
  console.log(`Looking for: "${placeholder}" in markdown: ${markdown.includes(placeholder)}`);
  markdown = markdown.replace(placeholder, img.html);
});

console.log('\nAfter replacement:');
console.log(JSON.stringify(markdown));
console.log('\nMarkdown content:');
console.log(markdown);
console.log('\nSaved imgs:', savedImgs);
