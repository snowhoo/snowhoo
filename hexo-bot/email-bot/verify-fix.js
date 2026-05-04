// Verify fix for base64 image + strikethrough + underline
const path = require('path');
const fs = require('fs');
const BASE = 'D:/hexo/hexo-bot';
const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));
const dayjs = require(path.join(BASE, 'node_modules', 'dayjs'));
const sharp = require(path.join(BASE, 'node_modules', 'sharp'));

const testImgDir = path.join(BASE, 'email-bot', 'test-output');
if (!fs.existsSync(testImgDir)) fs.mkdirSync(testImgDir, { recursive: true });

function convertHtmlToMarkdown(html, attachments, imgDir) {
  const savedImgs = [];

  const cidMap = {};
  if (attachments && attachments.length > 0) {
    attachments.forEach((att, i) => {
      if (att.contentId) cidMap[att.contentId] = { att, index: i };
    });
  }

  let processedHtml = html.replace(
    /<img[^>]*src=["']cid:([^"']+)["'][^>]*>/gi,
    (match, cid) => {
      const info = cidMap[cid.replace(/[<>]/g, '')];
      return info ? `__IMG_CID_${info.index}__` : match;
    }
  );

  let base64Idx = 1000;
  processedHtml = processedHtml.replace(
    /<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*>/gi,
    (match, ext, data) => {
      if (!imgDir) return '';
      const buf = Buffer.from(data, 'base64');
      const imgIdx = base64Idx;
      const name = `${dayjs().format('YYYYMMDDHHmmss')}-b${imgIdx}.jpg`;
      const fp = path.join(imgDir, name);
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
  ['del', 's', 'strike'].forEach(tag => {
    td.addRule(`strike${tag}`, {
      filter: tag,
      replacement: (content) => `~~${content}~~`
    });
  });
  td.addRule('underline', {
    filter: 'u',
    replacement: (content) => `<u>${content}</u>`
  });

  processedHtml = processedHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // FIX: replace placeholders BEFORE Turndown (prevents \_ escaping)
  savedImgs.forEach(img => {
    const placeholder = img.index >= 1000
      ? `__IMG_BASE64_${img.index}__`
      : `__IMG_CID_${img.index}__`;
    processedHtml = processedHtml.replace(placeholder, img.html);
  });

  if (attachments && attachments.length > 0 && imgDir) {
    attachments.forEach((att, i) => {
      if (!att.contentId) return;
      const ext = (att.filename || 'img').split('.').pop().toLowerCase();
      if (!['jpg','jpeg','png','gif','webp','bmp'].includes(ext)) return;
      const name = `${dayjs().format('YYYYMMDDHHmmss')}-${i}.jpg`;
      const fp = path.join(imgDir, name);
      try {
        sharp(att.content).resize(1200, null, { withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true }).toFile(fp);
      } catch (_) { fs.writeFileSync(fp, att.content); }
      att.savedName = name;
      savedImgs.push({ index: i, name,
        html: `<img src="/images/email-attachments/${name}" class="email-img" alt="${att.filename || name}">` });
    });
  }

  let markdown = td.turndown(processedHtml);

  markdown = markdown
    .replace(/__IMG_(CID|BASE64)_\d+__/g, '')
    .replace(/\*{4,}/g, '')
    .replace(/\*\*\s?\*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown, savedImgs };
}

let allPassed = true;

function test(name, html, expected) {
  const result = convertHtmlToMarkdown(html, [], testImgDir);
  const pass = result.markdown.includes(expected);
  if (!pass) allPassed = false;
  console.log(`${pass ? '[PASS]' : '[FAIL]'} ${name}`);
  if (!pass) {
    console.log('  Expected to contain:', expected);
    console.log('  Got:', result.markdown.substring(0, 200));
  }
  return pass;
}

// Test 1: base64 image placeholder replacement
test('base64图片替换',
  `<p>看这张图：<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></p>`,
  `<img src="/images/email-attachments/`);

// Test 2: strikethrough
test('删除线<del>',
  `<p><del>删除的内容</del></p>`,
  `~~删除的内容~~`);

test('删除线<s>',
  `<p><s>也是删除</s></p>`,
  `~~也是删除~~`);

test('删除线<strike>',
  `<p><strike>strike</strike></p>`,
  `~~strike~~`);

// Test 3: underline
test('下划线<u>',
  `<p><u>下划线文字</u>的测试</p>`,
  `<u>下划线文字</u>`);

// Test 4: mixed
test('混用格式',
  `<p><strong>加粗</strong>和<em>斜体</em>和<u>下划线</u>和<del>删除</del></p>`,
  `~~删除~~`);

console.log(allPassed ? '\nAll tests passed!' : '\nSome tests FAILED!');
process.exit(allPassed ? 0 : 1);
