/**
 * 宝盒接口.top 影片遍历脚本
 * 遍历每个子源，抓取具体影片数据
 * 支持 Type:0(XML RSS) 和 Type:1(JSON) 两种格式
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const xml2js = require('xml2js');

const DATA_DIR = 'D:/hexo/baobei_data';
const OUT_DIR = 'D:/hexo/baobei_data/crawled';
const sites = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sites.json'), 'utf8'));

// ====== 网络请求 ======
function fetch(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Android 11; Mobile; rv:89.0) Gecko/89.0 Firefox/89.0',
        'Referer': u.origin + '/'
      },
      rejectUnauthorized: false
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', e => reject(new Error(`网络错误: ${e.message}`)));
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('请求超时')); });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ====== 搜索影片 ======
async function searchSite(site, keyword = '流浪地球') {
  const apiBase = site.api;
  if (!apiBase || apiBase.startsWith('csp_')) return null; // Skip app-type APIs

  const urls = [
    `${apiBase}/search?wd=${encodeURIComponent(keyword)}`,
    `${apiBase}/search?keyword=${encodeURIComponent(keyword)}`,
    `${apiBase}?wd=${encodeURIComponent(keyword)}`,
    `${apiBase}?kw=${encodeURIComponent(keyword)}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, 6000);
      if (r.status !== 200) continue;
      if (r.body.includes('<!DOCTYPE') || r.body.includes('<html>')) continue;
      if (r.body.length < 30) continue;
      return { url, body: r.body, contentType: r.contentType };
    } catch(e) {}
  }
  return null;
}

// ====== 解析 XML RSS 格式 ======
function parseXML(body) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(body, { explicitArray: false, ignoreAttrs: true }, (err, result) => {
      if (err) { reject(err); return; }
      resolve(result);
    });
  });
}

async function parseVideosFromXML(body, siteName) {
  try {
    const doc = await parseXML(body);
    const list = doc.rss?.list;
    if (!list) return [];
    const items = list.video || (Array.isArray(list) ? [] : []);
    const arr = Array.isArray(items) ? items : [items];
    return arr.map(v => ({
      id: v.id,
      name: v.name?._ || v.name || '',
      tid: v.tid,
      type: v.type,
      note: v.note || '',
      pic: v.pic || '',
      actor: v.actor || '',
      director: v.director || '',
      content: v.des || '',
      pubDate: v.last || ''
    }));
  } catch(e) { return []; }
}

// ====== 解析 JSON 格式 ======
function parseJSON(body) {
  try {
    const j = JSON.parse(body);
    const list = j.list || [];
    return Array.isArray(list) ? list : [list];
  } catch(e) { return []; }
}

// ====== 抓取单个站点 ======
async function crawlSite(site, keyword) {
  const result = await searchSite(site, keyword);
  if (!result) return null;

  const isXML = result.body.startsWith('<?xml') || result.body.includes('<rss');
  let videos = [];

  if (isXML) {
    videos = await parseVideosFromXML(result.body, site.key);
  } else {
    videos = parseJSON(result.body);
    // Normalize JSON fields
    videos = videos.map(v => ({
      id: v.vod_id || v.id,
      name: v.vod_name || v.name || '',
      type: v.type_name || v.type || '',
      tid: v.type_id || v.tid,
      note: v.vod_note || v.note || '',
      pic: v.vod_pic || v.pic || '',
      actor: v.vod_actor || v.actor || '',
      director: v.vod_director || v.director || '',
      content: v.vod_content || v.content || '',
      pubDate: v.vod_time || v.last || ''
    }));
  }

  return {
    siteKey: site.key,
    siteName: site.name,
    api: site.api,
    searchUrl: result.url,
    keyword,
    videoCount: videos.length,
    videos
  };
}

// ====== 遍历全部可抓取站点 ======
async function main() {
  const keyword = process.argv[2] || '流浪地球';
  console.log(`搜索关键字: "${keyword}"\n`);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 分类站点
  const crawlable = sites.filter(s => s.api && !s.api.startsWith('csp_'));
  const appType = sites.filter(s => s.api?.startsWith('csp_') || (!s.api));

  console.log(`可遍历站点: ${crawlable.length} 个`);
  console.log(`App类站点(无法遍历): ${appType.length} 个`);
  console.log('');

  const results = [];
  for (let i = 0; i < crawlable.length; i++) {
    const site = crawlable[i];
    process.stdout.write(`[${i + 1}/${crawlable.length}] ${site.key}... `);

    try {
      const data = await crawlSite(site, keyword);
      if (data && data.videos.length > 0) {
        const safeName = site.key.replace(/[\\/:*?"<>|]/g, '_');
        const fp = path.join(OUT_DIR, `${safeName}.json`);
        fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
        process.stdout.write(`✅ ${data.videos.length} 部影片\n`);
        results.push({ key: site.key, name: site.name, count: data.videos.length, file: fp });
      } else {
        process.stdout.write(`⚠️  无数据或格式不支持\n`);
      }
    } catch(e) {
      process.stdout.write(`❌ ${e.message}\n`);
    }

    await delay(300);
  }

  // 保存汇总报告
  const report = {
    keyword,
    crawlTime: new Date().toISOString(),
    totalCrawlable: crawlable.length,
    successCount: results.length,
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, 'crawl_report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n========== 抓取完成 ==========`);
  console.log(`关键字: "${keyword}"`);
  console.log(`成功: ${results.length}/${crawlable.length} 个站点`);
  results.forEach(r => console.log(`  ✅ ${r.key}: ${r.count} 部`));
  console.log(`\n结果目录: ${OUT_DIR}`);
}

main().catch(console.error);
