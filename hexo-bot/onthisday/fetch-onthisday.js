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
const Jimp = require('jimp');

// ============ 配置 ============
const HEXO_ROOT = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_ROOT, 'source', '_posts');
const COVER_DIR = path.join(HEXO_ROOT, 'source', 'images', 'onthisday');
const GIT_BRANCH = 'source';
const API_URL = 'https://apis.jxcxin.cn/api/lishi';

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

// ============ 获取历史事件 ============
function fetchEvents() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // API 返回格式：每行 "1940年05月14日事件描述"
        const lines = data.split('\n').filter(l => l.trim());
        const events = lines.map(line => {
          const m = line.match(/^(\d{4})年\d{2}月\d{2}日(.+)/);
          if (m) return { year: parseInt(m[1]), text: m[2].trim() };
          return null;
        }).filter(Boolean);
        resolve(events);
      });
    }).on('error', reject);
  });
}

// ============ 生成封面图（Jimp） ============
async function generateCover(today) {
  if (!fs.existsSync(COVER_DIR)) fs.mkdirSync(COVER_DIR, { recursive: true });

  const W = 800, H = 450;
  const bgColors = ['#1a1a2e', '#2d1b33', '#1e3c2f', '#1a2a3a', '#3d2b1f'];
  const accentColors = ['#e94560', '#c9a0dc', '#81c784', '#4dd0e1', '#ffb74d'];
  const idx = parseInt(today.dateStr.slice(-1)) % bgColors.length;

  try {
    // 创建纯色背景
    const bgColor = Jimp.cssColorToHex(bgColors[idx]);
    const img = new Jimp(W, H, bgColor);

    // 加载字体
    let font;
    try {
      font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    } catch (e) {
      font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    }

    // 标题
    const title = '历史上的今天';
    const titleFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const titleW = await Jimp.measureText(titleFont, title);
    await img.print(titleFont, (W - titleW) / 2, 80, title);

    // 日期
    const dateStr = `${today.month}月${today.day}日`;
    const dateFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const dateW = await Jimp.measureText(dateFont, dateStr);
    await img.print(dateFont, (W - dateW) / 2, 170, dateStr);

    // 底部装饰线
    const accentHex = Jimp.cssColorToHex(accentColors[idx]);
    for (let x = 300; x < 500; x++) {
      img.setPixelColor(accentHex, x, 260);
    }

    // 保存
    const imgName = `${today.dateStr}_onthisday.jpg`;
    const imgPath = path.join(COVER_DIR, imgName);
    await img.writeAsync(imgPath);
    log(`✅ 封面图: ${imgName}`);
    return imgName;
  } catch (err) {
    log(`⚠️ 封面图生成失败: ${err.message}`);
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
  log('获取历史事件...');
  const events = await fetchEvents();
  log(`获取到 ${events.length} 条事件`);
  
  if (events.length === 0) {
    log('❌ 未获取到事件');
    process.exit(1);
  }

  // 只取前20条
  const topEvents = events.slice(0, 20);

  // Step 2: 生成封面图
  log('生成封面图...');
  const coverName = await generateCover(today);

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

  process.exit(0);
}

main().catch(err => {
  log(`❌ 脚本失败: ${err.message}`);
  console.error(err);
  process.exit(1);
});
