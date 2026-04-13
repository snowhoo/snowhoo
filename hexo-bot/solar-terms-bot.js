/**
 * solar-terms-bot.js
 * 二十四节气自动发文机器人
 *
 * 检查当天是否为节气日，是则自动生成并发布文章
 * 用法: node solar-terms-bot.js
 * 建议配合 Windows 任务计划程序每日执行
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SOLAR_TERMS } = require('./solar-terms-data');
const { solar2lunar } = require('solar2lunar');

// 节气序号映射（与 generate-solar-term-svgs.js 保持一致）
const TERM_INDEX = {};
SOLAR_TERMS.forEach((t, i) => { TERM_INDEX[t.name] = i + 1; });

// ─── 配置 ───────────────────────────────────────────────────────────────────
const HEXO_PATH = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_PATH, 'source', '_posts');
const IMG_DIR = path.join(HEXO_PATH, 'source', 'images', 'solar-terms');
const LOCK_FILE = path.join(__dirname, 'solar-terms.lock');

// ─── 农历工具 ─────────────────────────────────────────────────────────────
const LUNAR_MONTHS = ['', '正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
const LUNAR_DAYS   = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
                      '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
                      '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

function formatLunarDate(year, month, day) {
  const r = solar2lunar(year, month, day);
  const monthName = LUNAR_MONTHS[r.lMonth] || (r.lMonth > 0 ? r.lMonth + '月' : '闰' + LUNAR_MONTHS[Math.abs(r.lMonth)] || Math.abs(r.lMonth) + '月');
  const dayName = LUNAR_DAYS[r.lDay] || r.lDay + '日';
  return `${r.lYear}年${monthName}${dayName}`;
}
function log(tag, msg) {
  const validTags = ['solar', 'done', 'skip', 'error', 'info'];
  if (validTags.includes(tag)) {
    console.log(`[${tag}] ${msg}`);
  }
}

function hexoDeploy() {
  return new Promise((resolve) => {
    log('solar', '开始生成并部署...');
    const hexo = spawn('cmd', ['/c', 'npm run deploy'], {
      cwd: HEXO_PATH,
      stdio: 'pipe',
      windowsHide: true
    });
    let output = '';
    hexo.stdout.on('data', d => { output += d; });
    hexo.stderr.on('data', d => { output += d; });
    hexo.on('close', code => {
      log('solar', output.includes('Deploy done') ? '部署完成' : '部署异常: ' + output.slice(-200));
      resolve();
    });
    hexo.on('error', err => {
      log('error', '部署失败: ' + err.message);
      resolve();
    });
  });
}

function savePost(term, content, displayTitle) {
  const title = displayTitle || term.name;
  const idx = TERM_INDEX[title];
  const coverFile = `solar-term-${String(idx).padStart(2,'0')}.svg`;
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const slug = ts + '_solar_term';
  const filepath = path.join(POSTS_DIR, `${slug}.md`);

  const frontMatter = [
    '---',
    `title: ${title}`,
    `date: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')}`,
    `updated: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')}`,
    'categories:',
    '  - 二十四节气',
    'tags:',
    '  - 节气',
    `  - ${title}`,
    `cover: /images/solar-terms/${coverFile}`,
    'toc: true',
    '---',
    ''
  ].join('\n');

  fs.writeFileSync(filepath, '\ufeff' + frontMatter + content + '\n', 'utf8');
  log('solar', '已创建: ' + slug + '.md');
  return slug;
}

function alreadyPosted(term) {
  // 检查今年是否已发布过该节气文章
  const year = new Date().getFullYear();
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  return files.some(f => {
    const content = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    return content.includes(`  - ${term.name}`) && content.includes(year.toString());
  });
}

// ─── 单例锁 ────────────────────────────────────────────────────────────────
function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'));
    try {
      process.kill(pid, 0);
      log('solar', '上一次的进程仍在运行 (PID: ' + pid + ')，退出');
      return false;
    } catch (_) {
      // 旧锁文件，进程已死，继续
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  return true;
}

// ─── 主逻辑 ────────────────────────────────────────────────────────────────
function main() {
  if (!acquireLock()) return;

  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();

  // 农历正月的小寒/大寒跨年处理
  // 如果当前是1月，检查是否有节气是今天
  const todayTerm = SOLAR_TERMS.find(t => {
    // 特殊处理：当年年末未过春节时，1月节气仍算上一年
    if (t.month === 1) {
      // 小寒(1/5)和大寒(1/20) 永远在公历1月
      return t.month === month && t.day === day;
    }
    return t.month === month && t.day === day;
  });

  if (!todayTerm) {
    log('solar', `${month}月${day}日 — 今天不是节气日`);
    return;
  }

  if (alreadyPosted(todayTerm)) {
    log('solar', `今年${todayTerm.name}文章已发布过，跳过`);
    return;
  }

  log('solar', `今天是${todayTerm.name}（${todayTerm.pinyin}），开始生成文章`);

  // 确认封面图存在
  const idx = TERM_INDEX[todayTerm.name];
  const coverFile = `solar-term-${String(idx).padStart(2,'0')}.svg`;
  const coverPath = path.join(IMG_DIR, coverFile);
  if (!fs.existsSync(coverPath)) {
    log('error', '封面图不存在: ' + coverFile + '，请先运行 generate-solar-term-svgs.js');
    return;
  }

  // 生成文章内容
  const year = now.getFullYear();
  const lunarDate = formatLunarDate(year, todayTerm.month, todayTerm.day);
  const title = `${todayTerm.name} · ${lunarDate.slice(5)}`;
  let content = `> 来源：互联网 | 农历${lunarDate} | ${todayTerm.month}月${todayTerm.day}日\n\n`;

  // 年份差异引言（每年不同）
  const yearIntros = [
    `又是一年${todayTerm.name}，${year}年的这个时节，你所在的城市是怎样的光景？`,
    `岁月流转，四季更迭。${year}年${todayTerm.name}悄然而至，你准备好迎接这个季节了吗？`,
    `${year}年的${todayTerm.name}如约而至，愿你在这一节气里，顺应天时，收获满满。`,
    `${todayTerm.name}是${year}年的第${TERM_INDEX[todayTerm.name]}个节气，也是季节转换的重要节点。`
  ];
  const yearIntro = yearIntros[(year * TERM_INDEX[todayTerm.name]) % yearIntros.length];
  content += `${yearIntro}\n\n`;

  // 节气介绍
  content += `## ${todayTerm.name} · ${todayTerm.pinyin}\n\n`;
  content += `${todayTerm.desc}\n\n`;

  // 插入正文图片（1-2张）
  const illDir = path.join(IMG_DIR, 'illustrations');
  const termIllIdx = TERM_INDEX[todayTerm.name];
  const illFiles = [];
  for (let i = 1; i <= 2; i++) {
    const illFile = `solar-term-${String(termIllIdx).padStart(2,'0')}-${String(i).padStart(2,'0')}.svg`;
    const illPath = path.join(illDir, illFile);
    if (fs.existsSync(illPath)) {
      illFiles.push(illFile);
      content += `![](/images/solar-terms/illustrations/${illFile})\n\n`;
    }
  }

  // 习俗
  content += `## 传统习俗\n\n`;
  todayTerm.customs.forEach(c => {
    content += `- ${c}\n`;
  });
  content += '\n';

  // 诗词
  content += `## 节气诗词\n\n`;
  content += `> **${todayTerm.poem}**\n\n`;

  // 年份尾注
  content += `> **${year}年${todayTerm.name}** — 四时有序，万物有时。\n\n`;

  // 关键词标签
  content += `## 时令关键词\n\n`;
  content += todayTerm.keywords.map(k => `#${k}`).join('  ') + '\n\n';

  // 保存
  savePost(todayTerm, content, title);

  // 部署
  hexoDeploy().then(() => {
    log('done', `${todayTerm.name}节气文章发布成功！`);
  });
}

main();
