/**
 * 历史上的今天抓取脚本
 * 用法: node fetch-onthisday.js
 *
 * 流程:
 * 1. 调用 API 获取当天历史事件
 * 2. 生成封面图
 * 3. 生成 Hexo 博文
 * 4. Git commit & push
 */

const https = require('https');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { chromium } = require('playwright');

// ============ 配置 ============
const HEXO_ROOT = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_ROOT, 'source', '_posts');
const COVER_DIR = path.join(HEXO_ROOT, 'source', 'images', 'onthisday');
const GIT_BRANCH = 'source';

// ============ 工具函数 ============
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { year: y, month: m, day: d, dateStr: `${y}${m}${d}`, fullDateStr: `${y}年${m}月${d}日` };
}

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 获取历史事件（API每次返回1条随机，调用50次去重） ============
function fetchOneEvent(dateStr) {
  return new Promise((resolve) => {
    const url = `https://apis.jxcxin.cn/api/lishi?date=${dateStr}`;
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const m = data.match(/^(\d{4})年\d{2}月\d{2}日(.+)/);
        if (m) resolve({ year: parseInt(m[1]), text: m[2].trim() });
        else resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

async function fetchEvents(today) {
  const dateStr = `${parseInt(today.month)}-${parseInt(today.day)}`;
  const seen = new Set();
  const events = [];
  // 调用50次收集不同事件
  for (let i = 0; i < 50; i++) {
    const e = await fetchOneEvent(dateStr);
    if (e && !seen.has(e.text)) {
      seen.add(e.text);
      events.push(e);
    }
    await sleep(5000); // 间隔避免触发限流
  }
  // 按年份排序，取前50条
  events.sort((a, b) => b.year - a.year);
  return events.slice(0, 50);
}

// ============ 生成封面图（Playwright 渲染） ============
async function generateCover(today, page) {
  if (!fs.existsSync(COVER_DIR)) fs.mkdirSync(COVER_DIR, { recursive: true });

  const bgColors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b'];
  const accentColors = ['#ffffff', '#ffeaa7', '#fd79a8', '#00d2d3', '#a29bfe'];
  const idx = parseInt(today.dateStr.slice(-1)) % bgColors.length;

  const theme = { bg: bgColors[idx], accent: accentColors[idx], text: '#f5e6ca' };
  const dateStr = `${today.month}月${today.day}日`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:800px;height:450px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${theme.bg};position:relative;font-family:'KaiTi','STKaiti','Microsoft YaHei',sans-serif}
  .d1{width:160px;height:160px;position:absolute;top:-40px;right:40px;border-radius:50%;background:rgba(255,255,255,0.08)}
  .d2{width:100px;height:100px;position:absolute;bottom:30px;left:30px;border-radius:50%;background:rgba(255,255,255,0.06)}
  .d3{width:80px;height:80px;position:absolute;top:50px;left:120px;border-radius:50%;background:rgba(255,255,255,0.05)}
  .title{font-size:56px;color:${theme.text};letter-spacing:8px;text-shadow:2px 2px 8px rgba(0,0,0,0.3);position:relative;z-index:10;font-weight:bold}
  .divider{width:60px;height:2px;background:${theme.accent};opacity:0.6;margin-top:24px;border-radius:1px;position:relative;z-index:10}
  .date{font-size:20px;color:${theme.text};margin-top:20px;letter-spacing:4px;opacity:0.8;position:relative;z-index:10}
</style></head><body>
  <div class="d1"></div><div class="d2"></div><div class="d3"></div>
  <div class="title">\u5386\u53f2\u4e0a\u7684\u4eca\u5929</div>
  <div class="divider"></div>
  <div class="date">${dateStr}</div>
</body></html>`;

  try {
    const tmpHtml = path.join(COVER_DIR, `${today.dateStr}_tmp.html`);
    fs.writeFileSync(tmpHtml, html, 'utf-8');
    const fileUrl = `file:///${tmpHtml.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 500));
    const imgName = `${today.dateStr}_onthisday.jpg`;
    await page.screenshot({ path: path.join(COVER_DIR, imgName), clip: { x: 0, y: 0, width: 800, height: 450 } });
    try { fs.unlinkSync(tmpHtml); } catch (_) {}
    log(`✅ 封面图: ${imgName}`);
    return imgName;
  } catch (err) {
    log(`⚠️ 封面图失败: ${err.message}`);
    return null;
  }
}

// ============ 生成 Hexo 文章 ============
function writeHexoPost(events, today, coverName) {
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

  const cover = coverName ? `/images/onthisday/${coverName}` : '';
  const timeStr = '08:00:00';
  const dateTimeStr = `${today.year}-${today.month}-${today.day} ${timeStr}`;

  // 正文
  let body = '';
  events.forEach((e, i) => {
    body += `### ${e.year}年\n\n${e.text}\n\n`;
  });

  const frontMatter = `---
title: 历史上的今天 — ${today.month}月${today.day}日
date: ${dateTimeStr}
updated: ${dateTimeStr}
categories:
  - 历史上的今天
tags:
  - 历史
  - 今天
cover: ${cover}
toc: true
---

> 📅 **历史上的今天** | ${today.fullDateStr}

${body}

---

📖 数据来源：公共历史数据库

#历史上的今天 #历史
`;

  const fileName = `${today.dateStr}_onthisday.md`;
  const filePath = path.join(POSTS_DIR, fileName);
  fs.writeFileSync(filePath, frontMatter, 'utf-8');
  log(`✅ 文章已生成: ${filePath}`);
  return { fileName, filePath };
}

// ============ Git 操作 ============
function gitCommitAndPush(eventCount, today) {
  const cwd = HEXO_ROOT;
  try {
    log('Git add...');
    execSync('git add -A', { cwd, encoding: 'utf-8', timeout: 30000 });
    const msg = `[历史上的今天] ${today.month}月${today.day}日 — ${eventCount}条事件`;
    log(`Git commit: "${msg}"`);
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd, encoding: 'utf-8', timeout: 30000 });
    log(`Git push to ${GIT_BRANCH}...`);
    execSync(`git push origin ${GIT_BRANCH}`, { cwd, encoding: 'utf-8', timeout: 60000 });
    log('✅ Git push 成功！');
    return true;
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '');
    if (msg.includes('nothing to commit')) {
      log('ℹ️ 没有新的变更');
      return false;
    }
    log(`❌ Git 失败: ${msg}`);
    throw err;
  }
}

// ============ 主流程 ============
async function main() {
  const today = getToday();

  // 检查今天是否已生成
  const postPattern = `${today.dateStr}_onthisday`;
  if (fs.existsSync(POSTS_DIR) && fs.readdirSync(POSTS_DIR).some(f => f.includes(postPattern))) {
    log(`✅ 今日文章已存在，跳过`);
    process.exit(0);
  }

  log(`========== 历史上的今天 ==========`);
  log(`日期: ${today.fullDateStr}`);

  // Step 1: 获取历史事件
  log('获取历史事件（调用API 25次收集去重）...');
  const events = await fetchEvents(today);
  log(`获取到 ${events.length} 条事件`);
  
  if (events.length === 0) {
    log('❌ 未获取到事件');
    process.exit(1);
  }

  // 只取前20条
  const topEvents = events.slice(0, 20);

  // Step 2: 生成封面图（启动浏览器）
  log('启动浏览器生成封面图...');
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    const coverName = await generateCover(today, page);
    await browser.close();
    browser = null;

    // Step 3: 生成文章
    const result = writeHexoPost(topEvents, today, coverName);

    // Step 4: Git 推送
    log('');
    log('========== 提交部署 ==========');
    gitCommitAndPush(topEvents.length, today);

    log('');
    log(`========== 完成 ==========`);
    log(`文章: ${result.fileName}`);
    log(`事件: ${topEvents.length} 条`);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
  }

  process.exit(0);
}

main().catch(err => {
  log(`❌ 脚本失败: ${err.message}`);
  console.error(err);
  process.exit(1);
});
