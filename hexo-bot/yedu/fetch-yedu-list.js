/**
 * 人民朗读专辑爬虫
 * 增量抓取：比对 URL，已存在则跳过
 * 文章分单文件存储，索引极简（只存 pubDate + filename）
 * 输出 .js 文件（ES Module），支持 file:// 直接访问
 * 用法: node fetch-yedu-list.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ============ 配置 ============
const ALBUM_URL = 'https://www.peopleapp.com/audiotopic/21622-10000002141';
const OUTPUT_DIR = 'D:\\hexo\\source\\yedu';
const DATA_DIR = path.join(OUTPUT_DIR, 'data');
const ARTICLE_LIST_FILE = path.join(DATA_DIR, 'article-list.js');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');

// ============ 工具函数 ============
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const log = (msg) => {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${ts}] ${msg}`);
};

function genImageName(ext) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}${ext || '.jpg'}`;
}

async function downloadImage(imgUrl) {
  if (!imgUrl || imgUrl.startsWith('data:')) return null;
  const ext = path.extname(imgUrl.split('?')[0]) || '.jpg';
  const fileName = genImageName(ext);
  const localPath = path.join(IMAGES_DIR, fileName);
  const relativePath = `images/${fileName}`;

  if (fs.existsSync(localPath)) {
    log(`  [跳过] 图片已存在: ${relativePath}`);
    return relativePath;
  }

  return new Promise((resolve) => {
    const file = fs.createWriteStream(localPath);
    const protocol = imgUrl.startsWith('https') ? https : http;
    protocol.get(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => { file.close(); log(`  [下载] ${relativePath}`); resolve(relativePath); });
      } else {
        file.close();
        log(`  [失败] HTTP ${response.statusCode}: ${imgUrl}`);
        resolve(null);
      }
    }).on('error', (err) => { file.close(); log(`  [错误] ${err.message}`); resolve(null); });
  });
}

// 序列化 JS 值（用于输出 .js 文件）
function serialize(data) {
  return 'export default ' + JSON.stringify(data, null, 2) + ';';
}

// ============ 抓取列表页 ============
async function fetchList(page) {
  await page.goto(ALBUM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  return page.evaluate(() => {
    const result = [];
    document.querySelectorAll('.item_text').forEach((el) => {
      const text = el.textContent.trim();
      const timeMatch = text.match(/(\d+天前|\d+小时前|\d+分钟前)(\d{2}:\d{2})?$/);
      const durationMatch = text.match(/(\d{2}:\d{2})$/);
      let title = text, timeAgo = '', duration = '';
      if (durationMatch) { duration = durationMatch[1]; title = title.replace(durationMatch[0], '').trim(); }
      if (timeMatch) { timeAgo = timeMatch[1]; title = title.replace(timeMatch[0], '').trim(); }
      title = title.replace(/^\d+/, '').trim();
      result.push({ title, timeAgo, duration });
    });
    return result;
  });
}

// ============ 抓取详情页 ============
async function fetchDetail(page) {
  await sleep(3000);

  return page.evaluate(() => {
    const title = document.querySelector('h1')?.textContent?.trim()
      || document.querySelector('[class*=title]')?.textContent?.trim()
      || document.title.replace(/_人民日报$/, '').replace(/人民朗读/, '').trim();

    // 提取详情页真实发布日期（格式：2026-05-15 21:49）
    let pubDate = '';
    const spanEl = document.querySelector('span.shrink-0');
    if (spanEl) {
      const txt = spanEl.textContent.trim();
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(txt)) {
        pubDate = txt;
      }
    }

    const audioSrc = document.querySelector('audio')?.src || '';

    const imgs = [];
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('data-src') || img.src || '';
      if (!src || src.includes('data:') || /logo|icon|audioBg/.test(src)) return;
      const w = img.naturalWidth || parseInt(img.getAttribute('width') || '0');
      if (w >= 400) imgs.push({ src, w });
    });
    const coverSrc = imgs[0]?.src || '';

    const allText = document.body.innerText;
    const sentences = allText.split(/[。！？\n]/).filter(s => s.trim().length > 20);
    const summary = sentences.slice(0, 3).join('。').substring(0, 150) + '...';

    const paragraphs = [];
    document.querySelectorAll('p, .text, [class*=text]').forEach(el => {
      const t = el.textContent.trim();
      if (t.length > 20 && !/人民日报|App Store|打开客户端|京ICP备|版权|来源:/.test(t)) {
        paragraphs.push(t);
      }
    });

    return { title, pubDate, audioSrc, coverSrc, summary, paragraphs, allImages: imgs };
  });
}

// ============ 读索引 [{pubDate, filename}] ============
function loadIndex() {
  if (fs.existsSync(ARTICLE_LIST_FILE)) {
    try {
      // .js 文件格式：export default [...];
      const raw = fs.readFileSync(ARTICLE_LIST_FILE, 'utf-8');
      const match = raw.match(/^export\s+default\s+(\[[\s\S]*\]);?\s*$/);
      if (match) {
        return JSON.parse(match[1]);
      }
    } catch (e) {
      log(`[数据] 读取索引失败: ${e.message}`);
    }
  }
  return [];
}

// ============ 写索引（JS 格式） ============
function saveIndex(index) {
  fs.writeFileSync(ARTICLE_LIST_FILE, serialize(index), 'utf-8');
}

// ============ 主流程 ============
async function main() {
  log('========== 人民朗读专辑爬虫 ==========');

  let browser;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    const index = loadIndex();
    const existingUrls = new Set();

    index.forEach(item => {
      if (item.url) existingUrls.add(item.url);
      if (item._url) existingUrls.add(item._url);
    });

    log('[启动] 浏览器...');
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN',
    });
    const page = await context.newPage();
    log('[就绪] 浏览器已启动');

    log('[抓取] 访问列表页...');
    const listItems = await fetchList(page);
    log(`[抓取] 找到 ${listItems.length} 条`);

    let fetchedCount = 0;

    for (let i = 0; i < listItems.length; i++) {
      const item = listItems[i];

      if (i > 0) {
        await page.goto(ALBUM_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(1500);
      }
      await page.evaluate((idx) => {
        const items = document.querySelectorAll('.item_text');
        if (items[idx]) items[idx].click();
      }, i);
      await sleep(2000);

      const detailUrl = page.url();

      if (existingUrls.has(detailUrl)) {
        log(`[跳过] 第 ${i + 1} 条已存在，后续均为旧内容`);
        break;
      }

      log(`[详情] ${i + 1}/${listItems.length}: ${item.title}...`);

      const detail = await fetchDetail(page);

      // 文件名：20260515-2149-001.js  （pubDate 时间戳 + 当天序号）
      let articleFileName;
      if (detail.pubDate) {
        const [datePart, timePart] = detail.pubDate.split(' ');
        const yyyy = datePart.substring(0, 4);
        const mm = datePart.substring(5, 7);
        const dd = datePart.substring(8, 10);
        const hh = timePart.substring(0, 2);
        const min = timePart.substring(3, 5);
        const datePrefix = `${yyyy}${mm}${dd}`;
        const sameDayCount = index.filter(entry => entry.pubDate && entry.pubDate.startsWith(datePrefix)).length;
        const dailySeq = String(sameDayCount + 1).padStart(3, '0');
        articleFileName = `${datePrefix}-${hh}${min}-${dailySeq}.js`;
      } else {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
        const articleId = index.length + fetchedCount + 1;
        const dailySeq = String(articleId).padStart(3, '0');
        articleFileName = `${dateStr}-${dailySeq}.js`;
      }

      // 下载封面图
      let localCover = null;
      if (detail.allImages && detail.allImages.length > 0) {
        const valid = detail.allImages.filter(img =>
          img.w >= 400 && !/logo|icon|avatar|show_type\/201808|user_app|cdnpeoplefront.*\/_nuxt\//.test(img.src)
        );
        if (valid.length > 0) {
          localCover = await downloadImage(valid[0].src);
        }
      }

      // 写单文章 JS（ES Module）
      const article = {
        title: detail.title || item.title,
        timeAgo: item.timeAgo,
        duration: item.duration,
        url: detailUrl,
        pubDate: detail.pubDate || null,
        audioSrc: detail.audioSrc,
        coverSrc: localCover || detail.coverSrc,
        summary: detail.summary,
        paragraphs: detail.paragraphs,
      };

      const articlePath = path.join(DATA_DIR, articleFileName);
      fs.writeFileSync(articlePath, serialize(article), 'utf-8');
      log(`  [保存] data/${articleFileName}`);

      // 更新索引
      index.unshift({ pubDate: detail.pubDate || null, filename: articleFileName });
      saveIndex(index);

      fetchedCount++;
      await sleep(3000);
    }

    await browser.close();

    if (fetchedCount > 0) {
      log(`[完成] 新增 ${fetchedCount} 篇，索引已更新`);
    } else {
      log('[完成] 无新内容');
    }

  } catch (err) {
    log(`[错误] ${err.message}`);
    console.error(err);
    if (browser) { try { await browser.close(); } catch (_) {} }
    process.exit(1);
  }
}

main();
