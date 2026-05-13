/**
 * ============================================================
 * 1-fetch-sources.js - TVBox 数据源获取与保存模块
 * ============================================================
 * 功能：
 *   1. 读取 sources-list.json 中所有已知数据源地址
 *   2. 逐一请求获取原始配置内容
 *   3. 自动检测返回格式（JSON / TXT / M3U）
 *   4. 保存原始数据到 raw/ 目录
 *   5. 保存标准化的结构化数据到 parsed/
 *
 * TVBox 数据源标准结构（JSON）：
 *   {
 *     "spider": "<jar_url>[;md5;<md5>]",   // Jar爬虫包
 *     "wallpaper": "<url>",                 // 壁纸
 *     "sites": [{                           // 站点列表（核心）
 *       "key": "site_id",                   //   站点唯一标识
 *       "name": "站点名称",                 //   站点显示名称
 *       "api": "http://...",                //   站点API地址
 *       "type": 0|1|3,                      //   站点类型：0=XML,1=JSON,3=Spider
 *       "searchable": 0|1,                  //   是否可搜索
 *       "quickSearch": 0|1,                 //   是否可快速搜索
 *       "filterable": 0|1,                  //   是否可筛选
 *       "hide": 0|1,                        //   是否隐藏
 *       "playerUrl": "",                    //   播放解析URL
 *       "ext": "",                          //   扩展参数
 *       "jar": "",                          //   自定义Jar（优先级高于顶级spider）
 *       "playerType": 0,                    //   播放器类型
 *       "categories": ["电影","电视剧"],     //   分类
 *       "click": ""                         //   嗅探CSS选择器
 *     }],
 *     "lives": [{ group, channels }],       // 直播源
 *     "parses": [{ name, url, type, ext }], // 解析地址
 *     "flags": ["flag1"],                   // VIP解析标识
 *     "rules": [{ host, rule, filter }],    // 解析规则
 *     "ads": ["ad.com"],                    // 广告拦截
 *     "ijk": [{ group, options }]           // IJK播放器配置
 *   }
 *
 * 多仓（聚合源）结构：
 *   可能是 JSON 数组，每个元素包含 name/url 指向另一个数据源
 *   可能是 TXT 文本，每行一个数据源地址
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const sourcesList = require('./sources-list.json');

// 目录定义
const DIRS = {
  raw: path.join(__dirname, 'raw'),
  parsed: path.join(__dirname, 'parsed'),
  report: path.join(__dirname, 'report'),
};

// 确保目录存在
for (const dir of Object.values(DIRS)) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * HTTP GET 请求（兼容 Node.js 原生 fetch 和 axios）
 */
async function httpGet(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/plain,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    return { text, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 检测内容格式
 */
/**
 * 清理文本：去除BOM、JSON中的注释
 */
function cleanJsonText(text) {
  let cleaned = text.replace(/^\uFEFF/, '');
  // 处理以 // 开头的注释行
  cleaned = cleaned.replace(/^\/\/.*$/gm, '');
  // 处理以 /* */ 包围的块注释
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned.trim();
}

function detectContentType(text, url = '') {
  // 去除可能的BOM和前置注释后重试
  const cleanText = cleanJsonText(text);
  // 尝试解析JSON
  try {
    const parsed = JSON.parse(cleanText);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && parsed[0].url && parsed[0].name) {
        return 'multi-json'; // 多仓JSON数组（每项是指向子源的URL）
      }
      if (parsed.length > 0 && parsed[0].sites) {
        return 'single-json'; // 单仓库（内部包含sites等字段的直接数据）
      }
      return 'multi-json'; // 其他JSON数组，当作多仓处理
    }
    if (parsed.sites || parsed.spider || parsed.lives) {
      return 'single-json'; // 标准单仓库结构
    }
    if (parsed.urls || parsed.sources) {
      return 'multi-json'; // 包含urls列表的JSON
    }
    return 'unknown-json';
  } catch {
    // 非JSON
  }

  // TXT格式：每行一个URL
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const urlLines = lines.filter(l => l.startsWith('http://') || l.startsWith('https://'));
  if (urlLines.length > 0 && urlLines.length === lines.length) {
    return 'multi-txt'; // 多仓TXT（每行一个URL）
  }

  // M3U格式
  if (text.trim().startsWith('#EXTM3U')) {
    return 'live-m3u'; // M3U直播源
  }

  return 'unknown';
}

/**
 * 从文本中提取所有URL
 */
function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s"',\]}>)]+)/g;
  return [...new Set(text.match(urlRegex) || [])];
}

/**
 * 标准化文件名（移除特殊字符）
 */
function safeFilename(name, ext = '.json') {
  return name.replace(/[<>:"/\\|?*.]/g, '_') + ext;
}

/**
 * 解析单仓库JSON为规范化结构
 */
function normalizeSingleSource(json, sourceUrl) {
  const result = {
    _meta: {
      source_url: sourceUrl,
      fetch_time: new Date().toISOString(),
    },
    spider: json.spider || '',
    wallpaper: json.wallpaper || '',
    sites: (json.sites || []).map(site => ({
      key: site.key || '',
      name: site.name || '',
      api: site.api || '',
      type: site.type !== undefined ? site.type : 3,
      searchable: site.searchable !== undefined ? site.searchable : 1,
      quickSearch: site.quickSearch !== undefined ? site.quickSearch : 1,
      filterable: site.filterable !== undefined ? site.filterable : 0,
      hide: site.hide || 0,
      playerUrl: site.playUrl || site.playerUrl || '',
      ext: typeof site.ext === 'string' ? site.ext : (site.ext ? JSON.stringify(site.ext) : ''),
      jar: site.jar || '',
      playerType: site.playerType !== undefined ? site.playerType : 0,
      categories: site.categories || site.typeNames || [],
      click: site.click || '',
    })),
    lives: json.lives || [],
    parses: json.parses || [],
    flags: json.flags || [],
    rules: json.rules || [],
    ads: json.ads || [],
    ijk: json.ijk || [],
    livePlayHeaders: json.livePlayHeaders || [],
  };

  return result;
}

/**
 * 处理多仓（聚合源）
 */
function parseMultiSource(text, sourceUrl) {
  const type = detectContentType(text, sourceUrl);
  let childUrls = [];

  if (type === 'multi-json') {
    const cleanText = cleanJsonText(text);
    const data = JSON.parse(cleanText);
    if (Array.isArray(data)) {
      childUrls = data
        .filter(item => item.url || item.api)
        .map(item => ({
          name: item.name || item.title || '未命名',
          url: item.url || item.api,
          type: item.type || 'unknown',
        }));
    } else if (data.urls) {
      childUrls = data.urls.map(u => ({
        name: u.name || '未命名',
        url: u.url || u,
        type: u.type || 'unknown',
      }));
    }
  } else if (type === 'multi-txt') {
    const lines = text.trim().split('\n').filter(Boolean);
    childUrls = lines.map(line => {
      const parts = line.split(',').map(s => s.trim());
      const url = parts.find(p => p.startsWith('http')) || parts[0];
      const name = (parts.find(p => !p.startsWith('http')) || '').replace(/[#\s]/g, '') || url.split('/').pop();
      return { name, url, type: 'single-json' };
    });
  }

  return {
    _meta: {
      source_url: sourceUrl,
      fetch_time: new Date().toISOString(),
      type: 'multi',
      child_count: childUrls.length,
    },
    children: childUrls,
    raw_type: type,
  };
}

/**
 * 获取并保存单个数据源
 */
async function fetchAndSaveSource(source) {
  const { name, url, type: sourceType } = source;
  console.log(`\n📡 [${name}] 正在获取...`);
  console.log(`    URL: ${url}`);

  try {
    const { text, contentType } = await httpGet(url);
    const dataType = detectContentType(text, url);
    console.log(`    ✅ 获取成功 (${(text.length / 1024).toFixed(1)} KB, 类型: ${dataType})`);

    // 保存原始内容
    const rawExt = dataType === 'multi-txt' ? '.txt' : '.json';
    const rawFile = safeFilename(name, rawExt);
    fs.writeFileSync(path.join(DIRS.raw, rawFile), text, 'utf-8');

    let parsed;
    if (sourceType === 'multi' || dataType.startsWith('multi-') || dataType === 'multi-txt') {
      // 多仓源
      parsed = parseMultiSource(text, url);
    } else if (dataType === 'single-json') {
      // 单仓标准JSON
      const cleanText = cleanJsonText(text);
      const json = JSON.parse(cleanText);
      parsed = normalizeSingleSource(json, url);
    } else {
      // 其他类型（M3U等），先保存元信息
      parsed = {
        _meta: { source_url: url, fetch_time: new Date().toISOString(), type: dataType },
        raw_file: rawFile,
        note: '非标准JSON格式，原始内容已保存到raw目录',
      };
    }

    // 保存解析结果
    const parsedFile = safeFilename(name, '.json');
    fs.writeFileSync(
      path.join(DIRS.parsed, parsedFile),
      JSON.stringify(parsed, null, 2),
      'utf-8'
    );
    console.log(`    ✅ 解析完成 → ${parsedFile}`);

    // 统计信息
    if (parsed.sites) {
      const siteCount = parsed.sites.length;
      const spiderCount = parsed.sites.filter(s => s.type === 3).length;
      const apiCount = parsed.sites.filter(s => s.type === 0 || s.type === 1).length;
      const liveCount = parsed.lives ? parsed.lives.length : 0;
      console.log(`    📊 站点: ${siteCount}个 (Spider:${spiderCount}, API:${apiCount}) | 直播分组: ${liveCount}个`);
    }
    if (parsed.children) {
      console.log(`    📊 子源数量: ${parsed.children.length}个`);
    }

    return { name, url, dataType, parsed };
  } catch (err) {
    console.error(`    ❌ 获取失败: ${err.message}`);
    return { name, url, error: err.message };
  }
}

/**
 * 生成获取报告
 */
function generateReport(results) {
  const successful = results.filter(r => !r.error);
  const failed = results.filter(r => r.error);

  const report = {
    fetch_time: new Date().toISOString(),
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    details: results.map(r => ({
      name: r.name,
      url: r.url,
      status: r.error ? '失败' : '成功',
      error: r.error || null,
      site_count: r.parsed?.sites?.length || null,
      child_count: r.parsed?.children?.length || null,
    })),
  };

  const reportFile = path.join(DIRS.report, 'fetch-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n📋 报告已保存: ${reportFile}`);

  return report;
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('  TVBox 数据源获取工具');
  console.log('='.repeat(60));
  console.log(`  数据源总数: ${sourcesList.sources.length}`);
  console.log(`  输出目录:   ${__dirname}`);
  console.log('='.repeat(60));

  const results = [];
  for (const source of sourcesList.sources) {
    // 跳过非直连型源（service和portal类型）
    if (source.type === 'service' || source.type === 'portal') {
      console.log(`\n⏭️  [${source.name}] 跳过（非直连型数据源，需手动注册）`);
      results.push({ name: source.name, url: source.url, error: '跳过：需手动注册' });
      continue;
    }
    const result = await fetchAndSaveSource(source);
    results.push(result);
  }

  const report = generateReport(results);

  console.log('\n');
  console.log('='.repeat(60));
  console.log('  获取完成！');
  console.log(`  成功: ${report.successful} / 失败: ${report.failed} / 总数: ${report.total}`);
  console.log('='.repeat(60));
  console.log('\n📁 文件说明:');
  console.log(`  raw/     - 原始响应内容`);
  console.log(`  parsed/  - 解析后的标准结构数据`);
  console.log(`  report/  - 执行报告`);

  return report;
}

// 执行
main().catch(console.error);
