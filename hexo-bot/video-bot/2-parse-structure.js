/**
 * ============================================================
 * 2-parse-structure.js - TVBox 数据源结构深度解析模块
 * ============================================================
 * 功能：
 *   1. 读取 raw/ 目录下的原始数据
 *   2. 对每个数据源进行结构分析
 *   3. 提取所有站点信息、API接口、Jar地址
 *   4. 分析聚合关系
 *   5. 生成完整的数据源结构地图
 *
 * TVBox 标准数据源结构定义：
 *
 * ┌─────────────────────────────────────────────┐
 * │             TVBox 数据源 JSON                 │
 * ├───────────┬─────────────────────────────────┤
 * │ spider    │ Jar爬虫包URL (可选按站点覆盖)      │
 * │ wallpaper │ 壁纸图片URL                       │
 * │ sites[]   │ 站点源列表（核心）                 │
 * │ lives[]   │ 直播频道分组                      │
 * │ parses[]  │ 视频解析接口                     │
 * │ flags[]   │ VIP解析标识                      │
 * │ rules[]   │ 视频解析规则                      │
 * │ ads[]     │ 广告拦截域名                     │
 * │ ijk[]     │ IJK播放器配置                    │
 * └───────────┴─────────────────────────────────┘
 *
 * 站点类型:
 *   type=0 (XML格式)  - API返回XML
 *   type=1 (JSON格式) - API返回JSON (标准通用API)
 *   type=3 (Spider模式) - Jar/JS爬虫
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
};

/**
 * 解析单个站点的API能力
 * type=0/1的站点可以通过标准API获取数据
 * type=3的站点需要Jar/JS爬虫
 */
function analyzeSiteCapability(site, parentSpider) {
  const analysis = {
    key: site.key,
    name: site.name,
    api: site.api,
    type: site.type,
    type_desc: ['XML格式', 'JSON格式', '未知', 'Spider模式'][site.type] || '未知',
    can_fetch_directly: site.type === 0 || site.type === 1,
    need_spider: site.type === 3,
    effective_jar: site.jar || parentSpider || '无',
    has_api: !!site.api,
    searchable: site.searchable === 1,
    filterable: site.filterable === 1,
    categories: site.categories || [],
  };

  // 对于可直接获取的API类型，生成测试URL
  if (analysis.can_fetch_directly && site.api) {
    analysis.api_endpoints = {
      home: `${site.api}?ac=list`,
      detail: `${site.api}?ac=detail&ids={vod_id}`,
      search: `${site.api}?ac=search&wd={keyword}`,
      category: `${site.api}?ac=list&t={tid}&pg={page}`,
    };
  }

  return analysis;
}

/**
 * 分析单仓库数据源
 */
function analyzeSingleSource(data, sourceName) {
  const result = {
    source_name: sourceName,
    source_type: '单仓',
    total_sites: data.sites?.length || 0,
    total_live_groups: data.lives?.length || 0,
    total_parses: data.parses?.length || 0,
    has_spider: !!data.spider,
    spider_url: data.spider || null,
    has_wallpaper: !!data.wallpaper,
    wallpaper_url: data.wallpaper || null,
  };

  // 按类型分类站点
  const siteTypes = {};
  for (const k of ['0', '1', '2', '3', '4']) { siteTypes[k] = []; }
  for (const site of data.sites || []) {
    const key = String(site.type !== undefined && site.type !== null ? site.type : 'unknown');
    if (siteTypes[key]) siteTypes[key].push(site);
    else siteTypes['unknown'] = (siteTypes['unknown'] || []).concat([site]);
  }

  result.site_types = {
    xml_sites: (siteTypes['0'] || []).length,
    json_api_sites: (siteTypes['1'] || []).length,
    spider_sites: (siteTypes['3'] || []).length,
    other_sites: (siteTypes['2'] || []).length + (siteTypes['4'] || []).length + (siteTypes['unknown'] || []).length,
    xml_sites_detail: (siteTypes['0'] || []).map(s => ({ key: s.key, name: s.name, api: s.api })),
    json_api_sites_detail: (siteTypes['1'] || []).map(s => ({ key: s.key, name: s.name, api: s.api })),
    spider_sites_detail: (siteTypes['3'] || []).map(s => ({ key: s.key, name: s.name, jar: s.jar || data.spider || '' })),
  };

  // 提取所有Jar地址
  const jars = new Set();
  if (data.spider) jars.add(data.spider);
  for (const site of data.sites || []) {
    if (site.jar) jars.add(site.jar);
  }
  result.jar_urls = [...jars];

  // 提取所有API地址
  const apiUrls = (data.sites || [])
    .filter(s => s.api && (s.type === 0 || s.type === 1))
    .map(s => ({ key: s.key, name: s.name, api: s.api }));
  result.api_urls = apiUrls;

  // 解析规则分析
  if (data.parses?.length > 0) {
    result.parse_services = data.parses.map(p => ({
      name: p.name,
      url: p.url,
      type: ['普通嗅探', 'JSON解析', 'JSON扩展', '聚合模式'][p.type] || '未知',
    }));
  }

  // 直播源分析
  if (data.lives?.length > 0) {
    let totalChannels = 0;
    for (const group of data.lives) {
      if (group.channels) {
        totalChannels += group.channels.length;
      }
    }
    result.live_stats = {
      groups: data.lives.length,
      channels: totalChannels,
    };
  }

  return result;
}

/**
 * 分析多仓库（聚合源）数据源
 */
function analyzeMultiSource(data, sourceName) {
  const result = {
    source_name: sourceName,
    source_type: '多仓聚合',
    child_count: data.children?.length || 0,
    children: (data.children || []).map(c => ({
      name: c.name,
      url: c.url,
      type: c.type,
      is_multi: c.url?.includes('dc') || c.type === 'multi',
    })),
  };

  return result;
}

/**
 * 分析站点是否能提供直接播放的地址
 */
function analyzePlayability(site) {
  if (site.type === 0 || site.type === 1) {
    // API类型 - 可以直接通过标准接口获取
    return {
      playable: true,
      method: 'standard_api',
      api_url: site.api,
      detail_endpoint: `${site.api}?ac=detail&ids={vod_id}`,
      note: '标准API接口，通过ac=detail获取视频详情，vod_play_url即为可直接播放地址',
    };
  }

  if (site.type === 3) {
    // Spider模式 - 需要执行Jar/JS
    return {
      playable: true,
      method: 'spider',
      jar_or_js: site.jar || '使用顶级spider',
      note: 'Spider模式，需要加载Jar/JS执行爬虫逻辑才能解析播放地址',
    };
  }

  return {
    playable: false,
    method: 'unknown',
    note: '未知站点类型，无法解析播放地址',
  };
}

/**
 * 生成全局数据源拓扑结构
 */
function generateTopology(allAnalyses) {
  const topology = {
    generated_at: new Date().toISOString(),
    total_data_sources: allAnalyses.length,
    summary: {
      single_repos: 0,
      multi_repos: 0,
      total_sites: 0,
      api_sites: 0,
      spider_sites: 0,
      jar_count: 0,
      api_count: 0,
    },
    all_sites: [],
    all_jars: [],
    all_apis: [],
    all_aggregations: [],
  };

  const seenKeys = new Set();
  const seenJars = new Set();
  const seenApis = new Set();

  for (const analysis of allAnalyses) {
    if (analysis.source_type === '单仓') {
      topology.summary.single_repos++;
      topology.summary.total_sites += analysis.total_sites;
      topology.summary.api_sites += analysis.site_types.json_api_sites + analysis.site_types.xml_sites;
      topology.summary.spider_sites += analysis.site_types.spider_sites;

      // 收集唯一站点
      for (const site of analysis.site_types.json_api_sites_detail) {
        if (!seenKeys.has(site.key)) {
          seenKeys.add(site.key);
          topology.all_sites.push({ ...site, access_type: 'JSON-API', source: analysis.source_name });
        }
      }
      for (const site of analysis.site_types.xml_sites_detail) {
        if (!seenKeys.has(site.key)) {
          seenKeys.add(site.key);
          topology.all_sites.push({ ...site, access_type: 'XML-API', source: analysis.source_name });
        }
      }
      for (const site of analysis.site_types.spider_sites_detail) {
        if (!seenKeys.has(site.key)) {
          seenKeys.add(site.key);
          topology.all_sites.push({ ...site, access_type: 'Spider', source: analysis.source_name });
        }
      }

      // 收集唯一Jar
      for (const jar of analysis.jar_urls) {
        if (!seenJars.has(jar)) {
          seenJars.add(jar);
          topology.all_jars.push({ url: jar, source: analysis.source_name });
          topology.summary.jar_count++;
        }
      }

      // 收集唯一API
      for (const api of analysis.api_urls) {
        const apiKey = api.api;
        if (!seenApis.has(apiKey)) {
          seenApis.add(apiKey);
          topology.all_apis.push({ ...api, source: analysis.source_name });
          topology.summary.api_count++;
        }
      }
    }

    if (analysis.source_type === '多仓聚合') {
      topology.summary.multi_repos++;
      topology.all_aggregations.push({
        name: analysis.source_name,
        children: analysis.children || [],
      });
    }
  }

  return topology;
}

/**
 * 主函数
 */
function main() {
  console.log('='.repeat(60));
  console.log('  TVBox 数据源结构深度解析');
  console.log('='.repeat(60));

  // 读取所有解析后的文件
  const parsedFiles = fs.readdirSync(DIRS.parsed)
    .filter(f => f.endsWith('.json'));

  console.log(`\n📂 找到 ${parsedFiles.length} 个解析文件\n`);

  const allAnalyses = [];

  for (const file of parsedFiles) {
    const filePath = path.join(DIRS.parsed, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const sourceName = file.replace('.json', '');

    console.log(`── ${sourceName} ──`);

    if (data.children) {
      // 多仓源
      const analysis = analyzeMultiSource(data, sourceName);
      allAnalyses.push(analysis);
      console.log(`   类型: 多仓聚合 | 子源: ${analysis.child_count}个`);
      for (const child of analysis.children) {
        console.log(`     └ ${child.name}: ${child.url}`);
      }
    } else if (data.sites) {
      // 单仓源
      const analysis = analyzeSingleSource(data, sourceName);
      allAnalyses.push(analysis);
      console.log(`   类型: 单仓`);
      if (!analysis.site_types) {
        console.log(`   ⚠️ 结构解析异常，跳过详细输出`);
        console.log('');
        continue;
      }
      console.log(`   站点: ${analysis.total_sites}个 (XML:${analysis.site_types.xml_sites}, JSON:${analysis.site_types.json_api_sites}, Spider:${analysis.site_types.spider_sites})`);
      console.log(`   直播: ${analysis.total_live_groups}个分组`);
      console.log(`   解析: ${analysis.total_parses}个`);
      console.log(`   Jar: ${analysis.jar_urls.length}个`);
      if (analysis.api_urls.length > 0) {
        console.log(`   API接口: ${analysis.api_urls.length}个`);
        for (const a of analysis.api_urls.slice(0, 5)) {
          console.log(`     └ ${a.name}: ${a.api}`);
        }
        if (analysis.api_urls.length > 5) {
          console.log(`     ... 还有${analysis.api_urls.length - 5}个`);
        }
      }
      // 分析播放能力
      console.log(`   播放能力分析:`);
      for (const site of data.sites || []) {
        const pa = analyzePlayability(site);
        if (pa.playable) {
          console.log(`     ✅ ${site.name}(${site.key}): ${pa.method} - ${pa.note}`);
        }
      }
    } else {
      console.log(`   类型: 其他格式（非标准JSON）`);
    }
    console.log('');
  }

  // 生成全局拓扑
  const topology = generateTopology(allAnalyses);
  const topoFile = path.join(DIRS.report, 'structure-topology.json');
  fs.writeFileSync(topoFile, JSON.stringify(topology, null, 2), 'utf-8');

  // 输出汇总
  console.log('='.repeat(60));
  console.log('  全局数据源拓扑汇总');
  console.log('='.repeat(60));
  console.log(`  数据源总数:    ${topology.total_data_sources}`);
  console.log(`  单仓库:        ${topology.summary.single_repos}`);
  console.log(`  多仓库:        ${topology.summary.multi_repos}`);
  console.log(`  独立站点总数:  ${topology.summary.total_sites}`);
  console.log(`    ├ API型:     ${topology.summary.api_sites}（可直接通过标准接口获取视频地址）`);
  console.log(`    └ Spider型:  ${topology.summary.spider_sites}（需执行Jar/JS爬虫）`);
  console.log(`  Jar包总数:     ${topology.summary.jar_count}`);
  console.log(`  API接口总数:   ${topology.summary.api_count}`);
  console.log(`  聚合链路数:    ${topology.summary.multi_repos}`);
  console.log('');

  console.log('📋 报告已保存:');
  console.log(`  ${topoFile}`);
}

main();
