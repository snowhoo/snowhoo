const path = require('path');
const fs = require('fs');
const BASE = 'D:/hexo/hexo-bot';

let output = '';

const originalLog = console.log;
console.log = (...args) => {
  const line = args.join(' ');
  output += line + '\n';
  originalLog.apply(console, args);
};

try {
  const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));
  const dayjs = require(path.join(BASE, 'node_modules', 'dayjs'));
  const sharp = require(path.join(BASE, 'node_modules', 'sharp'));

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

    let markdown = td.turndown(processedHtml);

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

    savedImgs.forEach(img => {
      const placeholder = img.index >= 1000
        ? `__IMG_BASE64_${img.index}__`
        : `__IMG_CID_${img.index}__`;
      markdown = markdown.replace(placeholder, img.html);
    });

    markdown = markdown
      .replace(/__IMG_(CID|BASE64)_\d+__/g, '')
      .replace(/\*{4,}/g, '')
      .replace(/\*\*\s?\*\*/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { markdown, savedImgs };
  }

  const testImgDir = path.join(BASE, 'email-bot', 'test-output');
  if (!fs.existsSync(testImgDir)) fs.mkdirSync(testImgDir, { recursive: true });

  const tests = [
    { name: 'base64图片', html: `<p>图片：<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="icon"></p>` },
    { name: '删除线', html: `<p><del>删除的内容</del>和<s>也是删除</s>和<strike>strike</strike></p>` },
    { name: '下划线', html: `<p><u>下划线文字</u>的测试</p>` },
    { name: 'base64+格式混用', html: `<p><strong>加粗</strong>和<em>斜体</em>和<u>下划线</u>和<del>删除</del></p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">` },
  ];

  tests.forEach((t, i) => {
    console.log(`\n=== Test ${i+1}: ${t.name} ===`);
    const result = convertHtmlToMarkdown(t.html, [], testImgDir);
    console.log('Output:');
    console.log(result.markdown);
    if (result.savedImgs.length > 0) {
      console.log('Saved images: ' + result.savedImgs.map(s => s.name).join(', '));
    }
  });

  fs.writeFileSync('D:/hexo/hexo-bot/email-bot/test-output/results.txt', output, 'utf8');
  console.log('\nDone. Results written to test-output/results.txt');
} catch(e) {
  fs.writeFileSync('D:/hexo/hexo-bot/email-bot/test-output/error.txt', String(e.stack || e), 'utf8');
  console.error('ERROR: ' + e.message);
}
