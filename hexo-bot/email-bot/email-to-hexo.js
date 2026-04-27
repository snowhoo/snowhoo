/**
 * Hexo 邮件发布服务 - IMAP IDLE 常驻模式
 * 监听 9187541@qq.com 收件箱，实时接收新邮件并发布到 Hexo
 *
 * 用法: node email-to-hexo.js
 * 常驻运行，Windows 任务计划作为守护进程
 */
// 只输出带 [xxx] 标签的日志，其他全部静默
const _origLog = console.log;
const _origError = console.error;
console.log = (...args) => {
  const msg = args.join(' ');
  if (msg.match(/\[(recv|post|skip|error|email|debug|deploy|done|暂无|发现)\]/)) _origLog(...args);
};
console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.match(/\[(recv|post|skip|error|email|debug|deploy|done|暂无|发现)\]/)) _origError(...args);
};
console.warn = console.info = console.debug = () => {};

const ImapFlow = require('imapflow').ImapFlow;
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const dayjs = require('dayjs');
const { spawn } = require('child_process');
const sharp = require('sharp');

// ─── HTML 转 Markdown（保留图片位置和格式）────────────────────────────────
function htmlToMarkdown(html, attachments, imgDir) {
  // 1. 处理内嵌图片 (cid:xxx → 附件)
  const cidMap = {};
  const savedImgs = [];

  if (attachments && attachments.length > 0) {
    attachments.forEach((att, i) => {
      if (att.contentId) {
        cidMap[att.contentId] = { att, index: i };
      }
    });
  }

  // 2. 替换 <img src="cid:xxx"> 为占位符，后续处理
  let processedHtml = html.replace(/<img[^>]*src=["']cid:([^"']+)["'][^>]*>/gi, (match, cid) => {
    const cidClean = cid.replace(/[<>]/g, '');
    const info = cidMap[cidClean];
    if (info) {
      // 找到对应附件，标记位置
      return `__IMG_CID_${info.index}__`;
    }
    return match; // 未找到对应附件，保留原样
  });

  // 3. 处理 base64 内嵌图片 (data:image/xxx;base64,...)
  let base64ImgIndex = 1000; // 从 1000 开始编号，避免和 cid 图片冲突
  processedHtml = processedHtml.replace(/<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, (match, ext, base64Data, alt) => {
    if (!imgDir) return '';
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const name = `${dayjs().format('YYYYMMDDHHmmss')}-b${base64ImgIndex}.jpg`;
    const filepath = path.join(imgDir, name);
    try {
      sharp(imgBuffer)
        .resize(1200, null, { withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(filepath);
    } catch (_) {
      fs.writeFileSync(filepath, imgBuffer);
    }
    savedImgs.push({ index: base64ImgIndex, name, markdown: `![${alt || name}](/images/email-attachments/${name})` });
    base64ImgIndex++;
    return `__IMG_BASE64_${base64ImgIndex - 1}__`;
  });
  // 无 alt 的 base64 图片
  processedHtml = processedHtml.replace(/<img[^>]*src=["']data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)["'][^>]*>/gi, (match, ext, base64Data) => {
    if (!imgDir) return '';
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const name = `${dayjs().format('YYYYMMDDHHmmss')}-b${base64ImgIndex}.jpg`;
    const filepath = path.join(imgDir, name);
    try {
      sharp(imgBuffer)
        .resize(1200, null, { withoutEnlargement: true })
        .jpeg({ quality: 85, progressive: true })
        .toFile(filepath);
    } catch (_) {
      fs.writeFileSync(filepath, imgBuffer);
    }
    savedImgs.push({ index: base64ImgIndex, name, markdown: `![${name}](/images/email-attachments/${name})` });
    base64ImgIndex++;
    return `__IMG_BASE64_${base64ImgIndex - 1}__`;
  });

  // 3. 处理其他 <img src="http..."> 外部图片，保留链接
  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '![$3]($1)');
  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, '![]($1)');

  // 4. 转换标题
  processedHtml = processedHtml.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (m, c) => '# ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (m, c) => '## ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, c) => '### ' + c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (m, c) => '#### ' + c.trim() + '\n\n');

  // 5. 转换段落和换行
  processedHtml = processedHtml.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (m, c) => c.trim() + '\n\n');
  processedHtml = processedHtml.replace(/<br\s*\/?>/gi, '\n');
  processedHtml = processedHtml.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, (m, c) => c.trim() + '\n\n');

  // 6. 转换列表
  processedHtml = processedHtml.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (m, c) => {
    const items = c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (mi, mc) => '- ' + mc.trim() + '\n');
    return items + '\n';
  });
  processedHtml = processedHtml.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (m, c) => {
    let idx = 1;
    const items = c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (mi, mc) => idx++ + '. ' + mc.trim() + '\n');
    return items + '\n';
  });

  // 7. 转换加粗、斜体（压缩内部空白，避免 ** 被拆到多行导致渲染失败）
  processedHtml = processedHtml.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `**${inner}**` : '';
  });
  processedHtml = processedHtml.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `*${inner}*` : '';
  });
  // 处理 <u> 下划线 + <s>/<del>/<strike> 删除线
  processedHtml = processedHtml.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (m, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `++${inner}++` : '';
  });
  processedHtml = processedHtml.replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/(s|del|strike)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `~~${inner}~~` : '';
  });

  // 8. 转换链接
  processedHtml = processedHtml.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // 9. 转换引用
  processedHtml = processedHtml.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (m, c) => {
    const lines = c.trim().split('\n');
    return lines.map(l => '> ' + l.trim()).join('\n') + '\n\n';
  });

  // 10. 转换代码块
  processedHtml = processedHtml.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (m, c) => '```\n' + c.trim() + '\n```\n\n');
  processedHtml = processedHtml.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // 11. 移除其他 HTML 标签
  processedHtml = processedHtml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '');

  // 12. 清理 HTML 实体
  processedHtml = processedHtml
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));

  // 13. 清理多余空白
  processedHtml = processedHtml
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 14. 处理图片占位符 → 实际图片
  // 保存图片并生成 Markdown
  if (attachments && attachments.length > 0 && imgDir) {
    attachments.forEach((att, i) => {
      if (!att.contentId && !['jpg','jpeg','png','gif','webp','bmp'].includes((att.filename || '').split('.').pop().toLowerCase())) {
        return; // 非图片附件跳过
      }
      const ext = 'jpg';
      const name = `${dayjs().format('YYYYMMDDHHmmss')}-${i}.${ext}`;
      const filepath = path.join(imgDir, name);

      try {
        sharp(att.content)
          .resize(1200, null, { withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true })
          .toFile(filepath);
      } catch (_) {
        fs.writeFileSync(filepath, att.content);
      }

      att.savedName = name;
      savedImgs.push({ index: i, name, markdown: `![${att.filename || name}](/images/email-attachments/${name})` });
    });
  }

  // 替换占位符为实际图片 Markdown
  savedImgs.forEach(img => {
    if (img.index >= 1000) {
      // base64 图片占位符
      processedHtml = processedHtml.replace(`__IMG_BASE64_${img.index}__`, img.markdown);
    } else {
      // cid 图片占位符
      processedHtml = processedHtml.replace(`__IMG_CID_${img.index}__`, img.markdown);
    }
  });

  // 15. 移除残留的占位符（未匹配的 cid/base64）
  processedHtml = processedHtml.replace(/__IMG_CID_\d+__/g, '');
  processedHtml = processedHtml.replace(/__IMG_BASE64_\d+__/g, '');

  // 16. 清理图片周围的格式标记（**![xxx](url)** → ![xxx](url)）
  processedHtml = processedHtml.replace(/\*{1,3}(!\[[^\]]*\]\([^)]+\))\*{1,3}/g, '$1');
  // 清理空的格式标记（连续 ** 但中间没有文字的情况，如行首或行尾残留的 ****）
  processedHtml = processedHtml.replace(/(?<!\*)\*{4,}(?!\*)/g, '');

  return { markdown: processedHtml, savedImgs };
}

// ─── 配置 ───────────────────────────────────────────────────────────────────
const HEXO_PATH = 'D:/hexo';
const HEXO_SOURCE = path.join(HEXO_PATH, 'source', '_posts');
const HEXO_DRAFTS = path.join(HEXO_PATH, 'source', '_drafts');
const AUTO_DEPLOY = true;

// 只处理这些发件人的邮件（留空则处理所有邮件）
const ALLOWED_SENDERS = []; // 空 = 处理所有发件人邮件

// ─── 已处理邮件 UID 记录（防止重复推送）─────────────────────────────────
const UID_CACHE_FILE = path.join(__dirname, 'processed-uids.json');
function loadProcessedUIDs() {
  try {
    if (fs.existsSync(UID_CACHE_FILE)) {
      return new Set(JSON.parse(fs.readFileSync(UID_CACHE_FILE, 'utf8')));
    }
  } catch (_) {}
  return new Set();
}
function saveProcessedUIDs(uids) {
  try {
    fs.writeFileSync(UID_CACHE_FILE, JSON.stringify([...uids]), 'utf8');
  } catch (_) {}
}

// ─── 目录初始化 ───────────────────────────────────────────────────────────
[HEXO_SOURCE, HEXO_DRAFTS].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── 解析邮件 ─────────────────────────────────────────────────────────────
async function parseEmail(subject, body, html, attachments) {
  let title = null;
  let content = '';
  let tags = [];
  let categories = [];
  let draft = false;

  // 主题行含 # → 取标题
  const sMatch = subject.match(/^#\s*(.+)/);
  if (sMatch) title = sMatch[1].trim();

  // 图片保存目录
  const imgDir = path.join(HEXO_PATH, 'source', 'images', 'email-attachments');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  // 优先使用 HTML 正文（保留格式和图片位置）
  if (html && html.trim()) {
    const result = htmlToMarkdown(html, attachments, imgDir);
    content = result.markdown;
    // 保存图片信息用于封面
    if (result.savedImgs && result.savedImgs.length > 0) {
      attachments[0].savedName = result.savedImgs[0].name;
    }
  } else if (body && body.trim()) {
    // 纯文本正文
    content = body.trim();
  }

  // 移除正文中的 @hexo 命令标记
  content = content.replace(/^@hexo\s*/im, '').trim();

  // 正文第一行 # → 取标题（只有主题没有标题时才从正文取）
  const bMatch = content.match(/^#\s*(.+?)(?:\n|$)/);
  if (bMatch && !title) {
    title = bMatch[1].trim();
    const afterStrip = content.slice(bMatch[0].length).trim();
    if (afterStrip) content = afterStrip;
  }

  if (!title) title = dayjs().format('YYYY-MM-DD HH:mm');

  // 草稿标记
  if (/\[?\s*(draft|草稿)\s*\]?/i.test(subject) || /\[草稿\]/i.test(content)) {
    draft = true;
    content = content.replace(/\[草稿\]/gi, '').trim();
  }

  // 标签（从正文提取 #xxx，但排除 Markdown 标题 # 标题）
  // 只匹配独立的 #tag 格式：前面不是行首，且 tag 内容不含中文句号等标点
  const tagMatches = content.match(/(?<!^)#([^\s#\[\]]+)/gm) || [];
  tags = tagMatches.map(t => t.replace('#', '').trim()).filter(t => t && !/[。！？，、；：]/.test(t)); // 排除含中文标点的假标签
  content = content.replace(/(?<!^)#([^\s#\[\]]+)/g, '').trim();

  // 分类
  const catMatch = content.match(/\[(?:cat|category)[:：]\s*([^\]]+)\]/i);
  if (catMatch) {
    categories = catMatch[1].split(/[,，]/).map(s => s.trim()).filter(Boolean);
    content = content.replace(catMatch[0], '').trim();
  }

  // 提取封面图（第一张图片作为文章封面）
  const cover = (attachments && attachments.length > 0 && attachments[0].savedName)
    ? '/images/email-attachments/' + attachments[0].savedName
    : '';

  return { title, content, tags, categories, draft, cover };
}

// ─── 生成文章文件 ─────────────────────────────────────────────────────────
function buildPostContent(parsed) {
  const now = dayjs();
  // 时间戳 + 随机后缀，文件名简洁不暴露标题
  const filename = now.format('YYYYMMDDHHmmss') + Math.random().toString(36).slice(2, 6);
  const cleanFM = {
    title: parsed.title,
    date: now.format('YYYY-MM-DD HH:mm:ss'),
    updated: now.format('YYYY-MM-DD HH:mm:ss'),
    ...(parsed.cover ? { cover: parsed.cover } : {}),
    ...(parsed.tags.length ? { tags: parsed.tags } : {}),
    ...(parsed.categories.length ? { categories: parsed.categories } : {}),
    comments: true,
  };
  const fmStr = yaml.dump(cleanFM, { allowUnescape: true });
  return { filename, content: `---\n${fmStr}---\n\n${parsed.content}\n` };
}

function savePost(parsed) {
  const { filename, content } = buildPostContent(parsed);
  const dir = parsed.draft ? HEXO_DRAFTS : HEXO_SOURCE;
  const filepath = path.join(dir, filename + '.md');
  if (fs.existsSync(filepath)) throw new Error(`文件已存在: ${filename}.md`);
  fs.writeFileSync(filepath, '\ufeff' + content, 'utf8');
  return { filepath, filename, draft: parsed.draft };
}

// ─── 超时包装 spawn ────────────────────────────────────────────────────────
function runCmd(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || 120000;
    const timer = setTimeout(() => {
      try { p.kill('SIGTERM'); } catch (_) {}
      reject(new Error(`Timeout after ${timeout}ms: ${cmd}`));
    }, timeout);
    const p = spawn('cmd', ['/c', cmd], {
      cwd: opts.cwd || HEXO_PATH,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', (code) => { clearTimeout(timer); resolve(out); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

async function triggerDeploy(filename) {
  const hexoArgs = ['--config', path.join(HEXO_PATH, '_config.yml')];
  try {
    // ─── Step 1: Git 备份 ───────────────────────────────────────────
    await runCmd('git add source/_posts/ source/images/email-attachments/', { timeout: 30000 });

    // 纯 ASCII commit message
    const safeName = (filename || 'auto').replace(/[^a-zA-Z0-9_-]/g, '_');
    const commitMsg = `post-email-article-${safeName}`;
    const commitOut = await runCmd(`git commit -m "${commitMsg}"`, { timeout: 30000 });

    if (commitOut.includes('nothing to commit')) {
      console.log('[backup] [info] no changes to commit');
    } else if (commitOut.includes('[main') || commitOut.includes('[master') || commitOut.includes('[source')) {
      console.log('[backup] [info] committed to source branch');
    } else {
      console.log('[backup] [info] commit done');
    }

    // ─── Step 2: Git push with force fallback ───────────────────────
    try {
      await runCmd('git push origin source', { timeout: 60000 });
      console.log('[backup] [info] pushed to remote source branch');
    } catch (e) {
      console.log('[backup] [info] normal push failed, trying force push...');
      await runCmd('git push origin source --force', { timeout: 60000 });
      console.log('[backup] [info] force pushed to remote source branch');
    }

    // ─── Step 3: Hexo generate + deploy ────────────────────────────
    const genOut = await runCmd('npx hexo generate ' + hexoArgs.join(' '), { timeout: 120000 });
    if (!genOut.includes('Generated') && genOut.includes('ERROR')) {
      console.error('[deploy] [error] generate failed:', genOut.slice(-200));
      return;
    }
    console.log('[deploy] [info] generate done, starting deploy...');

    const depOut = await runCmd('npx hexo deploy ' + hexoArgs.join(' '), { timeout: 120000 });
    if (depOut.includes('Deploy done')) {
      console.log('[deploy] [done] article published successfully!');
    } else {
      console.log('[deploy] [done] deploy finished (check site for result)');
    }
  } catch (e) {
    console.error('[error]', e.message);
  }
}

// ─── 发送回执 ──────────────────────────────────────────────────────────────
async function sendReceipt(toEmail, title, draft) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 587,
    secure: false,
    auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
  });

  try {
    const msg = draft
      ? `✅ 文章已存入草稿！\n\n📄 ${title}\n📁 位置: _drafts\n💡 稍后发 [cat:分类] 邮件即可正式发布`
      : `✅ 文章发布成功！\n\n📄 ${title}\n📁 位置: _posts\n🌐 即将推送到 snowhoo.net`;

    await transporter.sendMail({
      from: '"Hexo 发布机器人" <9187541@qq.com>',
      to: toEmail,
      subject: draft ? `✅ 已存草稿: ${title}` : `✅ 发布成功: ${title}`,
      text: msg,
    });
    console.log(`[email] 回执已发送至 ${toEmail}`);
  } catch (err) {
    console.error(`[email] 回执发送失败: ${err.message}`);
  } finally {
    transporter.close();
  }
}

// ─── 判断文章是否已发布（文件名含标题关键词即视为已发布）───────────
function isAlreadyPublished(title) {
  // 注意：不同邮件可以有相同标题，这里只做文件名匹配的简单检查
  // 主要去重依赖 UID 过滤，此函数作为备用保护
  if (!title || !title.trim()) return false;
  const cleanTitle = title.trim().toLowerCase();
  if (cleanTitle.length < 2) return false;
  const files = fs.readdirSync(HEXO_SOURCE);
  return files.some(f => {
    if (!f.endsWith('.md')) return false;
    try {
      const content = fs.readFileSync(path.join(HEXO_SOURCE, f), 'utf8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return false;
      const fm = yaml.load(fmMatch[1]);
      if (fm && fm.title && fm.title.toLowerCase().trim() === cleanTitle) {
        return true;
      }
    } catch (_) {}
    return false;
  });
}

// ─── 处理单封邮件 ───────────────────────────────────────────────────────────
async function handleOneEmail(client, uid, processedUIDs) {
  try {
    // 已处理过的 UID 直接跳过
    if (processedUIDs.has(String(uid))) {
      return;
    }

    // 获取邮件内容
    const raw = await client.fetchOne(uid, { source: true });
    const em = await simpleParser(raw.source);

    const from = em.from?.value?.[0]?.address || 'unknown';
    let subject = em.subject || '(无主题)';
    let body = em.text || '';
    let html = em.html || '';

    const attachments = (em.attachments || []).filter(att => {
      const ext = (att.filename || '').split('.').pop().toLowerCase();
      return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) || att.contentId;
    });

    // 发件人白名单
    if (ALLOWED_SENDERS.length && !ALLOWED_SENDERS.includes(from)) {
      console.log(`[skip] 发件人不在白名单: ${from}`);
      return;
    }

    // 主题必须以 @hexo 开头
    const cleanSubject = subject.replace(/^(转发|Re|RE|FW|Fwd|Re:)\s*:\s*/i, '').trim();
    if (!/^@hexo\b/i.test(cleanSubject)) {
      console.log(`[skip] 非博客邮件: ${subject.slice(0, 40)}`);
      return;
    }

    subject = cleanSubject.replace(/^@hexo\s*/i, '');

    const emailParsed = await parseEmail(subject, body, html, attachments);

    console.log(`[recv] 来自: ${from} | 主题: ${subject.slice(0, 50)}`);

    const { filename, draft } = savePost(emailParsed);

    console.log(`[post] ✅ ${draft ? '草稿' : '发布'}: ${filename}.md`);
    console.log(`       标题: ${emailParsed.title} | 标签: ${JSON.stringify(emailParsed.tags)}`);

    await sendReceipt(from, filename, draft);

    // 记录 UID
    processedUIDs.add(String(uid));
    saveProcessedUIDs(processedUIDs);

    if (!draft && AUTO_DEPLOY) await triggerDeploy(filename);

    // 标记已读
    await client.messageFlagsAdd(uid, ['\\Seen']);

  } catch (err) {
    if (err.message.includes('文件已存在')) {
      console.log(`[skip] 文件冲突，标记已读: ${err.message}`);
      await client.messageFlagsAdd(uid, ['\\Seen']);
    } else {
      console.error(`[error] UID=${uid}: ${err.message}`);
    }
  }
}

// ─── 主逻辑（IDLE 常驻模式）──────────────────────────────────────────────────────
async function startEmailListener() {
  const processedUIDs = loadProcessedUIDs();

  // 静默 logger
  const noop = () => {};
  const silentLogger = {
    fatal: noop, error: noop, warn: noop, info: noop,
    debug: noop, trace: noop, child: () => silentLogger,
  };

  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user: '9187541@qq.com', pass: 'kyurfxweeogocaci' },
    logger: silentLogger,
  });

  // ─── 事件监听：新邮件到达 ───────────────────────────────────────────────
  client.on('exists', async (info) => {
    console.log(`[${dayjs().format('HH:mm:ss')}] 收到新邮件通知，UID: ${info.uid}`);
    const lock = await client.getMailboxLock('INBOX');
    try {
      await handleOneEmail(client, info.uid, processedUIDs);
    } finally {
      lock.release();
    }
  });

  // ─── 事件监听：连接断开 ───────────────────────────────────────────────
  client.on('close', async () => {
    console.log(`[${dayjs().format('HH:mm:ss')}] 连接断开，尝试重连...`);
    await reconnect(client, processedUIDs);
  });

  client.on('error', async (err) => {
    console.error(`[error] IMAP 错误: ${err.message}`);
    if (!client.connected) {
      console.log(`[${dayjs().format('HH:mm:ss')}] 连接异常，尝试重连...`);
      await reconnect(client, processedUIDs);
    }
  });

  // ─── 启动连接 ───────────────────────────────────────────────────────────
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    lock.release();

    // 重连后检查漏处理的邮件（回扫 5 分钟）
    await checkMissedEmails(client, processedUIDs);

    console.log(`[${dayjs().format('HH:mm:ss')}] 进入 IDLE 模式，等待新邮件...`);
    await client.idle();

  } catch (err) {
    console.error(`[error] 启动失败: ${err.message}`);
    throw err;
  }
}

// ─── 重连 ───────────────────────────────────────────────────────────────────
async function reconnect(client, processedUIDs) {
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      await new Promise(r => setTimeout(r, 5000)); // 等待 5 秒
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      lock.release();

      console.log(`[${dayjs().format('HH:mm:ss')}] 重连成功`);

      // 检查漏处理的邮件
      await checkMissedEmails(client, processedUIDs);

      await client.idle();
      return;

    } catch (err) {
      console.error(`[error] 重连失败 (第 ${attempts} 次): ${err.message}`);
    }
  }

  console.error(`[error] 重连失败 ${maxAttempts} 次，退出`);
  process.exit(1);
}

// ─── 检查漏处理的邮件（重连时回扫 5 分钟）──────────────────────────────────────
async function checkMissedEmails(client, processedUIDs) {
  const nowLocal = new Date();
  const sinceLocal = new Date(nowLocal.getTime() - 5 * 60 * 1000); // 5 分钟

  const uids = await client.search({ since: sinceLocal });
  if (!uids.length) return;

  console.log(`[${dayjs().format('HH:mm:ss')}] 回扫 ${uids.length} 封邮件（5分钟内）`);

  for (const uid of uids) {
    await handleOneEmail(client, uid, processedUIDs);
  }
}

// ─── 启动 ─────────────────────────────────────────────────────────────────
console.log('========================================');
console.log('  Hexo 邮件发布服务已启动');
console.log('  收件箱: 9187541@qq.com');
console.log('  模式: IMAP IDLE 常驻监听');
console.log('  文章目录: D:\\hexo\\source\\_posts');
console.log('========================================');

startEmailListener().catch(err => {
  console.error(`[error] 服务启动失败: ${err.message}`);
  process.exit(1);
});
