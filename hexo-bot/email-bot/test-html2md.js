// 临时测试文件 - 验证 htmlToMarkdown 修复
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const sharp = require('sharp');

// 复制 htmlToMarkdown 函数（从 email-to-hexo.js 提取）
function htmlToMarkdown(html, attachments, imgDir) {
  const cidMap = {};
  const savedImgs = [];

  if (attachments && attachments.length > 0) {
    attachments.forEach((att, i) => {
      if (att.contentId) {
        cidMap[att.contentId] = { att, index: i };
      }
    });
  }

  let processedHtml = html.replace(/<img[^>]*src=["']cid:([^"']+)["'][^>]*>/gi, (match, cid) => {
    const cidClean = cid.replace(/[<>]/g, '');
    const info = cidMap[cidClean];
    if (info) {
      return `__IMG_CID_${info.index}__`;
    }
    return match;
  });

  let base64ImgIndex = 1000;
  processedHtml = processedHtml.replace(/<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, (match, ext, base64Data, alt) => {
    if (!imgDir) return '';
    return `__IMG_BASE64_${base64ImgIndex++}__`;
  });
  processedHtml = processedHtml.replace(/<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*>/gi, (match, ext, base64Data) => {
    if (!imgDir) return '';
    return `__IMG_BASE64_${base64ImgIndex++}__`;
  });

  // 提前移除 <style> 和 <script>
  processedHtml = processedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  processedHtml = processedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  processedHtml = processedHtml.replace(/<!--[\s\S]*?-->/g, '');

  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$2]($1)');
  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, '![]($1)');

  // 3b. preprocess line-through style → <del>
  processedHtml = processedHtml.replace(/<(\w+)([^>]*)style=["'][^"']*text-decoration[^"']*line-through[^"']*["']([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, pre, post, c) => {
    const inner = c.trim();
    return inner ? `<del>${inner}</del>` : '';
  });

  processedHtml = processedHtml.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, c) => '# ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, c) => '## ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, c) => '### ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, c) => '#### ' + c.trim() + '\n\n');

  processedHtml = processedHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, c) => c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<br\s*\/?>/gi, '\n');
  processedHtml = processedHtml.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, (m, c) => c.trim() + '\n\n');

  processedHtml = processedHtml.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (m, c) => {
    const items = c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (mi, mc) => '- ' + mc.trim() + '\n');
    return items + '\n';
  });
  processedHtml = processedHtml.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (m, c) => {
    let idx = 1;
    const items = c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (mi, mc) => idx++ + '. ' + mc.trim() + '\n');
    return items + '\n';
  });

  processedHtml = processedHtml.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `**${inner}**` : '';
  });
  processedHtml = processedHtml.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `*${inner}*` : '';
  });
  processedHtml = processedHtml.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (m, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner || '';
  });
  processedHtml = processedHtml.replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/(s|del|strike)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `~~${inner}~~` : '';
  });

  processedHtml = processedHtml.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, c) => {
    const lines = c.trim().split('\n');
    return lines.map(l => '> ' + l.trim()).join('\n') + '\n\n';
  });

  processedHtml = processedHtml.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (m, c) => '```\n' + c.trim() + '\n```\n\n');
  processedHtml = processedHtml.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  processedHtml = processedHtml.replace(/<[^>]+>/g, '');

  processedHtml = processedHtml
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));

  processedHtml = processedHtml
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Post-processing
  processedHtml = processedHtml
    .replace(/__IMG_CID_\d+__/g, '')
    .replace(/__IMG_BASE64_\d+__/g, '')
    .replace(/\*{1,3}(!\[[^\]]*\]\([^)]+\))\*{1,3}/g, '$1')
    .replace(/(?<!\*)\*{4,}(?!\*)/g, '')
    .replace(/\*{2,}\s*\*{2,}/g, '')
    .replace(/~{2,}\s*~{2,}/g, '')
    .replace(/~~[\s]*~~/g, '')
    .replace(/\+\+([\s\S]*?)\+\+/g, '$1')
    .replace(/~~\*{1,3}~~/g, '')
    .replace(/\*{1,3}~~\*{1,3}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown: processedHtml, savedImgs };
}

// ============ 测试 ============
console.log('=== T1: del+style 嵌套 (原bug: CSS文本残留) ===');
const r1 = htmlToMarkdown('<p><del><style>a{text-decoration:none}</style>测试</del> <strong>加粗</strong> <em>斜体</em> <u>下划线</u></p>', [], null);
console.log(r1.markdown);
console.log('');

console.log('=== T2: span line-through ===');
const r2 = htmlToMarkdown('<p><span style="text-decoration: line-through">删除线文本</span> 正常文本</p>', [], null);
console.log(r2.markdown);
console.log('');

console.log('=== T3: 嵌套格式 (bold+italic+del) ===');
const r3 = htmlToMarkdown('<p><strong><em><del>加粗斜体删除线</del></em></strong></p>', [], null);
console.log(r3.markdown);
console.log('');

console.log('=== T4: 图片+格式嵌套 ===');
const r4 = htmlToMarkdown('<p><strong><img src="https://example.com/img.jpg" alt="图片"></strong></p>', [], null);
console.log(r4.markdown);
console.log('');

console.log('=== T5: 标题 ===');
const r5 = htmlToMarkdown('<h1>大标题</h1><h2>二标题</h2>', [], null);
console.log(r5.markdown);
console.log('');

console.log('=== T6: 综合邮件HTML ===');
const r6 = htmlToMarkdown('<div><p style="text-decoration:line-through"><style>a{color:red}</style>旧内容</p><p><strong>重要</strong>公告 <em>注意</em></p><p><u>下划线文字</u> 普通文字 <span style="text-decoration: line-through">已过期</span></p></div>', [], null);
console.log(r6.markdown);
