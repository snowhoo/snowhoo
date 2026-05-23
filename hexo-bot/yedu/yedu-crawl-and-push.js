/**
 * 夜读爬取 + 更新列表 + 发布
 * 流程: 爬取新文章 → 更新 index.html 的脚本列表 → git push
 * 用法: node yedu-crawl-and-push.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// ============ 配置 ============
const ALBUM_URL = 'https://www.peopleapp.com/audiotopic/21622-10000002141';
const OUTPUT_DIR = 'D:\\hexo\\source\\js\\sevencolor\\test1';
const DATA_DIR = path.join(OUTPUT_DIR, 'data');
const IMAGES_DIR = path.join(OUTPUT_DIR, 'images');
const INDEX_HTML = path.join(OUTPUT_DIR, 'index.html');
const HEXO_DIR = 'D:\\hexo';
const sharp = require('sharp');

// ============ 工具函数 ============
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const log = (msg) => {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  console.log(`[${ts}] ${msg}`);
};

// 图片文件名：YYYYMMDD-HHMM-001.ext
function genImageName(pubDate, ext) {
  const [datePart, timePart] = pubDate.split(' ');
  const yyyy = datePart.substring(0, 4);
  const mm = datePart.substring(5, 7);
  const dd = datePart.substring(8, 10);
  const hh = timePart.substring(0, 2);
  const min = timePart.substring(3, 5);
  return `${yyyy}${mm}${dd}-${hh}${min}-001${ext}`;
}

async function downloadImage(imgUrl, pubDate) {
  if (!imgUrl || imgUrl.startsWith('data:')) return null;

  // 统一输出为 webp 格式，高压缩比
  const fileName = genImageName(pubDate, '.webp');
  const localPath = path.join(IMAGES_DIR, fileName);
  const relativePath = `./images/${fileName}`;

  if (fs.existsSync(localPath)) {
    log(`  [跳过] 图片已存在: ${relativePath}`);
    return relativePath;
  }

  return new Promise((resolve) => {
    const file = fs.createWriteStream(localPath + '.tmp');
    const protocol = imgUrl.startsWith('https') ? https : http;
    protocol.get(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', async () => {
          file.close();
          try {
            // 使用 sharp 压缩：宽度800以内，转为webp格式，高压缩比
            const metadata = await sharp(localPath + '.tmp').metadata();
            const w = metadata.width || 0;

            let processor = sharp(localPath + '.tmp');
            if (w > 800) {
              processor = processor.resize(800, null, { withoutEnlargement: true });
            }
            await processor
              .webp({ quality: 60, effort: 4 })
              .toFile(localPath);

            fs.unlinkSync(localPath + '.tmp');
            const stats = fs.statSync(localPath);
            log(`  [下载] ${relativePath} (${(stats.size / 1024).toFixed(1)}KB${w > 800 ? ', resized' : ''})`);
            resolve(relativePath);
          } catch (e) {
            // 压缩失败，尝试删除临时文件
            try { fs.unlinkSync(localPath + '.tmp'); } catch (_) {}
            log(`  [压缩] 失败: ${e.message}`);
            resolve(null);
          }
        });
      } else {
        file.close();
        try { fs.unlinkSync(localPath + '.tmp'); } catch (_) {}
        log(`  [失败] HTTP ${response.statusCode}: ${imgUrl}`);
        resolve(null);
      }
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(localPath + '.tmp'); } catch (_) {}
      log(`  [错误] ${err.message}`);
      resolve(null);
    });
  });
}

function serialize(data, filename) {
  const varName = '__yedu_' + filename.replace(/\.js$/, '').replace(/-/g, '_');
  return 'window.' + varName + ' = ' + JSON.stringify(data, null, 2) + ';';
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

    return { title, pubDate, audioSrc, imgs, summary, paragraphs };
  });
}

// ============ 更新 index.html 中的脚本列表 ============
function updateIndexHtmlList() {
  log('[更新] index.html 脚本列表...');

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.js') && f !== 'article-list.js')
    .sort()
    .reverse();

  // 生成新的 script 标签列表
  const newScriptTags = files.map(f => {
    return `  <script src="./data/${f}"></script>`;
  }).join('\n');

  // 读取现有 index.html
  let html = fs.readFileSync(INDEX_HTML, 'utf-8');

  // 用正则替换 <!-- DATA_FILES_START --> ... <!-- DATA_FILES_END --> 之间的内容
  const startMarker = '<!-- DATA_FILES_START -->';
  const endMarker = '<!-- DATA_FILES_END -->';

  if (html.includes(startMarker) && html.includes(endMarker)) {
    const regex = new RegExp(startMarker + '[\\s\\S]*?' + endMarker);
    html = html.replace(regex, startMarker + '\n' + newScriptTags + '\n' + endMarker);
    log(`  [替换] 找到标记，替换为 ${files.length} 个脚本`);
  } else {
    // 兼容旧格式：替换掉整个 <body> 里的 data 脚本部分
    // 匹配最后一个 </body> 前面的所有 data/*.js 的 script 标签
    const bodyScriptRegex = /(\n\s*<script src="\.\/data\/[^"]+\.js"><\/script>)+/g;
    const match = html.match(bodyScriptRegex);
    if (match) {
      html = html.replace(bodyScriptRegex, '\n' + newScriptTags);
      log(`  [替换] 旧格式，替换为 ${files.length} 个脚本`);
    } else {
      log('  [跳过] 未找到脚本标记且无旧格式内容，可能需要检查 index.html');
    }
  }

  fs.writeFileSync(INDEX_HTML, html, 'utf-8');
  log(`[完成] index.html 已更新`);
}

// ============ Git push ============
function gitPush() {
  log('[Git] 提交并推送...');
  try {
    execSync('git add -A', { cwd: HEXO_DIR });
    const status = execSync('git status --porcelain', { cwd: HEXO_DIR, encoding: 'utf-8' });
    if (!status.trim()) {
      log('[Git] 无变更，跳过提交');
      return;
    }
    const date = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    execSync(`git commit -m "auto: update yedu data ${date}"`, { cwd: HEXO_DIR });
    execSync('git push', { cwd: HEXO_DIR });
    log('[Git] 推送完成');
  } catch (e) {
    log('[Git] 失败: ' + e.message);
    throw e;
  }
}

// ============ 主流程 ============
async function main() {
  log('========== 夜读爬取 + 发布 ==========');

  let browser;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    // 已有文件名集合
    const existingFiles = new Set(
      fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.js') && f !== 'article-list.js')
    );

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
      log(`[详情] ${i + 1}/${listItems.length}: ${item.title}...`);

      const detail = await fetchDetail(page);

      let articleFileName;
      if (detail.pubDate) {
        const [datePart, timePart] = detail.pubDate.split(' ');
        const yyyy = datePart.substring(0, 4);
        const mm = datePart.substring(5, 7);
        const dd = datePart.substring(8, 10);
        const hh = timePart.substring(0, 2);
        const min = timePart.substring(3, 5);
        articleFileName = `${yyyy}${mm}${dd}-${hh}${min}-001.js`;
      } else {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        articleFileName = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-001.js`;
      }

      if (existingFiles.has(articleFileName)) {
        log(`[跳过] ${articleFileName} 已存在，后续均为旧内容`);
        break;
      }

      // 下载封面图
      let localCover = null;
      const validImgs = (detail.imgs || []).filter(img => {
        if (img.w < 400) return false;
        const src = img.src || '';
        if (/logo|icon|avatar|_avatar|show_type\/201808|user_app|cdnpeoplefront.*\/_nuxt\//.test(src)) return false;
        if (src.includes('cdnjdout.aikan.pdnews.cn') && /default|cover|logo|icon/i.test(src)) return false;
        return true;
      });
      if (validImgs.length > 0) {
        const downloaded = await downloadImage(validImgs[0].src, detail.pubDate);
        localCover = downloaded || validImgs[0].src;
      } else {
        localCover = 'images/placeholder.svg';
        log('  [占位] no cover image');
      }

      const article = {
        title: detail.title || item.title,
        timeAgo: item.timeAgo,
        duration: item.duration,
        url: detailUrl,
        pubDate: detail.pubDate || null,
        audioSrc: detail.audioSrc,
        coverSrc: localCover,
        summary: detail.summary,
        paragraphs: detail.paragraphs,
      };

      fs.writeFileSync(path.join(DATA_DIR, articleFileName), serialize(article, articleFileName), 'utf-8');
      log(`  [保存] data/${articleFileName}`);

      existingFiles.add(articleFileName);
      fetchedCount++;
      await sleep(3000);
    }

    await browser.close();

    if (fetchedCount > 0) {
      log(`[完成] 新增 ${fetchedCount} 篇`);
      updateIndexHtmlList();
      gitPush();
    } else {
      log('[完成] 无新内容，跳过发布');
    }

  } catch (err) {
    log(`[错误] ${err.message}`);
    console.error(err);
    if (browser) { try { await browser.close(); } catch (_) {} }
    process.exit(1);
  }
}

main();
