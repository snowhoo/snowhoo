/**
 * ============================================================
 * 3-aggregate-sources.js - TVBox 聚合源（多仓）深度解析
 * ============================================================
 * 功能：
 *   1. 解析多仓源：递归获取所有子层级的配置
 *   2. 合并多层级站点源为统一列表
 *   3. 智能去重（按站点key）
 *   4. 处理 Spider/Jar 参数继承关系
 *   5. 生成完整的聚合结果
 *
 * 聚合源层级结构：
 *   ┌─ 多仓源 ──────────────────────────────────┐
 *   │   ├─ 子源1 (单仓 JSON) → {sites[...], ...} │
 *   │   ├─ 子源2 (单仓 JSON) → {sites[...], ...} │
 *   │   └─ 子源N ...                              │
 *   │                                             │
 *   │   └─ 子源M (多仓 TXT) ──┐                  │
 *   │        ├─ 孙源1         │ → 递归解析        │
 *   │        └─ 孙源2         │                   │
 *   └─────────────────────────────────────────────┘
 *
 * Spider/Jar 继承规则：
 *   顶级 spider → 站点级 jar（站点级优先级更高）
 *   合并时需将顶级spider注入到无jar的type=3站点中
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIRS = {
  raw: path.join(__dirname, 'raw'),
  parsed: path.join(__dirname, 'parsed'),
  report: path.join(__dirname, 'report'),
  aggregated: path.join(__dirname, 'aggregated'),
};

// 确保聚合输出目录存在
if (!fs.existsSync(DIRS.aggregated)) {
  fs.mkdirSync(DIRS.aggregated, { recursive: true });
}

/**
 * HTTP GET 请求
 */
async function httpGet(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json,text/plain,*/*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 检测内容类型
 */
function detectContentType(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      if (parsed.length > 0 && (parsed[0].url || parsed[0].api)) {
        return 'multi-url-array';
      }
      return 'json-array';
    }
    if (parsed.sites || parsed.spider || parsed.lives) {
      return 'single-source';
    }
    if (parsed.urls || parsed.sources) {
      return 'multi-url-list';
    }
    return 'unknown-json';
  } catch {
    // 非JSON
  }

  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const urlLines = lines.filter(l => l.startsWith('http://') || l.startsWith('https://'));
  if (urlLines.length > 0 && urlLines.length >= lines.length * 0.8) {
    return 'url-list-text';
  }

  return 'unknown';
}

/**
 * 从内容中提取子源URL列表
 */
function extractChildUrls(text, contentType) {
  const urls = [];

  switch (contentType) {
    case 'multi-url-array': {
      const data = JSON.parse(text);
      for (const item of data) {
        urls.push({
          name: item.name || item.title || '未命名',
          url: item.url || item.api,
        });
      }
      break;
    }
    case 'multi-url-list': {
      const data = JSON.parse(text);
      const list = data.urls || data.sources || [];
      for (const item of list) {
        urls.push({
          name: item.name || item.title || '未命名',
          url: item.url || item,
        });
      }
      break;
    }
    case 'url-list-text': {
      const lines = text.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        const url = parts.find(p => p.startsWith('http')) || parts[0];
        const name = parts.find(p => !p.startsWith('http')) || url?.split('/').pop() || '未命名';
        urls.push({ name: name.replace(/[#\s]/g, ''), url });
      }
      break;
    }
  }

  return urls;
}

/**
 * 解析单仓JSON为统一站点列表
 */
function parseSingleSource(json, parentSpider) {
  const sites = (json.sites || []).map(site => ({
    key: site.key || '',
    name: site.name || '',
    api: site.api || '',
    type: site.type !== undefined ? site.type : 3,
    searchable: site.searchable !== undefined ? site.searchable : 1,
    quickSearch: site.quickSearch !== undefined ? site.quickSearch : 1,
    filterable: site.filterable !== undefined ? site.filterable : 0,
    hide: site.hide || 0,
    playerUrl: site.playUrl || site.playerUrl || '',
    ext: typeof site.ext === 'object' ? JSON.stringify(site.ext) : (site.ext || ''),
    jar: site.jar || '',
    playerType: site.playerType !== undefined ? site.playerType : 0,
    categories: site.categories || site.typeNames || [],
    click: site.click || '',
  }));

  return {
    sites,
    spider: json.spider || parentSpider || '',
    parses: json.parses || [],
    lives: json.lives || [],
    flags: json.flags || [],
    rules: json.rules || [],
    ads: json.ads || [],
    ijk: json.ijk || [],
    wallpaper: json.wallpaper || '',
  };
}

/**
 * 递归获取并合并聚合源
 * maxDepth 防止无限递归
 */
async function resolveAggregatedSource(url, depth = 0, maxDepth = 5, visited = new Set()) {
  if (depth > maxDepth) {
    return { source_url: url, error: '超过最大递归深度', sites: [] };
  }

  const urlKey = url.replace(/\/+$/, '');
  if (visited.has(urlKey)) {
    return { source_url: url, error: '循环引用，跳过', sites: [] };
  }
  visited.add(urlKey);

  console.log(`${'  '.repeat(depth)}📦 [深度${depth}] 解析: ${url}`);

  try {
    const text = await httpGet(url);
    const contentType = detectContentType(text);

    console.log(`${'  '.repeat(depth)}   类型: ${contentType} (${(text.length / 1024).toFixed(1)} KB)`);

    if (contentType === 'single-source') {
      // 单仓：直接解析
      const json = JSON.parse(text);
      const result = parseSingleSource(json, '');
      console.log(`${'  '.repeat(depth)}   ✅ 站点: ${result.sites.length}个`);
      return {
        source_url: url,
        sites: result.sites,
        spider: result.spider,
        parses: result.parses,
        lives: result.lives,
        flags: result.flags,
        rules: result.rules,
        ads: result.ads,
        ijk: result.ijk,
        wallpaper: result.wallpaper,
        depth,
      };
    }

    if (['multi-url-array', 'multi-url-list', 'url-list-text'].includes(contentType)) {
      // 多仓：递归解析每个子源
      const children = extractChildUrls(text, contentType);
      console.log(`${'  '.repeat(depth)}   📎 子源: ${children.length}个`);

      const merged = {
        source_url: url,
        sites: [],
        spider: '',
        parses: [],
        lives: [],
        flags: [],
        rules: [],
        ads: [],
        ijk: [],
        wallpaper: '',
        depth,
        children_resolved: children.length,
      };

      for (const child of children) {
        const childResult = await resolveAggregatedSource(child.url, depth + 1, maxDepth, visited);
        if (childResult.sites) {
          merged.sites.push(...childResult.sites);
        }
        // 合并其他字段
        if (childResult.parses) merged.parses.push(...childResult.parses);
        if (childResult.lives) merged.lives.push(...childResult.lives);
        if (childResult.flags) merged.flags.push(...childResult.flags);
        if (childResult.rules) merged.rules.push(...childResult.rules);
        if (childResult.ads) merged.ads.push(...childResult.ads);
        if (childResult.ijk) merged.ijk.push(...childResult.ijk);
        if (!merged.wallpaper && childResult.wallpaper) merged.wallpaper = childResult.wallpaper;
      }

      // 去重
      merged.sites = deduplicateSites(merged.sites);
      merged.parses = deduplicateParses(merged.parses);

      console.log(`${'  '.repeat(depth)}   ✅ 合并后: ${merged.sites.length}个站点 (去重后)`);
      return merged;
    }

    // 未知内容类型
    console.log(`${'  '.repeat(depth)}   ⚠️ 未知内容类型`);
    return { source_url: url, error: `未知内容类型: ${contentType}`, sites: [] };
  } catch (err) {
    console.log(`${'  '.repeat(depth)}   ❌ 获取失败: ${err.message}`);
    return { source_url: url, error: err.message, sites: [] };
  }
}

/**
 * 站点去重（按key）
 */
function deduplicateSites(sites) {
  const seen = new Map();
  for (const site of sites) {
    if (site.key && !seen.has(site.key)) {
      seen.set(site.key, site);
    } else if (site.key) {
      // key冲突：更新jar等非空字段
      const existing = seen.get(site.key);
      if (site.jar && !existing.jar) existing.jar = site.jar;
      if (site.api && !existing.api) existing.api = site.api;
    }
  }
  return [...seen.values()];
}

/**
 * 解析规则去重（按url）
 */
function deduplicateParses(parses) {
  const seen = new Map();
  for (const p of parses) {
    if (p.url && !seen.has(p.url)) {
      seen.set(p.url, p);
    }
  }
  return [...seen.values()];
}

/**
 * 修复Spider/Jar继承关系
 * 对type=3但没有jar的站点，用顶级spider作为其jar
 */
function fixSpiderJarInheritance(sites, spider) {
  return sites.map(site => {
    if (site.type === 3 && !site.jar && spider) {
      return { ...site, jar: spider };
    }
    return site;
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('  TVBox 聚合源（多仓）深度解析');
  console.log('='.repeat(60));

  // 读取解析后的多仓源
  const parsedFiles = fs.readdirSync(DIRS.parsed)
    .filter(f => f.endsWith('.json'));

  // 先识别多仓源
  const multiSources = [];
  for (const file of parsedFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(DIRS.parsed, file), 'utf-8'));
    if (data.children && data.children.length > 0) {
      multiSources.push({
        name: file.replace('.json', ''),
        url: data._meta?.source_url || '',
        children: data.children,
      });
    }
  }

  console.log(`\n📂 找到 ${multiSources.length} 个多仓聚合源\n`);

  const allAggregatedResults = [];

  for (const ms of multiSources) {
    console.log(`\n🔥 处理聚合源: ${ms.name}`);
    console.log(`   主URL: ${ms.url}`);
    console.log(`   直接子源: ${ms.children.length}个`);
    console.log('   ' + '-'.repeat(40));

    // 从主URL开始递归解析（如果是多仓则走递归，否则理解为多仓主入口）
    const visited = new Set();
    const result = await resolveAggregatedSource(ms.url, 0, 5, visited);

    if (result.sites && result.sites.length > 0) {
      console.log(`\n   📊 ${ms.name} 聚合统计:`);
      console.log(`     总站点数: ${result.sites.length}`);
      console.log(`     可直连API站点: ${result.sites.filter(s => s.type === 0 || s.type === 1).length}`);
      console.log(`     Spider站点: ${result.sites.filter(s => s.type === 3).length}`);

      // 修复Jar继承
      result.sites = fixSpiderJarInheritance(result.sites, result.spider);

      // 保存聚合结果
      const output = {
        _meta: {
          source_name: ms.name,
          main_url: ms.url,
          generated_at: new Date().toISOString(),
          type: 'aggregated_source',
          aggregation_depth: result.depth,
          total_sites: result.sites.length,
        },
        spider: result.spider,
        sites: result.sites,
        parses: result.parses,
        lives: result.lives,
        flags: result.flags,
        rules: result.rules,
        ads: result.ads,
        ijk: result.ijk,
        wallpaper: result.wallpaper,
      };

      const outputFile = path.join(DIRS.aggregated, `${ms.name}-merged.json`);
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
      console.log(`   ✅ 已保存: ${outputFile}`);

      allAggregatedResults.push({
        name: ms.name,
        url: ms.url,
        total_sites: result.sites.length,
        api_sites: result.sites.filter(s => s.type === 0 || s.type === 1).length,
        spider_sites: result.sites.filter(s => s.type === 3).length,
        jar_count: [...new Set(result.sites.filter(s => s.jar).map(s => s.jar))].length,
        output_file: outputFile,
      });
    }
  }

  // 生成全局聚合报告
  const agReport = {
    generated_at: new Date().toISOString(),
    processed_sources: allAggregatedResults.length,
    sources: allAggregatedResults,
    total_all_sites: allAggregatedResults.reduce((sum, r) => sum + r.total_sites, 0),
    total_api_sites: allAggregatedResults.reduce((sum, r) => sum + r.api_sites, 0),
    total_spider_sites: allAggregatedResults.reduce((sum, r) => sum + r.spider_sites, 0),
  };

  const agReportFile = path.join(DIRS.report, 'aggregation-report.json');
  fs.writeFileSync(agReportFile, JSON.stringify(agReport, null, 2), 'utf-8');

  console.log('\n');
  console.log('='.repeat(60));
  console.log('  聚合解析完成！');
  console.log('='.repeat(60));
  console.log(`  处理聚合源: ${allAggregatedResults.length}个`);
  console.log(`  总站点数:   ${agReport.total_all_sites}`);
  console.log(`  API站点:    ${agReport.total_api_sites}（可直接获取播放地址）`);
  console.log(`  Spider站点: ${agReport.total_spider_sites}（需Jar/JS爬虫）`);
  console.log('\n📁 聚合结果:');
  console.log(`  aggregated/ - 聚合后的完整数据源`);
  console.log(`  report/aggregation-report.json - 聚合报告`);

  return agReport;
}

main().catch(console.error);
