/**
 * Hexo 邮件发布服务 - 轮询模式
 * 每 30 分钟由 Windows 任务计划触发，检索 1 小时内的新邮件并发布到 Hexo
 * 处理完直接退出，不常驻
 *
 * 用法: node email-to-hexo.js
 */
// 只输出带 [xxx] 标签的日志，其他全部静默
const _origLog = console.log;
const _origError = console.error;
console.log = (...args) => {
  const msg = args.join(' ');
  if (msg.match(/\[(recv|post|skip|error|email|debug|deploy|done|暂无|发现|扫描)\]/)) _origLog(...args);
};
console.error = (...args) => {
  const msg = args.join(' ');
  if (msg.match(/\[(recv|post|skip|error|email|debug|deploy|done|暂无|发现|扫描)\]/)) _origError(...args);
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
      return `__IMG_CID_${info.index}__`;
    }
    return match;
  });

  // 3. 处理 base64 内嵌图片 (data:image/xxx;base64,...)
  let base64ImgIndex = 1000;
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
    savedImgs.push({ index: base64ImgIndex, name, html: `<img src="/images/email-attachments/${name}" class="email-img" alt="${alt || name}">` });
    base64ImgIndex++;
    return `__IMG_BASE64_${base64ImgIndex - 1}__`;
  });
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
    savedImgs.push({ index: base64ImgIndex, name, html: `<img src="/images/email-attachments/${name}" class="email-img" alt="${name}">` });
    base64ImgIndex++;
    return `__IMG_BASE64_${base64ImgIndex - 1}__`;
  });

  // 提前移除 <style> 和 <script>，避免内容混入后续格式转换
  processedHtml = processedHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  processedHtml = processedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  processedHtml = processedHtml.replace(/<!--[\s\S]*?-->/g, '');

  // 外部图片 → 保留为 HTML img 标签（加 email-img 类，左浮动让文字在右边）
  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '<img src="$1" class="email-img" alt="$2">');
  processedHtml = processedHtml.replace(/<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, '<img src="$1" class="email-img">');

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

  // 7. 只转换加粗（简化：去掉斜体/删除线/下划线）
  processedHtml = processedHtml.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, (m, tag, c) => {
    const inner = c.replace(/\s+/g, ' ').trim();
    return inner ? `**${inner}**` : '';
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

  // 11. 移除其他 HTML 标签（保留 email-img 图片标签）
  const emailImgPlaceholders = [];
  processedHtml = processedHtml.replace(/<img[^>]*class="email-img"[^>]*>/gi, (match) => {
    const idx = emailImgPlaceholders.length;
    emailImgPlaceholders.push(match);
    return `__EMAIL_IMG_${idx}__`;
  });
  processedHtml = processedHtml.replace(/<[^>]+>/g, '');
  emailImgPlaceholders.forEach((img, idx) => {
    processedHtml = processedHtml.replace(`__EMAIL_IMG_${idx}__`, img);
  });

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
  if (attachments && attachments.length > 0 && imgDir) {
    attachments.forEach((att, i) => {
      if (!att.contentId && !['jpg','jpeg','png','gif','webp','bmp'].includes((att.filename || '').split('.').pop().toLowerCase())) {
        return;
      }
      const name = `${dayjs().format('YYYYMMDDHHmmss')}-${i}.jpg`;
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
      savedImgs.push({ index: i, name, html: `<img src="/images/email-attachments/${name}" class="email-img" alt="${att.filename || name}">` });
    });
  }

  // 替换占位符为实际图片 HTML
  savedImgs.forEach(img => {
    if (img.index >= 1000) {
      processedHtml = processedHtml.replace(`__IMG_BASE64_${img.index}__`, img.html);
    } else {
      processedHtml = processedHtml.replace(`__IMG_CID_${img.index}__`, img.html);
    }
  });

  // 15. 移除残留的占位符
  processedHtml = processedHtml.replace(/__IMG_CID_\d+__/g, '');
  processedHtml = processedHtml.replace(/__IMG_BASE64_\d+__/g, '');

  // 16. 清理图片周围的格式标记
  processedHtml = processedHtml.replace(/\*{1,2}(<img[^>]*class="email-img"[^>]*>)\*{1,2}/g, '$1');
  processedHtml = processedHtml.replace(/\*{4,}/g, '');

  // 17. 清理空的粗体标记
  processedHtml = processedHtml.replace(/\*\*\s*\*\*/g, '');
  processedHtml = processedHtml
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown: processedHtml, savedImgs };
}

// ─── 配置 ───────────────────────────────────────────────────────────────────
const HEXO_PATH = 'D:/hexo';
const HEXO_SOURCE = path.join(HEXO_PATH, 'source', '_posts');
const HEXO_DRAFTS = path.join(HEXO_PATH, 'source', '_drafts');
const AUTO_DEPLOY = true;

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

  const sMatch = subject.match(/^#\s*(.+)/);
  if (sMatch) title = sMatch[1].trim();

  const imgDir = path.join(HEXO_PATH, 'source', 'images', 'email-attachments');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  if (html && html.trim()) {
    const result = htmlToMarkdown(html, attachments, imgDir);
    content = result.markdown;
    if (result.savedImgs && result.savedImgs.length > 0) {
      attachments[0].savedName = result.savedImgs[0].name;
    }
  } else if (body && body.trim()) {
    content = body.trim();
  }

  content = content.replace(/^@hexo\s*/im, '').trim();

  const bMatch = content.match(/^#\s*(.+?)(?:\n|$)/);
  if (bMatch && !title) {
    title = bMatch[1].trim();
    const afterStrip = content.slice(bMatch[0].length).trim();
    if (afterStrip) content = afterStrip;
  }

  if (!title) title = dayjs().format('YYYY-MM-DD HH:mm');

  if (/\[?\s*(draft|草稿)\s*\]?/i.test(subject) || /\[草稿\]/i.test(content)) {
    draft = true;
    content = content.replace(/\[草稿\]/gi, '').trim();
  }

  // hashtag 提取：仅匹配前面有空格的 #标签（避免误匹配行首 Markdown 标题）
  const tagMatches = content.match(/(?<=\s)#([^\s#\[\]]+)/gm) || [];
  tags = tagMatches.map(t => t.replace('#', '').trim()).filter(t => t && !/[。！？，、；：]/.test(t));
  content = content.replace(/(?<=\s)#([^\s#\[\]]+)/g, '').trim();

  const catMatch = content.match(/\[(?:cat|category)[:：]\s*([^\]]+)\]/i);
  if (catMatch) {
    categories = catMatch[1].split(/[,，]/).map(s => s.trim()).filter(Boolean);
    content = content.replace(catMatch[0], '').trim();
  }

  const cover = (attachments && attachments.length > 0 && attachments[0].savedName)
    ? '/images/email-attachments/' + attachments[0].savedName
    : '';

  return { title, content, tags, categories, draft, cover };
}

// ─── 生成文章文件 ─────────────────────────────────────────────────────────
function buildPostContent(parsed) {
  const now = dayjs();
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
    await runCmd('git add source/_posts/ source/images/email-attachments/', { timeout: 30000 });

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

    try {
      await runCmd('git push origin source', { timeout: 60000 });
      console.log('[backup] [info] pushed to remote source branch');
    } catch (e) {
      console.log('[backup] [info] normal push failed, trying force push...');
      await runCmd('git push origin source --force', { timeout: 60000 });
      console.log('[backup] [info] force pushed to remote source branch');
    }

    // 已改用 GitHub Actions 自动构建部署，只需 push 到 source 分支即可
    console.log('[deploy] [done] source pushed, GitHub Actions will build & deploy automatically');
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

// ─── 处理单封邮件 ───────────────────────────────────────────────────────────
async function handleOneEmail(client, uid, processedUIDs) {
  try {
    if (processedUIDs.has(String(uid))) {
      return;
    }

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

    if (ALLOWED_SENDERS.length && !ALLOWED_SENDERS.includes(from)) {
      console.log(`[skip] 发件人不在白名单: ${from}`);
      return;
    }

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

    processedUIDs.add(String(uid));
    saveProcessedUIDs(processedUIDs);

    if (!draft && AUTO_DEPLOY) await triggerDeploy(filename);

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

// ─── 主逻辑（轮询模式：连接 → 检索 → 处理 → 退出）───────────────────────────
async function run() {
  const processedUIDs = loadProcessedUIDs();

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

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // 检索 1 小时内的邮件
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const uids = await client.search({ since });

      if (!uids.length) {
        console.log('[暂无] 1小时内无新邮件');
        return;
      }

      console.log(`[扫描] 发现 ${uids.length} 封邮件（1小时内）`);

      let processed = 0;
      for (const uid of uids) {
        await handleOneEmail(client, uid, processedUIDs);
        // 已处理的 UID 不会重复处理，这里只统计尝试数
        processed++;
      }

      console.log(`[done] 扫描完成，检查 ${processed} 封`);

    } finally {
      lock.release();
    }

  } catch (err) {
    console.error(`[error] 运行失败: ${err.message}`);
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}

// ─── 启动 ─────────────────────────────────────────────────────────────────
console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] Hexo 邮件轮询服务启动`);

run().then(() => {
  console.log(`[${dayjs().format('HH:mm:ss')}] 本轮结束，退出`);
  process.exit(0);
}).catch(err => {
  console.error(`[error] 服务失败: ${err.message}`);
  process.exit(1);
});
