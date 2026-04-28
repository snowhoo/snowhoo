/**
 * 快速测试 convertHtmlToMarkdown 转换效果
 */
process.on('uncaughtException', e => { console.error('ERROR:', e.message); process.exit(1); });
process.on('unhandledRejection', e => { console.error('REJECT:', String(e)); process.exit(1); });

const path = require('path');
const BASE = 'D:/hexo/hexo-bot';
const TurndownService = require(path.join(BASE, 'email-bot', 'node_modules', 'turndown'));
const fs = require('fs');
const dayjs = require(path.join(BASE, 'node_modules', 'dayjs'));
const sharp = require(path.join(BASE, 'node_modules', 'sharp'));

// ── 核心转换逻辑（与 email-to-hexo.js 保持同步）────────────────────────────
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

  // 4b. 预处理：强制移除 style/script/注释
  processedHtml = processedHtml
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 5d. 【关键修复】在 Turndown 处理之前，先把占位符替换为 <img> 标签
  savedImgs.forEach(img => {
    const placeholder = img.index >= 1000
      ? `__IMG_BASE64_${img.index}__`
      : `__IMG_CID_${img.index}__`;
    processedHtml = processedHtml.replace(placeholder, img.html);
  });

  // 6. 处理 cid 附件：保存到 imgDir 并追加到 savedImgs
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

// ── 测试用例 ────────────────────────────────────────────────────────────────
const testImgDir = path.join(BASE, 'email-bot', 'test-output');
if (!fs.existsSync(testImgDir)) fs.mkdirSync(testImgDir, { recursive: true });

const testCases = [
  {
    name: '嵌套 div/p/span 脏 HTML',
    html: `<div style="color:red"><p>这是<strong>加粗</strong>和<em>斜体</em>文本</p><div><span>嵌套层</span></div></div>`
  },
  {
    name: '完整邮件结构（标题/列表/链接/引用）',
    html: `<h1>测试文章标题</h1><p>这是段落，包含<a href="https://example.com">链接</a>：</p><img src="https://example.com/photo.jpg" alt="示例图片"><h2>小节</h2><ul><li>列表项1</li><li>列表项2</li></ul><blockquote>引用文本</blockquote><pre><code>console.log("hello")</code></pre>`
  },
  {
    name: 'base64 内嵌图片',
    html: `<p>看这张图：<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="小图标"></p><p>内容文本</p>`
  },
  {
    name: 'style/script 标签（应被 Turndown 自动清除）',
    html: `<style>.hidden{display:none}</style><p>可见<strong>内容</strong></p><script>alert('xss')</script><div>更多<em>格式</em></div>`
  },
  {
    name: '真实邮件乱格式（嵌套混乱）',
    html: `<div><p style="font-size:12pt"><span style="color:#333">多<span style="font-weight:bold">层<strong>嵌套</strong></span>格式</span></p><br><p>换行后段落</p></div>`
  }
];

console.log('='.repeat(56));
console.log('[test] Turndown HTML→Markdown 转换测试');
console.log('='.repeat(56));

testCases.forEach((tc, i) => {
  console.log(`\n[test] ${i + 1}. ${tc.name}`);
  console.log('-'.repeat(50));
  const result = convertHtmlToMarkdown(tc.html, [], testImgDir);
  console.log(result.markdown);
  if (result.savedImgs.length > 0) {
    console.log(`[test] 📷 保存图片: ${result.savedImgs.map(s => s.name).join(', ')}`);
  }
});

console.log('\n' + '='.repeat(56));
console.log('[test] 测试完成');
