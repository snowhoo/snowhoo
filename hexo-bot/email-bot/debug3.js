const path = require('path');
const BASE = 'D:/hexo/hexo-bot';
const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));
const fs = require('fs');
const dayjs = require(path.join(BASE, 'node_modules', 'dayjs'));
const sharp = require(path.join(BASE, 'node_modules', 'sharp'));

const testImgDir = path.join(BASE, 'email-bot', 'test-output');

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

// Simulate the full replacement
let processedHtml = html
  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '');

// Base64 replacement
let base64Idx = 1000;
const savedImgs = [];

processedHtml = processedHtml.replace(
  /<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*>/gi,
  (match, ext, data) => {
    console.log('BASE64 REPLACEMENT TRIGGERED!');
    console.log('  match:', match.substring(0, 80));
    console.log('  ext:', ext);
    console.log('  data length:', data ? data.length : 0);

    const buf = Buffer.from(data, 'base64');
    const imgIdx = base64Idx;
    const name = `${dayjs().format('YYYYMMDDHHmmss')}-b${imgIdx}.jpg`;
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

console.log('After base64 replacement:');
console.log(processedHtml);
console.log('');

let markdown = td.turndown(processedHtml);

console.log('After Turndown:');
// Find the placeholder
const placeholderIdx = markdown.indexOf('__IMG_BASE64_1000__');
if (placeholderIdx >= 0) {
  console.log('Placeholder FOUND at index', placeholderIdx);
  const before = markdown.substring(Math.max(0, placeholderIdx-5), placeholderIdx+30);
  console.log('Context:', JSON.stringify(before));
} else {
  console.log('Placeholder NOT found in markdown');
  // Search for IMG
  const imgIdx = markdown.indexOf('IMG_BASE64');
  if (imgIdx >= 0) {
    const ctx = markdown.substring(Math.max(0, imgIdx-5), imgIdx+30);
    console.log('IMG_BASE64 context:', JSON.stringify(ctx));
    // Show char codes
    const chars = [];
    for (let i = imgIdx-1; i < imgIdx+20; i++) {
      chars.push(markdown.charCodeAt(i).toString(16));
    }
    console.log('Char codes:', chars.join(' '));
  }
}

console.log('\nSavedImgs:', savedImgs);
