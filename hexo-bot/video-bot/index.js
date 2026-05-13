/**
 * ============================================================
 * index.js - TVBox 数据源分析工具（主入口）
 * ============================================================
 * 一键执行：获取 → 解析结构 → 聚合 → 解析播放地址
 *
 * 用法:
 *   node index.js          # 全流程执行
 *   node index.js fetch    # 仅获取数据源
 *   node index.js parse    # 仅解析结构
 *   node index.js aggregate # 仅聚合解析
 *   node index.js resolve   # 仅解析播放地址
 *   node index.js help      # 查看帮助
 * ============================================================
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HELP = `
TVBox 数据源分析工具 v1.0
═══════════════════════════════════════
  一个完整的 TVBox 数据源获取、解析、聚合与播放地址解析工具链。

  📁 输出目录: d:\\video

  目录结构：
    sources-list.json      - TVBox 数据源地址列表
    1-fetch-sources.js     - 数据源获取模块
    2-parse-structure.js   - 结构解析模块  
    3-aggregate-sources.js - 聚合源（多仓）解析模块
    4-resolve-playurl.js   - 播放地址解析模块
    raw/                   - 原始响应数据
    parsed/                - 解析后的标准结构数据
    aggregated/            - 聚合后的完整数据源
    playable/              - 可直接播放的地址和播放器
    report/                - 分析报告

  用法:
    node index.js           全流程（推荐）
    node index.js fetch     仅获取数据源
    node index.js parse     仅解析结构
    node index.js aggregate 仅聚合解析
    node index.js resolve   仅解析播放地址
    node index.js help      显示帮助

  步骤说明:
    1. fetch    → 从 sources-list.json 获取所有数据源原始内容
    2. parse    → 解析原始内容为标准数据结构
    3. aggregate → 递归解析多仓源，合并为统一站点列表
    4. resolve  → 测试API站点的播放能力，生成可播放地址

  TVBox 数据源标准结构说明:
    TVBox 的数据源是一个 JSON 配置文件，包含：
    - spider:  Jar 爬虫包地址
    - sites[]: 站点源列表（核心）
      - type=0: XML格式API，可直接获取视频
      - type=1: JSON格式API，可直接获取视频
      - type=3: Spider模式，需要 Jar/JS 爬虫
    - lives[]: 直播频道分组
    - parses[]: 视频解析接口
    
    多仓（聚合源）：
      一个数据源如果返回 JSON 数组或 TXT（每行一个URL），
      表示它是聚合源，包含多个子数据源的地址。
      本工具支持递归解析最多5层深度。

    可播放地址：
      - API站点直接返回的 MP4/M3U8/FLV 地址
      - 格式: "第1集$http://...m3u8#第2集$http://...mp4"
      - 通过 ac=detail 接口获取视频详情，解析 vod_play_url 字段
`;

function runScript(scriptName, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  步骤: ${label}`);
  console.log(`  脚本: ${scriptName}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    execSync(`node "${path.join(__dirname, scriptName)}"`, {
      cwd: __dirname,
      stdio: 'inherit',
      env: { ...process.env },
    });
    return true;
  } catch (err) {
    console.error(`\n❌ 步骤失败: ${label}`);
    console.error(`   错误: ${err.message}`);
    return false;
  }
}

function showHelp() {
  console.log(HELP);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  if (command === 'help') {
    showHelp();
    return;
  }

  console.log(`\n`);
  console.log(`╔══════════════════════════════════════════════════════╗`);
  console.log(`║         TVBox 数据源分析工具 v1.0                    ║`);
  console.log(`║         完整的数据源获取、聚合与播放地址解析         ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`\n📂 工作目录: ${__dirname}`);
  console.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`);

  if (command === 'all' || command === 'fetch') {
    if (!runScript('1-fetch-sources.js', '获取数据源')) return;
  }

  if (command === 'all' || command === 'parse') {
    if (!runScript('2-parse-structure.js', '解析结构')) return;
  }

  if (command === 'all' || command === 'aggregate') {
    if (!runScript('3-aggregate-sources.js', '聚合解析')) return;
  }

  if (command === 'all' || command === 'resolve') {
    if (!runScript('4-resolve-playurl.js', '解析播放地址')) return;
  }

  // 显示结果摘要
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  🎯 执行完成！`);
  console.log(`  输出目录: ${__dirname}`);
  console.log(`${'='.repeat(60)}`);

  // 列出生成的文件
  for (const dir of ['raw', 'parsed', 'aggregated', 'playable', 'report']) {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(f => !f.startsWith('.'));
      if (files.length > 0) {
        console.log(`\n  📁 ${dir}/ (${files.length} 个文件):`);
        for (const file of files.slice(0, 5)) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          const size = (stat.size / 1024).toFixed(1);
          console.log(`    └ ${file} (${size} KB)`);
        }
        if (files.length > 5) {
          console.log(`    ... 还有 ${files.length - 5} 个文件`);
        }
      }
    }
  }

  console.log(`\n  💡 提示: 使用 node index.js help 查看更多帮助\n`);
}

main().catch(console.error);
