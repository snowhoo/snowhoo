/**
 * 人民信报夜读抓取脚本
 * 用法: node fetch-peopleapp-yedu.js
 * 
 * 流程:
 * 1. 通过 Playwright 打开 peopleapp.com 夜读专栏
 * 2. 检测是否有今日新文章
 * 3. 提取标题和正文
 * 4. 生成 Hexo 博文到 source/_posts/
 * 5. Git add/commit/push 触发 GitHub Actions 部署
 */

const { chromium } = require('playwright');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============ 配置 ============
const HEXO_ROOT = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_ROOT, 'source', '_posts');
const COVER_DIR = path.join(HEXO_ROOT, 'source', 'images', 'yedu');
const GIT_BRANCH = 'source';
const SOURCE_URL = 'https://www.peopleapp.com/audioSpecial/57';
const SOURCE_NAME = '人民日报（人民信报）';
const CATEGORY = '人民夜读';

// ============ 工具函数 ============
function getToday(dateOverride) {
  let now;
  if (dateOverride && /^(\d{4})(\d{2})(\d{2})$/.test(dateOverride)) {
    now = new Date(RegExp.$1, parseInt(RegExp.$2) - 1, RegExp.$3);
  } else {
    now = new Date();
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { year: y, month: m, day: d, dateStr: `${y}${m}${d}`, fullDateStr: `${y}年${m}月${d}日` };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(msg) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${ts}] ${msg}`);
}

// ============ 封面图生成（复用原逻辑） ============
async function generateCoverImage(paragraphs, today, page) {
  let quote = '';
  for (const p of paragraphs) {
    if (p.type === 'text' && p.content.length > 2 && p.content.length < 100) {
      const cleaned = p.content.trim();
      if (!cleaned.includes('人民日报') && !cleaned.includes('关注') && !cleaned.includes('分享')) {
        quote = cleaned;
        break;
      }
    }
  }
  if (!quote && paragraphs.length > 0) {
    const firstText = paragraphs.find(p => p.type === 'text');
    if (firstText) quote = firstText.content.trim().substring(0, 14);
  }
  if (!quote) quote = '夜读';
  if (quote.length > 14) quote = quote.substring(0, 14);

  const warmBgs = [
    { bg: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', text: '#f5e6ca', accent: '#e94560', name: '夜空蓝' },
    { bg: 'linear-gradient(180deg, #2d1b33 0%, #4a1942 50%, #6b2d5c 100%)', text: '#f8e8f0', accent: '#c9a0dc', name: '浪漫紫' },
    { bg: 'linear-gradient(180deg, #1e3c2f 0%, #2d5a3f 50%, #3d7a5f 100%)', text: '#e8f5e9', accent: '#81c784', name: '森林绿' },
    { bg: 'linear-gradient(180deg, #1a2a3a 0%, #2a4a5a 50%, #3a6a7a 100%)', text: '#e0f7fa', accent: '#4dd0e1', name: '湖光蓝' },
    { bg: 'linear-gradient(180deg, #3d2b1f 0%, #5d4a3a 50%, #7d6a5a 100%)', text: '#fff3e0', accent: '#ffb74d', name: '暖木棕' },
  ];
  const theme = warmBgs[Math.floor(Math.random() * warmBgs.length)];
  const todayStr = `${today.year}.${today.month}.${today.day}`;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1280px;height:720px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${theme.bg};position:relative}
  .deco-circle{position:absolute;border-radius:50%;pointer-events:none}
  .d1{width:260px;height:260px;top:-60px;right:80px;background:rgba(255,255,255,0.08)}
  .d2{width:180px;height:180px;bottom:40px;left:60px;background:rgba(255,255,255,0.06)}
  .d3{width:120px;height:120px;top:80px;left:200px;background:rgba(255,255,255,0.05)}
  .title{font-family:'KaiTi','STKaiti','FangSong',serif;font-size:88px;color:${theme.text};letter-spacing:12px;text-shadow:2px 2px 12px rgba(0,0,0,0.3);line-height:1.4;text-align:center;padding:0 60px;position:relative;z-index:10}
  .divider{width:80px;height:2px;background:${theme.accent};opacity:0.6;margin-top:36px;border-radius:1px;position:relative;z-index:10}
  .date{font-family:'KaiTi','STKaiti',serif;font-size:32px;color:${theme.text};margin-top:48px;letter-spacing:4px;opacity:0.8;position:relative;z-index:10}
</style></head><body>
  <div class="deco-circle d1"></div><div class="deco-circle d2"></div><div class="deco-circle d3"></div>
  <div class="title">${quote}</div><div class="divider"></div>
  <div class="date">${todayStr} 夜读</div>
</body></html>`;

  try {
    const tmpHtmlPath = path.join(COVER_DIR, `${today.dateStr}_pp_cover_tmp.html`);
    fs.writeFileSync(tmpHtmlPath, html, 'utf-8');
    const fileUrl = `file:///${tmpHtmlPath.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));
    const imgName = `${today.dateStr}_pp_yedu_00.jpg`;
    const imgPath = path.join(COVER_DIR, imgName);
    await page.screenshot({ path: imgPath, clip: { x: 0, y: 0, width: 1280, height: 720 } });
    try { fs.unlinkSync(tmpHtmlPath); } catch (_) {}
    log(`✅ 生成封面图: ${imgName}（${theme.name}主题）`);
    return imgName;
  } catch (err) {
    log(`❌ 生成封面图失败: ${err.message}`);
    return null;
  }
}

// ============ 文章正文提取 ============
async function extractArticle(page) {
  const article = await page.evaluate(() => {
    // 标题：<title> 或 h1
    const title = document.title
      .replace(/[_\-]\s*人民信报$/, '')
      .replace(/[_\-]\s*人民日报$/, '')
      .trim()
      || (document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '');

    // 正文：获取所有可见文本段落
    const paragraphs = [];
    const seenTexts = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (t.length > 8 && !seenTexts.has(t.substring(0, 40))) {
        seenTexts.add(t.substring(0, 40));
        paragraphs.push({ type: 'text', content: t });
      }
    }

    // 找图片
    const images = [];
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('data-src') || img.src || '';
      if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar') && !src.includes('nuxt') && !src.endsWith('.svg')) {
        images.push(src);
      }
    });

    return { title, paragraphs, images: images.slice(0, 10) };
  });

  log(`  标题: ${article.title}`);
  log(`  段落数: ${article.paragraphs.length}, 图片数: ${article.images.length}`);
  return article;
}

// ============ Markdown 生成 ============
function articleToMarkdown(article, today, downloadedNames) {
  const { paragraphs } = article;
  const mergedParagraphs = [];

  if (downloadedNames.length > 0) {
    mergedParagraphs.push({ type: 'image', src: `/images/yedu/${downloadedNames[0]}` });
  }

  let currentText = '';
  for (const p of paragraphs) {
    if (p.type === 'text') {
      const c = p.content;
      if (c.length < 3 || c.includes('人民日报') && c.length < 10 ||
          c.includes('来源') || c.includes('转载') || c.includes('版权')) continue;
      currentText += (currentText ? '\n\n' : '') + c;
    } else if (p.type === 'image') {
      if (currentText.trim()) { mergedParagraphs.push({ type: 'text', content: currentText.trim() }); currentText = ''; }
      mergedParagraphs.push({ type: 'image', src: p.src });
    }
  }
  if (currentText.trim()) mergedParagraphs.push({ type: 'text', content: currentText.trim() });

  let markdownBody = '', imgIndex = 0;
  for (const p of mergedParagraphs) {
    if (p.type === 'text') {
      const sentences = p.content.split('\n').filter(s => s.trim());
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i].trim();
        if (!s) continue;
        if (/^[0-9０-９]+[\.\、\．]/.test(s) || /^[第][一二三四五六七八九十]+/.test(s)) {
          markdownBody += `\n### ${s}\n\n`;
        } else if (i === 0 && !s.startsWith('>') && !s.startsWith('【')) {
          markdownBody += `**${s}**\n\n`;
        } else {
          markdownBody += `${s}\n\n`;
        }
      }
    } else if (p.type === 'image') {
      imgIndex++;
      const imgName = `${today.dateStr}_pp_yedu_${String(imgIndex).padStart(2, '0')}.jpg`;
      markdownBody += `\n![夜读配图](/images/yedu/${imgName})\n\n`;
    }
  }

  markdownBody = markdownBody.replace(/\n{3,}$/, '\n');
  const sourceTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  markdownBody += `\n> 来源：${SOURCE_NAME} | 采集时间：${sourceTime}\n`;
  return markdownBody;
}

// ============ 下载图片 ============
async function downloadImages(images, today, page) {
  if (!fs.existsSync(COVER_DIR)) fs.mkdirSync(COVER_DIR, { recursive: true });
  const downloaded = [];
  for (let i = 0; i < images.length && downloaded.length < 5; i++) {
    const imgName = `${today.dateStr}_pp_yedu_${String(downloaded.length + 1).padStart(2, '0')}.jpg`;
    const imgPath = path.join(COVER_DIR, imgName);
    try {
      const imgBase64 = await page.evaluate(async (src) => {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          return new Promise(resolve => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.readAsDataURL(blob); });
        } catch (e) { return null; }
      }, images[i]);
      if (imgBase64 && imgBase64.startsWith('data:image')) {
        fs.writeFileSync(imgPath, Buffer.from(imgBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
        downloaded.push(imgName);
        log(`  图片已下载: ${imgName}`);
      }
    } catch (err) { log(`  ⚠️ 图片下载失败: ${err.message}`); }
  }
  return downloaded;
}

// ============ 生成 Hexo 文章 ============
function writeHexoPost(article, markdownBody, today, downloadedNames) {
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });

  let cleanTitle = article.title.replace(/人民日报[：:\s]*/gi, '').replace(/^【夜读】/, '').replace(/^夜读[丨\|\/]/, '').trim();
  if (!cleanTitle || cleanTitle === article.title) cleanTitle = article.title;
  if (!cleanTitle) cleanTitle = `夜读 - ${today.fullDateStr}`;

  const cover = downloadedNames.length > 0 ? `/images/yedu/${downloadedNames[0]}` : '/images/yedu/yedu-default.svg';
  const timeStr = '22:00:00';
  const dateTimeStr = `${today.year}-${today.month}-${today.day} ${timeStr}`;

  const frontMatter = `---
title: ${cleanTitle}
date: ${dateTimeStr}
updated: ${dateTimeStr}
categories:
  - ${CATEGORY}
tags:
  - 夜读
  - 美文
  - ${CATEGORY}
cover: ${cover}
toc: true
---

> 🏮 **${CATEGORY}** | ${today.fullDateStr}

${markdownBody}

---

📮 本文内容来源于${SOURCE_NAME}夜读专栏，版权归原作者所有。

🌙 晚安，好梦。
`;

  const fileName = `${today.dateStr}_pp-yedu.md`;
  const filePath = path.join(POSTS_DIR, fileName);
  fs.writeFileSync(filePath, frontMatter, 'utf-8');
  log(`✅ 文章已生成: ${filePath}`);
  return { fileName, filePath, cleanTitle };
}

// ============ Git 操作 ============
function gitCommitAndPush(article, today) {
  const cwd = HEXO_ROOT;
  try {
    log('Git add...');
    execSync('git add -A', { cwd, encoding: 'utf-8', timeout: 30000 });
    const commitMsg = `[${CATEGORY}] ${article.title || `${CATEGORY} ${today.fullDateStr}`}`;
    log(`Git commit: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd, encoding: 'utf-8', timeout: 30000 });
    log(`Git push to ${GIT_BRANCH}...`);
    execSync(`git push origin ${GIT_BRANCH}`, { cwd, encoding: 'utf-8', timeout: 60000 });
    log('✅ Git push 成功！');
    return true;
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '');
    if (msg.includes('nothing to commit') || msg.includes('nothing added')) {
      log('ℹ️ 没有新的变更需要提交');
      return false;
    }
    log(`❌ Git 操作失败: ${msg}`);
    throw err;
  }
}

// ============ 主流程 ============
async function main() {
  const dateOverride = process.argv.indexOf('--date') >= 0 ? process.argv[process.argv.indexOf('--date') + 1] : null;
  const today = getToday(dateOverride);
  if (dateOverride) log(`[覆盖模式] 使用指定日期: ${today.fullDateStr}`);

  // 检查今天是否已经抓取过
  const postPattern = `${today.dateStr}_pp-yedu`;
  if (fs.readdirSync(POSTS_DIR).some(f => f.includes(postPattern))) {
    log(`✅ 今日文章已存在（匹配 ${postPattern}），跳过`);
    process.exit(0);
  }

  log(`========== ${CATEGORY}抓取 ==========`);
  log(`日期: ${today.fullDateStr}`);
  log(`来源: ${SOURCE_URL}`);

  let browser;
  try {
    log('启动 Edge 浏览器...');
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });

    const page = await context.newPage();

    // Step 1: 打开夜读专栏
    log('打开夜读专栏...');
    await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    // Step 2: 获取文章列表并点击第一篇
    log('获取文章列表...');
    // 等待页面渲染完成（页面会跳转到 audiotopic）
    await sleep(2000);

    const items = await page.evaluate(() => {
      const result = [];
      document.querySelectorAll('.item_text').forEach((el, i) => {
        result.push({
          text: el.textContent.trim().substring(0, 150),
          index: i,
        });
      });
      return result;
    });

    log(`找到 ${items.length} 篇文章`);
    items.forEach((a, i) => log(`  [${i}] ${a.text.substring(0, 60)}`));

    if (items.length === 0) {
      log('❌ 未找到任何文章');
      await browser.close();
      process.exit(1);
    }

    // Step 3: 找最新文章（带"小时前"的，通常第一篇就是）
    let targetIndex = 0;
    // 优先找带"小时前"或"分钟前"的（今日文章）
    for (let i = 0; i < items.length; i++) {
      if (items[i].text.includes('小时前') || items[i].text.includes('分钟前')) {
        targetIndex = i;
        break;
      }
    }
    log(`选择第 ${targetIndex + 1} 篇: "${items[targetIndex].text.substring(0, 50)}"`);

    // Step 4: 点击文章打开详情页
    log('点击文章...');
    await page.evaluate((idx) => {
      const el = document.querySelectorAll('.item_text')[idx];
      if (el) el.click();
    }, targetIndex);

    // Step 5: 等待导航到详情页
    await sleep(2000);
    try {
      await page.waitForURL('**/column/**', { timeout: 10000 });
    } catch (e) {
      log('⚠️ 导航等待超时，尝试继续...');
    }
    log(`当前页面: ${page.url()}`);

    // Step 5: 提取正文
    const article = await extractArticle(page);

    if (!article.title && article.paragraphs.length === 0) {
      log('❌ 未提取到文章内容');
      await browser.close();
      process.exit(1);
    }

    // Step 6: 下载图片
    let downloadedNames = await downloadImages(article.images, today, page);

    // Step 7: 生成封面图
    if (downloadedNames.length === 0 && article.paragraphs.length > 0) {
      const generatedImg = await generateCoverImage(article.paragraphs, today, page);
      if (generatedImg) downloadedNames = [generatedImg];
    }

    // Step 8: 生成 Markdown
    const markdownBody = articleToMarkdown(article, today, downloadedNames);

    // Step 9: 写入 Hexo 文章
    const result = writeHexoPost(article, markdownBody, today, downloadedNames);

    // Step 10: Git commit & push
    log('');
    log('========== 提交部署 ==========');
    gitCommitAndPush(article, today);

    log('');
    log(`========== 完成 ==========`);
    log(`文章标题: ${result.cleanTitle}`);
    log(`文件名: ${result.fileName}`);
    log(`图片: ${downloadedNames.length} 张`);

    await browser.close();

  } catch (err) {
    log(`❌ 脚本执行失败: ${err.message}`);
    console.error(err);
    if (browser) { try { await browser.close(); } catch (_) {} }
    process.exit(1);
  }
}

main();
