/**
 * Hexo 邮件发布服务
 * 监听 9187541@qq.com 收件箱，自动将邮件内容发布到 Hexo
 *
 * 用法: node email-to-hexo.js
 * 建议配合 Windows 任务计划程序，每 1-2 分钟执行一次
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
async function parseEmail(subject, body, attachments) {
  let title = null;
  let content = body.trim();
  let tags = [];
  let categories = [];
  let draft = false;

  // 主题行含 # → 取标题
  const sMatch = subject.match(/^#\s*(.+)/);
  if (sMatch) title = sMatch[1].trim();

  // 正文第一行 # → 取标题（只有主题没有标题时才从正文取）
  const bMatch = content.match(/^#\s*(.+?)(?:\n|$)/);
  if (bMatch && !title) {
    title = bMatch[1].trim();
    const afterStrip = content.slice(bMatch[0].length).trim();
    if (afterStrip) content = afterStrip; // 只有剥离后还有内容才剥离
  }

  if (!title) title = dayjs().format('YYYY-MM-DD HH:mm');

  // 草稿标记
  if (/\[?\s*(draft|草稿)\s*\]?/i.test(subject) || /\[草稿\]/i.test(content)) {
    draft = true;
    content = content.replace(/\[草稿\]/gi, '').trim();
  }

  // 标签
  const tagMatches = content.match(/#([^\s#\[\]]+)/g) || [];
  tags = tagMatches.map(t => t.replace('#', '').trim());
  content = content.replace(/#([^\s#\[\]]+)/g, '').trim();

  // 分类
  const catMatch = content.match(/\[(?:cat|category)[:：]\s*([^\]]+)\]/i);
  if (catMatch) {
    categories = catMatch[1].split(/[,，]/).map(s => s.trim()).filter(Boolean);
    content = content.replace(catMatch[0], '').trim();
  }

  // 图片附件 → 压缩后保存并转为 Markdown 图片
  if (attachments && attachments.length > 0) {
    const imgMd = await Promise.all(attachments.map(async (att, i) => {
      const ext = 'jpg'; // 统一转为 jpg
      const name = `${dayjs().format('YYYYMMDDHHmmss')}-${i}.${ext}`;
      const imgDir = path.join(HEXO_PATH, 'source', 'images', 'email-attachments');
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
      const filepath = path.join(imgDir, name);
      const origSize = att.content.length;
      try {
        await sharp(att.content)
          .resize(1200, null, { withoutEnlargement: true })
          .jpeg({ quality: 85, progressive: true })
          .toFile(filepath);
        const newSize = fs.statSync(filepath).size;
        console.log(`[img] 保存图片: /images/email-attachments/${name} (${Math.round(origSize/1024)}KB → ${Math.round(newSize/1024)}KB，省${Math.round((1-newSize/origSize)*100)}%)`);
      } catch (_) {
        // 压缩失败则直接写入原图
        fs.writeFileSync(filepath, att.content);
        console.log(`[img] 保存图片(未压缩): /images/email-attachments/${name}`);
      }
      att.savedName = name;
      return `![${att.filename || name}](/images/email-attachments/${name})`;
    }));
    const imgMarkdown = imgMd.join('\n\n');
    content = content ? content + '\n\n' + imgMarkdown : imgMarkdown;
  }

  // 正文 ≈ 标题，且有图片 → 保留正文（正文是用户输入的，图片+文字都保留）

  // 提取封面图（第一张图片作为文章封面）
  const cover = (attachments && attachments.length > 0)
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

async function triggerDeploy() {
  return new Promise((resolve) => {
    const args = ['--config', path.join(HEXO_PATH, '_config.yml')];
    const hexo = spawn('npx', ['hexo'].concat(['generate'].concat(args)), {
      cwd: HEXO_PATH, shell: true,
    });
    let out = '';
    hexo.stdout.on('data', d => out += d);
    hexo.stderr.on('data', d => out += d);
    hexo.on('close', async (code) => {
      if (code !== 0) {
        console.error(`[deploy] ❌ generate 失败 (code ${code}):\n${out.slice(-200)}`);
        resolve();
        return;
      }
      const dep = spawn('npx', ['hexo'].concat(['deploy'].concat(args)), {
        cwd: HEXO_PATH, shell: true,
      });
      let depOut = '';
      dep.stdout.on('data', d => depOut += d);
      dep.stderr.on('data', d => depOut += d);
      dep.on('close', (c) => {
        console.log(c === 0 ? '[deploy] ✅ 部署完成' : `[deploy] ❌ 失败 (code ${c}):\n${depOut.slice(-200)}`);
        resolve();
      });
    });
  });
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
  if (!title || !title.trim()) return false;
  // 用标题关键词比对文件名（文件名虽不含标题，但旧文章文件名含标题）
  const key = title.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 10).toLowerCase();
  if (key.length < 4) return false;  // 标题太短直接放过
  const files = fs.readdirSync(HEXO_SOURCE);
  return files.some(f => {
    const fn = f.replace(/[^\w\u4e00-\u9fa5]/g, '').toLowerCase();
    return fn.includes(key);
  });
}

// ─── 主逻辑 ───────────────────────────────────────────────────────────────
async function processEmails() {
  // 加载已处理 UID，防止同一封邮件被重复发布
  const processedUIDs = loadProcessedUIDs();
  let newUIDs = new Set();

  // 纯空函数 logger，彻底关闭 imapflow 所有调试输出
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

  let connected = false;
  try {
    await client.connect();
    connected = true;
    const lock = await client.getMailboxLock('INBOX');

    try {
      // 不依赖 IMAP 时间过滤，改用手动过滤邮件发送时间
      const nowLocal = new Date();
      const sinceLocal = new Date(nowLocal.getTime() - 35 * 60 * 1000);
      console.log(`[debug] 窗口: ${sinceLocal.toLocaleTimeString('zh-CN')} ~ ${nowLocal.toLocaleTimeString('zh-CN')} (CST)`);
      // IMAP search 改为搜索今天所有邮件，由应用层做时间过滤
      const todayStart = new Date(nowLocal); todayStart.setHours(0, 0, 0, 0);
      const uids = await client.search({ since: todayStart });

      if (!uids.length) {
        console.log(`[${dayjs().format('HH:mm:ss')}] 暂无新邮件`);
        return;
      }

      console.log(`[${dayjs().format('HH:mm:ss')}] 发现 ${uids.length} 封邮件（近35分钟）`);

      for (const uid of uids) {
        let skip = false;
        let skipReason = '';

        try {
          // 先拿邮件时间，判断是否在 35 分钟窗口内
          const { envelope } = await client.fetchOne(uid, { envelope: true });
          const msgDate = new Date(envelope.date);

          // 已处理过的 UID 直接跳过
          if (processedUIDs.has(String(uid))) {
            continue;
          }

          if (isNaN(msgDate.getTime()) || msgDate < sinceLocal) {
            console.log(`[debug] ${envelope.subject?.slice(0, 30)} 发送于 ${msgDate.toLocaleTimeString('zh-CN')}，超出窗口`);
            continue;
          }

          // 在窗口内，再拿完整内容
          const raw = await client.fetchOne(uid, { source: true });
          const em = await simpleParser(raw.source);

          const from = em.from?.value?.[0]?.address || 'unknown';
          let subject = em.subject || '(无主题)';
          // 优先用纯文本，文本为空时从 HTML 正文提取（去除标签）
          let body = em.text || '';
          if (!body.trim() && em.html) {
            // 提取 body 标签内的纯文本内容，清洗 HTML/CSS/注释
            const bodyMatch = em.html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            const rawHtml = bodyMatch ? bodyMatch[1] : em.html;
            body = rawHtml
              .replace(/<!--[\s\S]*?-->/g, '')   // 移除 HTML 注释
              .replace(/-->[\s\S]*?(?=<|$)/g, '') // 移除残留的 --> 及后续内容
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // 移除 style 标签
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除 script 标签
              .replace(/<style[^>]*\/?>/gi, '') // 移除孤立的 style 标签
              .replace(/<[^>]+>/g, ' ')         // 移除所有标签 → 生成纯文本
              .replace(/\{[^}]*\}/g, ' ')       // 移除 CSS 片段如 .class{...}（纯文本中已无用）
              .replace(/&nbsp;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&lt;/gi, '<')
              .replace(/&gt;/gi, '>')
              .replace(/&quot;/gi, '"')
              .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))
              // 不再移除 #xxx，因为正文已有纯文本，不再是 CSS
              .replace(/\s+/g, ' ').trim();
            console.log(`[debug] HTML正文: ${JSON.stringify(body.slice(0, 80))}`);
          }
          const attachments = (em.attachments || []).filter(att => {
            const ext = (att.filename || '').split('.').pop().toLowerCase();
            return ['jpg','jpeg','png','gif','webp','bmp'].includes(ext);
          });

          // 发件人白名单
          if (ALLOWED_SENDERS.length && !ALLOWED_SENDERS.includes(from)) {
            skip = true; skipReason = '发件人不在白名单'; skipReason += ': ' + from;
          }

          // 主题必须以 @hexo 开头（去掉转发/RE/FW等常见前缀）
          const cleanSubject = subject.replace(/^(转发|Re|RE|FW|Fwd|Re:)\s*:\s*/i, '').trim();
          if (!skip && !/^@hexo\b/i.test(cleanSubject)) {
            skip = true; skipReason = '非博客邮件（主题不含 @hexo）';
          }

          if (skip) {
            console.log(`[skip] ${skipReason}: ${subject.slice(0, 40)}`);
            continue;
          }

          // 去掉 @hexo 前缀（用干净主题）
          subject = cleanSubject.replace(/^@hexo\s*/i, '');

          // 先解析出真正标题（可能来自正文第一行的 # 标题）
          const emailParsed = await parseEmail(subject, body, attachments);

          // 用解析后的标题比对是否已发布
          if (isAlreadyPublished(emailParsed.title)) {
            console.log(`[skip] 已发布过，跳过: ${emailParsed.title}`);
            continue;
          }

          console.log(`[recv] 来自: ${from} | 主题: ${subject.slice(0, 50)}`);

          const { filename, draft } = savePost(emailParsed);

          console.log(`[post] ✅ ${draft ? '草稿' : '发布'}: ${filename}.md`);
          console.log(`       标题: ${emailParsed.title} | 标签: ${JSON.stringify(emailParsed.tags)}`);

          await sendReceipt(from, filename, draft);

          // 记录已处理 UID，防止下次重复处理
          newUIDs.add(String(uid));

          if (!draft && AUTO_DEPLOY) await triggerDeploy();

          // 全部成功后才标记已读
          await client.messageFlagsAdd(uid, ['\\Seen']);

        } catch (err) {
          // 文件已存在（极罕见，随机后缀已避免）
          if (err.message.includes('文件已存在')) {
            console.log(`[skip] 文件冲突，标记已读: ${err.message}`);
            await client.messageFlagsAdd(uid, ['\\Seen']);
            continue;
          }
          // 其他错误不标记已读，下次重试
          console.error(`[error] UID=${uid}: ${err.message}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error(`[error] ${err.message}`);
  } finally {
    if (connected) {
      try { await client.close(); } catch (_) {}
    }
    // 保存本次处理的 UID，防止下次重复处理
    if (newUIDs.size > 0) {
      [...processedUIDs, ...newUIDs].forEach(u => processedUIDs.add(u));
      saveProcessedUIDs(processedUIDs);
      console.log(`[debug] 已记录 ${newUIDs.size} 个 UID`);
    }
  }
}

// ─── 启动 ─────────────────────────────────────────────────────────────────
console.log('========================================');
console.log('  Hexo 邮件发布服务已启动');
console.log('  收件箱: 9187541@qq.com');
console.log('  文章目录: D:\\hexo\\source\\_posts');
console.log('========================================');

processEmails();
