/**
 * 人民日报夜读抓取脚本
 * 用法: node fetch-yedu.js
 * 
 * 流程:
 * 1. 通过 Playwright + Edge 打开搜狗微信搜索
 * 2. 搜索"人民日报夜读"，找到今日文章
 * 3. 提取标题和正文
 * 4. 生成 Hexo 博文到 source/_posts/
 * 5. Git add/commit/push 触发 GitHub Actions 部署
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============ 配置 ============
const HEXO_ROOT = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_ROOT, 'source', '_posts');
const COVER_DIR = path.join(HEXO_ROOT, 'source', 'images', 'yedu');
const GIT_BRANCH = 'source';
const HIGHLIGHT_COLORS = ['#e74c3c', '#e67e22', '#27ae60', '#2980b9', '#8e44ad', '#16a085'];

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

// ============ 核心：搜狗微信搜索 + 文章抓取 ============
async function searchWechatArticles(page, keyword) {
  log(`搜索关键词: "${keyword}"`);

  // 直接用 URL 参数搜索（最可靠的方式）
  const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}&ie=utf8`;
  log(`搜索URL: ${searchUrl}`);
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 检查是否被反爬拦截
  const pageTitle = await page.title();
  log(`页面标题: ${pageTitle}`);

  // 截图用于调试
  await page.screenshot({ path: 'D:/hexo/scripts/rmrb-yedu/debug-search.png', fullPage: false });

  // 解析搜索结果
  const articles = await page.evaluate(() => {
    const items = [];
    // 搜狗微信搜索结果 - 尝试多种选择器
    let listItems = document.querySelectorAll('.news-list2 li');
    if (listItems.length === 0) {
      listItems = document.querySelectorAll('.news-list li');
    }
    if (listItems.length === 0) {
      // 新版搜狗微信可能用不同的结构
      listItems = document.querySelectorAll('.wx-rb .news-list2 li, ul.news-list2 li, .results .item');
    }
    if (listItems.length === 0) {
      // 通用：找所有包含链接的列表项
      const allLinks = document.querySelectorAll('a[href*="mp.weixin.qq.com"]');
      allLinks.forEach(a => {
        const parent = a.closest('li') || a.parentElement;
        const dateEl = parent ? (parent.querySelector('.s2, time, [class*="date"], [class*="time"]') || parent) : null;
        items.push({
          title: a.textContent.trim().substring(0, 100),
          url: a.href,
          date: dateEl ? dateEl.textContent.trim() : '',
          account: '',
          description: '',
        });
      });
      return items;
    }
    listItems.forEach(li => {
      const titleEl = li.querySelector('.txt-box h3 a');
      const accountEl = li.querySelector('.s-p a, .account');
      const dateEl = li.querySelector('.s2');
      const linkEl = li.querySelector('.txt-box h3 a');
      const descEl = li.querySelector('.txt-info');

      if (titleEl && linkEl) {
        items.push({
          title: titleEl.textContent.trim(),
          url: linkEl.href,
          account: accountEl ? accountEl.textContent.trim() : '',
          date: dateEl ? dateEl.textContent.trim() : '',
          description: descEl ? descEl.textContent.trim() : '',
        });
      }
    });
    return items;
  });

  log(`找到 ${articles.length} 个搜索结果`);
  // 调试：打印每个结果的日期
  articles.forEach((a, i) => {
    log(`  [${i}] ${a.account} | ${a.date} | ${a.title.substring(0, 40)}`);
  });
  return articles;
}

async function fetchArticleContent(page, articleUrl) {
  log(`抓取文章内容: ${articleUrl}`);
  await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 微信文章正文在 #js_content 中
  const article = await page.evaluate(() => {
    const contentEl = document.querySelector('#js_content');
    const titleEl = document.querySelector('#activity-name');
    const authorEl = document.querySelector('#js_name');
    const dateEl = document.querySelector('#publish_time');

    if (!contentEl) {
      return { title: '', author: '', date: '', paragraphs: [], images: [], error: '未找到文章内容' };
    }

    const title = titleEl ? titleEl.textContent.trim() : '';
    const author = authorEl ? authorEl.textContent.trim() : '';
    const date = dateEl ? dateEl.textContent.trim() : '';
    const paragraphs = [];
    const images = [];
    const seenTexts = new Set();

    // 递归遍历节点，按文档顺序提取文本和图片
    function walk(node, depth = 0) {
      if (depth > 30) return; // 防止过深
      
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text && text.length > 1 && !seenTexts.has(text.substring(0, 40))) {
          seenTexts.add(text.substring(0, 40));
          paragraphs.push({ type: 'text', content: text });
        }
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        const style = (node.getAttribute('style') || '').toLowerCase();
        
        // 跳过隐藏元素
        if (style.includes('display:none') || style.includes('visibility:hidden') || 
            style.includes('opacity:0') || node.hidden) {
          return;
        }

        // 跳过视频、音频、iframe、脚本、样式
        if (['video', 'audio', 'iframe', 'script', 'style', 'noscript', 'br', 'hr'].includes(tag)) {
          return;
        }

        // 图片处理
        if (tag === 'img') {
          const src = node.getAttribute('data-src') || node.src || '';
          if (src && !src.includes('icon') && !src.includes('emoji') && !src.includes('avatar') && !src.includes('logo')) {
            const w = parseInt(node.getAttribute('data-w') || node.getAttribute('width') || '0');
            const h = parseInt(node.getAttribute('data-h') || node.getAttribute('height') || '0');
            // 过滤小图标
            if ((w === 0 && h === 0) || (w >= 200 || h >= 200)) {
              images.push(src);
              paragraphs.push({ type: 'image', src: src });
            }
          }
          return;
        }

        // 检查元素内是否只有一张大图（带图注）
        const directImgs = node.querySelectorAll(':scope > img');
        if (directImgs.length === 1) {
          const img = directImgs[0];
          const imgSrc = img.getAttribute('data-src') || img.src || '';
          const dataW = parseInt(img.getAttribute('data-w') || '200');
          if (imgSrc && dataW >= 200 && !imgSrc.includes('emoji') && !imgSrc.includes('icon')) {
            images.push(imgSrc);
            paragraphs.push({ type: 'image', src: imgSrc });
            return;
          }
        }

        // 递归处理子节点
        for (const child of node.childNodes) {
          walk(child, depth + 1);
        }
      }
    }

    walk(contentEl);

    return { title, author, date, paragraphs, images };
  });

  log(`  标题: ${article.title}`);
  log(`  作者: ${article.author}`);
  log(`  时间: ${article.date}`);
  log(`  段落数: ${article.paragraphs.length}, 图片数: ${article.images.length}`);

  return article;
}

// ============ Markdown 生成 ============
function articleToMarkdown(article, today) {
  const { paragraphs, images } = article;

  // 过滤和合并段落
  const mergedParagraphs = [];
  let currentText = '';

  for (const p of paragraphs) {
    if (p.type === 'text') {
      const c = p.content;
      // 跳过太短或明显无关的内容（如"人民日报"标识行、操作提示等）
      if (c === '人民日报' || c === '关注' || c === '分享' || c === '收藏' ||
          c.includes('关注我们') || c.includes('设为星标') || c.includes('微信公众号') ||
          c.includes('点击上方') || c.includes('版权归原作者') || c.includes('转载请联系') ||
          c.includes('来源：') && c.length < 20 ||
          c.includes('ID：') && c.length < 30) {
        continue;
      }

      if (currentText.length > 0 && !currentText.endsWith('\n')) {
        currentText += '\n\n';
      }
      currentText += c;
    } else if (p.type === 'image') {
      if (currentText.trim()) {
        mergedParagraphs.push({ type: 'text', content: currentText.trim() });
        currentText = '';
      }
      mergedParagraphs.push({ type: 'image', src: p.src });
    }
  }
  if (currentText.trim()) {
    mergedParagraphs.push({ type: 'text', content: currentText.trim() });
  }

  // 生成 Markdown 正文
  let markdownBody = '';
  let imgIndex = 0;

  for (const p of mergedParagraphs) {
    if (p.type === 'text') {
      // 处理文本：高亮每段首句
      const sentences = p.content.split('\n').filter(s => s.trim());
      for (let i = 0; i < sentences.length; i++) {
        let s = sentences[i].trim();
        if (s.length === 0) continue;
        
        // 处理序号开头的段落
        if (/^[0-9０-９]+[\.\、\．]/.test(s) || /^[第][一二三四五六七八九十]+/.test(s)) {
          markdownBody += `\n### ${s}\n\n`;
        } else if (i === 0 && !s.startsWith('>') && !s.startsWith('「') && !s.startsWith('【')) {
          // 第一句加粗
          markdownBody += `**${s}**\n\n`;
        } else {
          markdownBody += `${s}\n\n`;
        }
      }
    } else if (p.type === 'image') {
      imgIndex++;
      const imgName = `${today.dateStr}_yedu_${String(imgIndex).padStart(2, '0')}.jpg`;
      markdownBody += `\n![人民日报夜读配图](/images/yedu/${imgName})\n\n`;
    }
  }

  // 清理末尾空行
  markdownBody = markdownBody.replace(/\n{3,}$/, '\n');

  // 添加来源说明
  const sourceTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  markdownBody += `\n> 来源：人民日报微信公众号 | 采集时间：${sourceTime}\n`;

  return { markdownBody, images, mergedParagraphs };
}

// ============ 下载图片 ============
async function downloadImages(images, today, page) {
  if (!fs.existsSync(COVER_DIR)) {
    fs.mkdirSync(COVER_DIR, { recursive: true });
  }

  const downloaded = [];

  for (let i = 0; i < images.length && downloaded.length < 5; i++) {
    const imgName = `${today.dateStr}_yedu_${String(downloaded.length + 1).padStart(2, '0')}.jpg`;
    const imgPath = path.join(COVER_DIR, imgName);

    try {
      // 使用页面上下文下载（可以带 cookie/referrer）
      const imgBase64 = await page.evaluate(async (src) => {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return null;
        }
      }, images[i]);

      if (imgBase64 && imgBase64.startsWith('data:image')) {
        const base64Data = imgBase64.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
        downloaded.push(imgName);
        log(`  图片已下载: ${imgName}`);
      }
    } catch (err) {
      log(`  ⚠️ 图片下载失败: ${err.message}`);
    }
  }

  return downloaded;
}

// ============ 生成 Hexo 文章文件 ============
function writeHexoPost(article, markdownBody, today, downloadedNames) {
  if (!fs.existsSync(POSTS_DIR)) {
    fs.mkdirSync(POSTS_DIR, { recursive: true });
  }

  // 清理标题，移除可能的前缀标记
  let cleanTitle = article.title
    .replace(/^【夜读】/, '')
    .replace(/^夜读[丨\|\/]/, '')
    .replace(/^夜读\s*/, '')
    .trim();

  if (!cleanTitle) {
    cleanTitle = `人民日报夜读 - ${today.fullDateStr}`;
  }

  // 封面图：优先第一张下载的图，否则默认
  const cover = downloadedNames.length > 0
    ? `/images/yedu/${downloadedNames[0]}`
    : '/images/yedu/yedu-default.svg';

  const timeStr = `22:00:00`;
  const dateTimeStr = `${today.year}-${today.month}-${today.day} ${timeStr}`;

  const frontMatter = `---
title: ${cleanTitle}
date: ${dateTimeStr}
updated: ${dateTimeStr}
categories:
  - 夜读
tags:
  - 夜读
  - 美文
  - 晚安
cover: ${cover}
toc: true
---

> 🏮 **夜读** | ${today.fullDateStr}

${markdownBody}

---

📮 本文内容来源于微信公众号每日夜读栏目，版权归原作者所有。

🌙 晚安，好梦。
`;

  const fileName = `${today.dateStr}_rmrb-yedu.md`;
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

    const commitMsg = `[夜读] ${article.title || `夜读 ${today.fullDateStr}`}`;
    log(`Git commit: "${commitMsg}"`);
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd, encoding: 'utf-8', timeout: 30000 });

    log(`Git push to ${GIT_BRANCH}...`);
    execSync(`git push origin ${GIT_BRANCH}`, { cwd, encoding: 'utf-8', timeout: 60000 });

    log('✅ Git push 成功！GitHub Actions 将自动部署。');
    return true;
  } catch (err) {
    // 可能是 "nothing to commit" 或 push 被拒绝
    const msg = (err.stderr || err.stdout || err.message || '');
    if (msg.includes('nothing to commit') || msg.includes('nothing added')) {
      log('ℹ️ 没有新的变更需要提交（可能今天已经抓取过）');
      return false;
    }
    log(`❌ Git 操作失败: ${msg}`);
    throw err;
  }
}

// ============ 判断是否为当天的文章 ============
function isTodayArticle(article, today) {
  // 搜狗显示的日期格式可能是 "2小时前"、"昨天"、"4月28日" 等
  const dateStr = article.date || '';
  
  // 检查日期字符串是否包含今天的日期
  const todayMD = `${parseInt(today.month)}月${parseInt(today.day)}日`;
  const todayMD2 = `${today.month}月${today.day}日`;

  if (dateStr.includes(todayMD) || dateStr.includes(todayMD2)) {
    return true;
  }

  // "今天"、小时前、分钟前
  if (dateStr.includes('小时前') || dateStr.includes('分钟前') || dateStr.includes('刚刚') || dateStr.includes('今天')) {
    return true;
  }

  // "昨天"只在日期覆盖模式下匹配（覆盖的日期正好比当前日期早1天）
  if (dateStr.includes('昨天') && process.argv.includes('--date')) {
    return true;
  }

  // 标题可能包含日期信息
  const title = article.title || '';
  if (title.includes(today.dateStr) || title.includes(`${today.month}${today.day}`)) {
    return true;
  }

  return false;
}

// ============ 主流程 ============
// 解析命令行参数中的日期覆盖
function parseDateOverride() {
  const dateIdx = process.argv.indexOf('--date');
  if (dateIdx >= 0 && dateIdx + 1 < process.argv.length) {
    return process.argv[dateIdx + 1];
  }
  return null;
}

async function main() {
  const dateOverride = parseDateOverride();
  const today = getToday(dateOverride);
  if (dateOverride) {
    log(`[覆盖模式] 使用指定日期: ${today.fullDateStr}`);
  }

  // 检查今天是否已经抓取过（避免定时重试重复发文）
  const postPattern = `${today.year}${today.month}${today.day}_rmrb-yedu`;
  if (fs.readdirSync(POSTS_DIR).some(f => f.includes(postPattern))) {
    log(`✅ 今日文章已存在（匹配 ${postPattern}），跳过`);
    process.exit(0);
  }

  log(`========== 人民日报夜读抓取 ==========`);
  log(`日期: ${today.fullDateStr}`);

  let browser;
  try {
    // 启动 Edge 浏览器
    log('启动 Edge 浏览器...');
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });

    const page = await context.newPage();

    // Step 1: 搜狗微信搜索
    const articles = await searchWechatArticles(page, '人民日报夜读');
    
    if (articles.length === 0) {
      log('❌ 未找到任何搜索结果');
      await browser.close();
      process.exit(1);
    }

    // Step 2: 筛选人民日报官方账号的今日文章
    let targetArticle = null;
    
    // 优先找"人民日报"官方账号的当天文章
    for (const a of articles) {
      const isOfficial = a.account.includes('人民日报') && !a.account.includes('人民夜读') && !a.account.includes('人民日报夜读') &&
        (a.account === '人民日报' || a.account.includes('rmrb') || a.url.includes('rmrb'));
      const isFromOfficial = a.account === '人民日报' || a.url.includes('__biz=') && a.url.toLowerCase().includes('rmrb');
      const isToday = isTodayArticle(a, today);

      if ((isOfficial || isFromOfficial) && isToday) {
        targetArticle = a;
        log(`✅ 找到人民日报官微今日文章: "${a.title}"`);
        break;
      }
    }

    // 如果没找到官方账号的，退一步找任意包含"夜读"的当天文章
    if (!targetArticle) {
      for (const a of articles) {
        const isNightRead = a.title.includes('夜读') || a.title.includes('【夜读】');
        const isToday = isTodayArticle(a, today);
        if (isNightRead && isToday) {
          targetArticle = a;
          log(`⚠️ 未找到人民日报官微，使用替代来源: "${a.account}" - "${a.title}"`);
          break;
        }
      }
    }

    // 找不到今天的就退出，不取旧文章
    if (!targetArticle) {
      log('❌ 搜狗搜索结果中未找到今天的夜读文章');
      log('ℹ️ 夜读通常 21:00-22:00 发布，搜狗索引可能有 1-2 小时延迟');
      await browser.close();
      process.exit(0);
    }

    // Step 3: 抓取文章正文
    const article = await fetchArticleContent(page, targetArticle.url);

    if (article.error) {
      log(`❌ 抓取失败: ${article.error}`);
      await browser.close();
      process.exit(1);
    }

    // 二次确认日期
    const articleDateMatch = article.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (articleDateMatch) {
      const artDateStr = `${articleDateMatch[1]}${String(parseInt(articleDateMatch[2])).padStart(2,'0')}${String(parseInt(articleDateMatch[3])).padStart(2,'0')}`;
      if (artDateStr !== today.dateStr) {
        log(`❌ 二次确认失败：文章日期 ${artDateStr} ≠ 今天 ${today.dateStr}，跳过`);
        await browser.close();
        process.exit(0);
      }
    }

    // Step 4: 下载图片
    const downloadedNames = await downloadImages(article.images, today, page);

    // Step 5: 生成 Markdown
    const { markdownBody } = articleToMarkdown(article, today);

    // Step 6: 写入 Hexo 文章
    const result = writeHexoPost(article, markdownBody, today, downloadedNames);

    // Step 7: Git commit & push
    log('');
    log('========== 提交部署 ==========');
    gitCommitAndPush(article, today);

    log('');
    log(`========== 完成 ==========`);
    log(`文章标题: ${result.cleanTitle}`);
    log(`文件名: ${result.fileName}`);
    log(`图片: ${downloadedNames.length} 张`);
    log(`预计几分钟后上线到 https://snowhoo.net`);

    await browser.close();

  } catch (err) {
    log(`❌ 脚本执行失败: ${err.message}`);
    console.error(err);
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    process.exit(1);
  }
}

main();
