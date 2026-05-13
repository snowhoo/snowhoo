/**
 * 宝盒接口.top 数据抓取脚本
 * 功能：自动抓取主配置，并为每个子源生成独立 JSON 文件
 * 输出目录：D:\hexo\baobei_data\
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ====== 配置 ======
const BAOBEI_URL = 'https://xn--6orr3pi6g9uu.top/禁止贩卖/bhvip.json';
const OUT_DIR = 'D:/hexo/baobei_data';

// 延迟函数（避免请求过快）
const delay = ms => new Promise(r => setTimeout(r, ms));

// ====== 网络请求 ======
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = https.get({
        hostname: u.hostname,
        path: u.pathname,
        headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers },
        rejectUnauthorized: false
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      });
      req.on('error', e => reject(new Error(`网络错误: ${e.message}`)));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')); });
    } catch(e) { reject(e); }
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const req = http.get({
        hostname: u.hostname,
        path: u.pathname,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', e => reject(new Error(`网络错误: ${e.message}`)));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时')); });
    } catch(e) { reject(e); }
  });
}

// ====== 清理非法文件名字符 ======
function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

// ====== 保存 JSON 文件 ======
function saveJson(dir, filename, data) {
  const fp = path.join(dir, sanitize(filename));
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  return fp;
}

// ====== 进度显示 ======
function log(msg) {
  const now = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${now}] ${msg}`);
}

// ====== 主程序 ======
async function main() {
  log('开始抓取宝盒接口数据...');

  // 1. 创建输出目录
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    log(`已创建目录: ${OUT_DIR}`);
  }

  // 2. 获取主配置
  let raw;
  try {
    log(`正在获取主配置: ${BAOBEI_URL}`);
    raw = await httpsGet(BAOBEI_URL);
    log(`主配置获取成功 (${raw.body.length} 字节)`);
  } catch(e) {
    log(`❌ 主配置获取失败: ${e.message}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(raw.body);
  } catch(e) {
    log(`❌ JSON 解析失败: ${e.message}`);
    process.exit(1);
  }

  // 3. 保存完整配置
  const fullPath = saveJson(OUT_DIR, 'full_config.json', config);
  log(`✅ 已保存: full_config.json`);

  // 4. 分类保存顶级配置项
  const topLevelCategories = ['lives', 'parses', 'flags', 'rules', 'ijk', 'ads'];
  for (const cat of topLevelCategories) {
    if (config[cat]) {
      const fp = saveJson(OUT_DIR, `${cat}.json`, config[cat]);
      const count = Array.isArray(config[cat]) ? config[cat].length : 'object';
      log(`✅ 已保存: ${cat}.json (${count} 项)`);
    }
  }

  // 5. 保存 spider 信息
  if (config.spider) {
    const fp = path.join(OUT_DIR, 'spider_url.txt');
    fs.writeFileSync(fp, config.spider, 'utf8');
    log(`✅ 已保存: spider_url.txt`);
  }

  // 6. 保存 wallpaper 和 logo
  if (config.wallpaper) {
    const fp = path.join(OUT_DIR, 'wallpaper.txt');
    fs.writeFileSync(fp, config.wallpaper, 'utf8');
    log(`✅ 已保存: wallpaper.txt`);
  }
  if (config.logo) {
    const fp = path.join(OUT_DIR, 'logo.txt');
    fs.writeFileSync(fp, config.logo, 'utf8');
    log(`✅ 已保存: logo.txt`);
  }

  // 7. 为每个子源(sites)生成独立 JSON
  if (config.sites && Array.isArray(config.sites)) {
    const sitesDir = path.join(OUT_DIR, 'sites');
    if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });

    log(`\n开始处理 ${config.sites.length} 个子源站点...`);
    const results = { success: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < config.sites.length; i++) {
      const site = config.sites[i];
      const safeName = sanitize(site.key || `site_${i}`);
      const siteFile = path.join(sitesDir, `${safeName}.json`);

      // 构造站点的详细信息对象
      const siteData = {
        index: i + 1,
        key: site.key,
        name: site.name,
        type: site.type,
        api: site.api,
        searchable: site.searchable,
        changeable: site.changeable,
        // 附加信息
        hasJar: !!(site.jar),
        hasExt: !!(site.ext),
        jar: site.jar || null,
        ext: site.ext || null
      };

      try {
        saveJson(sitesDir, `${safeName}.json`, siteData);
        results.success++;
        const flag = siteData.hasExt ? '📡' : '📦';
        log(`  ${flag} [${i + 1}/${config.sites.length}] ${safeName} (type:${site.type})`);
      } catch(e) {
        results.failed++;
        log(`  ❌ [${i + 1}] ${safeName} 保存失败: ${e.message}`);
      }

      // 避免请求过快
      if (i < config.sites.length - 1) await delay(50);
    }

    log(`\n站点处理完成: ✅${results.success} 失败:${results.failed} 跳过:${results.skipped}`);
  }

  // 8. 生成报告文件
  const report = {
    fetchTime: new Date().toISOString(),
    sourceUrl: BAOBEI_URL,
    stats: {
      sites: config.sites?.length || 0,
      parses: config.parses?.length || 0,
      lives: config.lives?.length || 0,
      flags: config.flags?.length || 0,
      rules: config.rules?.length || 0
    },
    siteTypes: {}
  };

  // 统计站点类型
  if (config.sites) {
    for (const s of config.sites) {
      const t = s.type || 'unknown';
      report.siteTypes[t] = (report.siteTypes[t] || 0) + 1;
    }
  }

  saveJson(OUT_DIR, 'fetch_report.json', report);
  log(`✅ 已保存: fetch_report.json`);

  // 9. 输出最终文件列表
  log(`\n========== 抓取完成 ==========`);
  log(`输出目录: ${OUT_DIR}`);
  const files = fs.readdirSync(OUT_DIR).sort();
  for (const f of files) {
    const fp = path.join(OUT_DIR, f);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      const sub = fs.readdirSync(fp).length;
      log(`  📁 ${f}/ (${sub} 个文件)`);
    } else {
      log(`  📄 ${f} (${stat.size} bytes)`);
    }
  }
  log(`==============================`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });