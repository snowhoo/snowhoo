/**
 * 预解析脚本：从本地 raw/ JSON 文件中提取 HTTP API 站点
 * 输出到 parsed/ 目录，格式为 {sites:[...]} 供 Python 爬虫使用
 *
 * 只提取 type=0(xml) 或 type=1(json) 且 api 以 http 开头的站点
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const RAW_DIR = path.join(__dirname, 'raw');
const PARSED_DIR = path.join(__dirname, 'parsed');

// 确保 parsed 目录存在
if (!fs.existsSync(PARSED_DIR)) {
  fs.mkdirSync(PARSED_DIR, { recursive: true });
}

/**
 * 清理 JSON 文本（去除 BOM 和注释）
 */
function cleanJsonText(text) {
  let cleaned = text.replace(/^\uFEFF/, '');
  cleaned = cleaned.replace(/^\/\/.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  return cleaned.trim();
}

/**
 * 解析单个 raw JSON 文件，提取 HTTP API 站点
 */
function parseRawFile(filename) {
  const filePath = path.join(RAW_DIR, filename);
  let rawText;
  try {
    rawText = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  // 清理注释后解析
  const cleanText = cleanJsonText(rawText);
  let json;
  try {
    json = JSON.parse(cleanText);
  } catch {
    return null;
  }

  // 如果是数组（多仓），跳过
  if (Array.isArray(json)) {
    return null;
  }

  // 如果没有 sites 字段，跳过
  if (!json.sites || !Array.isArray(json.sites)) {
    return null;
  }

  // 提取 HTTP API 站点（type=0/xml 或 type=1/json 且 api 以 http 开头）
  const httpSites = [];
  for (const site of json.sites) {
    const api = (site.api || '').trim();
    const type = site.type;
    // type 为 0(xml) 或 1(json) 且 api 是 http URL
    if ((type === 0 || type === 1) && api.startsWith('http')) {
      httpSites.push({
        key: site.key || '',
        name: site.name || '',
        api: api,
        type: type,
        searchable: site.searchable !== undefined ? site.searchable : 1,
        quickSearch: site.quickSearch !== undefined ? site.quickSearch : 1,
        filterable: site.filterable !== undefined ? site.filterable : 0,
      });
    }
  }

  if (httpSites.length === 0) {
    return null;
  }

  return {
    source_url: json._meta?.source_url || filename,
    sites: httpSites,
  };
}

/**
 * 主函数
 */
function main() {
  console.log('='.repeat(50));
  console.log('  预解析：提取 HTTP API 站点');
  console.log('='.repeat(50));

  const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
  console.log(`\n扫描 ${RAW_DIR}：${rawFiles.length} 个文件\n`);

  let totalSites = 0;
  let processedFiles = 0;

  for (const filename of rawFiles) {
    const result = parseRawFile(filename);
    if (!result) {
      console.log(`  ⏭  ${filename}（无 HTTP API 站点）`);
      continue;
    }

    const outName = filename.replace('.json', '');
    const outPath = path.join(PARSED_DIR, `${outName}.json`);

    // 写入 parsed/ 目录（Python 爬虫期望的格式）
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');

    processedFiles++;
    totalSites += result.sites.length;
    console.log(`  ✅ ${filename} → ${result.sites.length} 个 HTTP API 站点`);
    for (const s of result.sites) {
      console.log(`     └ ${s.name}: ${s.api}`);
    }
  }

  console.log(`\n完成：处理 ${processedFiles}/${rawFiles.length} 个文件，提取 ${totalSites} 个 HTTP API 站点`);
  console.log(`输出目录：${PARSED_DIR}`);
}

main();
