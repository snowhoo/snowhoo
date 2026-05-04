/**
 * quote-bot.js
 * 每日正能量名人名言自动推送
 * 每天6:00从名言库随机选取一条，写入草稿并部署
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ========== 配置 ==========
const QUOTES_DATA_FILE = path.join(__dirname, 'quotes-data.js');
const QUOTES_USED_FILE = path.join(__dirname, 'quotes-used.json');
const POSTS_DIR = 'D:/hexo/source/_posts';
const IMAGES_DIR = 'D:/hexo/source/images/quotes';

// ========== 过滤控制台输出 ==========
const originalLog = console.log;
console.log = (...args) => {
  const tag = args[0];
  if (typeof tag === 'string' && /^\[(recv|post|skip|error|done|deploy|image|quote)\]/.test(tag)) {
    originalLog(...args);
  }
};
console.error = (...args) => {
  const tag = args[0];
  if (typeof tag === 'string' && /^\[(error)\]/.test(tag)) {
    originalError(...args);
  }
};

// ========== 加载名言数据 ==========
function loadQuotes() {
  delete require.cache[require.resolve(QUOTES_DATA_FILE)];
  const data = require(QUOTES_DATA_FILE);
  return Array.isArray(data) ? data : data.quotes || [];
}

// ========== 加载已用名言记录 ==========
function loadUsedQuotes() {
  try {
    return JSON.parse(fs.readFileSync(QUOTES_USED_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

// ========== 保存已用名言记录 ==========
function saveUsedQuotes(used) {
  fs.writeFileSync(QUOTES_USED_FILE, JSON.stringify(used, null, 2), 'utf8');
}

// ========== 选取一条未用名言 ==========
function pickQuote(quotes, used) {
  const unused = quotes.filter((q, i) => !used.includes(i));
  if (unused.length === 0) {
    // 全部用完，重置
    console.log('[quote] 名言库已用完，重置记录');
    saveUsedQuotes([]);
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  const item = unused[Math.floor(Math.random() * unused.length)];
  const index = quotes.indexOf(item);
  used.push(index);
  saveUsedQuotes(used);
  return item;
}

// ========== 生成 SVG 封面图（浅色明亮风格） ==========
function generateCoverSvg(quote, author, outputPath) {
  // 判断是否为英文名言
  const isEnglish = /^[a-zA-Z]/.test(quote) && /[a-zA-Z]/.test(quote.slice(0, 30));

  // 随机配色方案（保持水墨山峦风格，但色调不同）
  const colorSchemes = [
    { // 暖橙风
      bgStart: '#fef9f3', bgMid: '#fff8f0', bgEnd: '#fdf2e9',
      accent1: '#e94560', accent2: '#f5a623',
      mtn1: '#8B7355', mtn2: '#6B8E6B',
      moon: '#FFE4B5', tree: '#4a6741',
      text: '#1a1a2e'
    },
    { // 清新绿
      bgStart: '#f0fdf4', bgMid: '#f0fdf4', bgEnd: '#dcfce7',
      accent1: '#10b981', accent2: '#34d399',
      mtn1: '#6B8E6B', mtn2: '#8B7355',
      moon: '#d1fae5', tree: '#3d5a3d',
      text: '#1a1a2e'
    },
    { // 柔紫风
      bgStart: '#faf5ff', bgMid: '#f5f3ff', bgEnd: '#ede9fe',
      accent1: '#8b5cf6', accent2: '#c084fc',
      mtn1: '#7c3aed', mtn2: '#6d28d9',
      moon: '#ddd6fe', tree: '#4c1d95',
      text: '#1e1b4b'
    },
    { // 天空蓝
      bgStart: '#f0f9ff', bgMid: '#e0f2fe', bgEnd: '#bae6fd',
      accent1: '#0ea5e9', accent2: '#38bdf8',
      mtn1: '#0284c7', mtn2: '#0369a1',
      moon: '#e0f2fe', tree: '#0c4a6e',
      text: '#0c4a6e'
    },
    { // 金棕风
      bgStart: '#fefce8', bgMid: '#fef9c3', bgEnd: '#fef08a',
      accent1: '#ca8a04', accent2: '#eab308',
      mtn1: '#92400e', mtn2: '#b45309',
      moon: '#fef08a', tree: '#78350f',
      text: '#451a03'
    }
  ];

  // 随机选择配色方案
  const scheme = colorSchemes[Math.floor(Math.random() * colorSchemes.length)];

  // 文字换行函数（支持中英文）
  function wrapText(text, maxChars, isEng) {
    if (isEng) {
      // 英文：按单词边界换行，每行最多 maxChars 个单词
      const words = text.split(/\s+/);
      const lines = [];
      let cur = '';
      for (const word of words) {
        if (cur.length === 0) {
          cur = word;
        } else if ((cur + ' ' + word).length <= maxChars) {
          cur += ' ' + word;
        } else {
          if (cur) lines.push(cur);
          cur = word;
        }
      }
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    } else {
      // 中文：按字符数换行
      const lines = [];
      let cur = '';
      for (const char of text) {
        if (cur.length >= maxChars && char !== '，' && char !== '。' && char !== '！' && char !== '？') {
          lines.push(cur.trim());
          cur = char;
        } else if (cur.length >= maxChars + 2) {
          lines.push(cur.trim());
          cur = char;
        } else {
          cur += char;
        }
      }
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    }
  }

  // 中英文统一字体大小，按视觉宽度换行
  const fontSize = 46;
  // 中文字符宽度约等于2个英文字符宽度，所以英文每行字符数应该是中文的2倍
  const maxChars = isEnglish ? 36 : 18;
  const lines = wrapText(quote, maxChars, isEnglish);
  const lineH = fontSize + 14;
  const totalH = lines.length * lineH;
  const startY = 200 - totalH / 2 + lineH * 0.7;

  const tspanLines = lines.map((l, i) =>
    `      <tspan x="650" dy="${i === 0 ? 0 : lineH}" text-anchor="middle">${escapeXml(l)}</tspan>`
  ).join('\n');

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="400" viewBox="0 0 1300 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${scheme.bgStart}"/>
      <stop offset="40%" stop-color="${scheme.bgMid}"/>
      <stop offset="100%" stop-color="${scheme.bgEnd}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${scheme.accent1}"/>
      <stop offset="100%" stop-color="${scheme.accent2}"/>
    </linearGradient>
    <linearGradient id="mtn1" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${scheme.mtn1}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${scheme.mtn1}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="mtn2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${scheme.mtn2}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${scheme.mtn2}" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="moon" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${scheme.moon}" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="${scheme.moon}" stop-opacity="0"/>
    </radialGradient>
    <filter id="textBg">
      <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <!-- 背景 -->
  <rect width="1300" height="400" fill="url(#bg)"/>

  <!-- 水墨山峦 -->
  <path d="M-50 400 L162 254 L358 400 Z" fill="url(#mtn1)" opacity="0.6"/>
  <path d="M200 400 L438 222 L638 400 Z" fill="url(#mtn1)" opacity="0.6"/>
  <path d="M538 400 L845 191 L1133 400 Z" fill="url(#mtn1)" opacity="0.6"/>
  <path d="M900 400 L1200 241 L1300 400 Z" fill="url(#mtn1)" opacity="0.6"/>
  <path d="M-50 400 L96 305 L338 400 Z" fill="url(#mtn2)" opacity="0.6"/>
  <path d="M746 400 L977 293 L1200 400 Z" fill="url(#mtn2)" opacity="0.6"/>

  <!-- 月亮光晕 -->
  <circle cx="1025" cy="76" r="51" fill="url(#moon)"/>
  <circle cx="1025" cy="76" r="24" fill="${scheme.moon}" opacity="0.15"/>

  <!-- 飞鸟 -->
  <path d="M200 95 Q210 89 220 95 Q230 89 240 95" stroke="${scheme.mtn1}" stroke-width="1.5" fill="none" opacity="0.35"/>
  <path d="M260 82 Q268 77 276 82 Q284 77 292 82" stroke="${scheme.mtn1}" stroke-width="1.5" fill="none" opacity="0.28"/>

  <!-- 云雾 -->
  <ellipse cx="867" cy="127" rx="150" ry="19" fill="#ffffff" opacity="0.16"/>
  <ellipse cx="433" cy="114" rx="120" ry="16" fill="#ffffff" opacity="0.13"/>

  <!-- 松树剪影 -->
  <g opacity="0.18" fill="${scheme.tree}">
    <rect x="1141" y="267" width="5" height="133"/>
    <ellipse cx="1143" cy="260" rx="32" ry="22"/>
    <ellipse cx="1143" cy="241" rx="24" ry="18"/>
    <ellipse cx="1143" cy="225" rx="16" ry="13"/>
  </g>
  <g opacity="0.14" fill="${scheme.tree}">
    <rect x="1195" y="286" width="4" height="114"/>
    <ellipse cx="1197" cy="279" rx="25" ry="18"/>
    <ellipse cx="1197" cy="263" rx="19" ry="14"/>
  </g>

  <!-- 顶部渐变条 -->
  <rect x="0" y="0" width="1300" height="5" fill="url(#accent)"/>

  <!-- 底部渐变条 -->
  <rect x="0" y="395" width="1300" height="5" fill="url(#accent)"/>

  <!-- 名言文字 -->
  <text x="650" y="${startY}"
        font-family="'Microsoft YaHei', 'PingFang SC', 'SimHei', 'Arial', sans-serif"
        font-size="${fontSize}" fill="${scheme.text}" text-anchor="middle" font-weight="900"
        dominant-baseline="auto" filter="url(#textBg)">
${tspanLines}
  </text>

  <!-- 分隔线 -->
  <rect x="390" y="${startY + totalH + 20}" width="520" height="3" rx="1.5" fill="url(#accent)" opacity="0.75"/>

  <!-- 作者名 -->
  <text x="650" y="${startY + totalH + 60}"
        font-family="'Microsoft YaHei', 'PingFang SC', 'SimHei', 'Arial', sans-serif"
        font-size="30" fill="${scheme.accent1}" text-anchor="middle" font-weight="700"
        letter-spacing="5" filter="url(#textBg)">—— ${escapeXml(author)}</text>

  <!-- 右下角标签 -->
  <rect x="520" y="360" width="260" height="28" rx="14" fill="url(#accent)" opacity="0.88"/>
  <text x="650" y="381"
        font-family="'Microsoft YaHei', sans-serif"
        font-size="16" fill="#ffffff" text-anchor="middle" font-weight="500">每日正能量</text>
</svg>`;

  fs.writeFileSync(outputPath, svgContent, 'utf8');
  console.log('[image] 封面图已生成:', path.basename(outputPath));
}

// ========== XML 转义 ==========
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ========== 生成 Hexo 文章 ==========
function createPost(quote, author, source) {
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).replace(/\//g, '-');

  const dateFile = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const filename = `${dateFile}_daily-quote.md`;
  const filepath = path.join(POSTS_DIR, filename);

  // 检查是否已存在
  if (fs.existsSync(filepath)) {
    console.log('[skip] 今日名言已发布，跳过');
    return null;
  }

  // 生成封面图
  const imageName = `${dateFile}_quote-cover.svg`;
  const imagePath = path.join(IMAGES_DIR, imageName);
  const imageUrl = `/images/quotes/${imageName}`;
  generateCoverSvg(quote, author, imagePath);

  // 判断是否为英文名言（以英文字母开头）
  const isEnglish = /^[a-zA-Z]/.test(quote) && /[a-zA-Z]/.test(quote.slice(0, 30));

  // 英文名言标题取更长前缀（50字符），中文取20字符
  if (isEnglish) {
    title = `${quote.slice(0, 50)}${quote.length > 50 ? '…' : ''} —— ${author}`;
  } else {
    title = `${quote.slice(0, 20)}${quote.length > 20 ? '…' : ''} —— ${author}`;
  }

  let body = '';
  // 封面图置顶
  body += `![每日正能量](${imageUrl})\n\n`;
  // 日期标注
  body += `**每日正能量 · ${dateStr}**\n\n`;
  // 完整名言内容
  body += `> ${quote}\n\n`;
  // 名言出处
  if (source) {
    body += `**出处：** ${source}\n\n`;
  }
  // 主题标签（支持英文）
  const themeTag = getThemeTag(quote, isEnglish);
  body += `${themeTag}\n\n`;
  // 结尾寄语
  body += `🌅 新的一天，从一句正能量开始。愿你今天心情愉快，万事顺意。\n\n`;

  const frontmatter = {
    title,
    date: now,
    updated: now,
    categories: ['每日正能量'],
    tags: ['名言', '正能量', '励志', '早安'],
    cover: imageUrl,
  };

  const fm = `---\n${Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map(x => `  - ${x}`).join('\n')}`;
    if (v instanceof Date) return `${k}: ${v.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')}`;
    return `${k}: ${v}`;
  }).join('\n')}\n---\n\n`;

  const content = fm + body;
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('[post] 已创建:', filename);
  return filepath;
}

// ========== 根据名言内容判断主题（支持中英文） ==========
function getThemeTag(quote, isEnglish = false) {
  if (isEnglish) {
    // 英文关键词匹配
    const lower = quote.toLowerCase();
    if (/dream|hope|believ|courage|brave|strength|success|achieve|persist|never give|keep moving/.test(lower)) {
      return '✨ Pursue Your Dreams with Courage';
    }
    if (/love|heart|kind|compassion|friend|trust/.test(lower)) {
      return '💕 Love and Kindness Matter';
    }
    if (/wisdom|knowledge|think|learn|growth|growth mindset/.test(lower)) {
      return '🌿 Wisdom Comes from Experience';
    }
    if (/peace|calm|seren|happ|joy|smile|balance/.test(lower)) {
      return '🍃 Find Peace Within Yourself';
    }
    if (/work|effort|hard|dilig|persever|dedicat|focus/.test(lower)) {
      return '📚 Hard Work Leads to Excellence';
    }
    if (/change|time|moment|present|life|journey/.test(lower)) {
      return '🌟 Embrace Change and Live Fully';
    }
    return '🌟 Shine Bright, Fear Nothing';
  }

  // 中文关键词匹配
  if (quote.includes('志') || quote.includes('励') || quote.includes('拼') || quote.includes('奋')) return '✨ 志存高远，脚踏实地';
  if (quote.includes('情') || quote.includes('爱') || quote.includes('相') || quote.includes('思')) return '💕 情深意长，珍惜当下';
  if (quote.includes('悟') || quote.includes('智') || quote.includes('明') || quote.includes('道')) return '🌿 洞明世事，练达人情';
  if (quote.includes('豁') || quote.includes('淡') || quote.includes('平') || quote.includes('静')) return '🍃 心如止水，从容淡定';
  if (quote.includes('勤') || quote.includes('学') || quote.includes('读') || quote.includes('书')) return '📚 书山有路，学海无涯';
  if (quote.includes('义') || quote.includes('忠') || quote.includes('仁') || quote.includes('德')) return '⚔️ 仁义为先，厚德载物';
  return '🌟 心有光芒，何惧风雨';
}

// ========== spawn 带超时封装 ==========
function spawnWithTimeout(cmd, args, opts, timeoutSec, label) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, opts);
    let out = '';
    proc.stdout.on('data', d => { out += d; });
    proc.stderr.on('data', d => { out += d; });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({ code: -1, out: '[timeout]', killed: true });
    }, timeoutSec * 1000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

// ========== 部署到博客（async/await + 完整错误处理） ==========
async function deploy() {
  const log = (...args) => process.stdout.write(args.join(' ') + '\n');
  log('[deploy] ========== 开始部署 ==========');
  const hexoDir = 'D:/hexo';

  // Step 1: git add
  let r = await spawnWithTimeout(
    'cmd', ['/c', 'git add source/_posts/ source/images/quotes/'],
    { cwd: hexoDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    30, 'git add'
  );
  log('[git] add: code=' + r.code);

  // Step 2: git commit（使用纯 ASCII 消息，避免引号编码问题）
  r = await spawnWithTimeout(
    'cmd', ['/c', 'git commit -m post:daily:quote:push'],
    { cwd: hexoDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    30, 'git commit'
  );
  log('[git] commit: code=' + r.code + ' | ' + r.out.slice(0, 100));
  if (r.out.includes('nothing to commit')) {
    log('[git] no changes to commit, skip');
  } else if (r.code === 0) {
    log('[git] committed successfully');
  } else {
    log('[git] commit failed: ' + r.out.slice(-200));
  }

  // Step 3: git push
  r = await spawnWithTimeout(
    'cmd', ['/c', 'git push origin source'],
    { cwd: hexoDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    60, 'git push'
  );
  log('[git] push: code=' + r.code + ' | ' + r.out.slice(0, 100));
  if (r.code === 0) {
    log('[git] pushed successfully');
  } else if (r.out.includes('non-fast-forward') || r.out.includes('rejected')) {
    log('[git] push rejected (non-fast-forward), trying force push...');
    const rf = await spawnWithTimeout(
      'cmd', ['/c', 'git push --force origin source'],
      { cwd: hexoDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      60, 'git push --force'
    );
    log('[git] force push: code=' + rf.code);
    if (rf.code === 0) log('[git] force push succeeded');
  } else {
    log('[git] push failed: ' + r.out.slice(-200));
  }

  // 已改用 GitHub Actions 自动构建部署，只需 push 到 source 分支即可
  log('[deploy] source pushed, GitHub Actions will build & deploy automatically');
  log('[deploy] ========== 部署完成 ==========');
}

// ========== 主程序 ==========
async function main() {
  console.log('[quote] ===== 每日名言推送开始 =====');

  const quotes = loadQuotes();
  const used = loadUsedQuotes();
  console.log(`[quote] 名言库共 ${quotes.length} 条，已用 ${used.length} 条`);

  const quoteData = pickQuote(quotes, used);
  console.log(`[quote] 选中名言: "${quoteData.quote}"`);
  console.log(`[quote] 作者: ${quoteData.author}`);

  const postPath = createPost(quoteData.quote, quoteData.author, quoteData.source);

  if (postPath) {
    await deploy();
    console.log('[done] ===== 名言推送完成 =====');
  } else {
    console.log('[skip] 今日已发布，跳过部署');
  }
}

main().catch(e => {
  console.error('[error] 程序异常:', e.message);
  process.exit(1);
});
