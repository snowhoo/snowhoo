/**
 * DailyNews.js — 冯站长之家新闻早餐内容解析器
 *
 * 功能: 给定文章URL，获取并解析内容，保存为结构化JSON
 *
 * 运行方式:
 *   node DailyNews.js --url=<文章URL>            # 微信或顶端新闻的URL
 *   node DailyNews.js --url=<URL> --date=20260725 # 指定日期（默认从URL推断当天）
 *
 * 输出: news/YYYYMMDD.json
 *
 * URL来源:
 *   配合自动化任务使用（每天早上7:30自动从顶端新闻获取URL），
 *   也可手动传入微信文章或顶端新闻链接。
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

// ======================== 配置 ========================
const NEWS_DIR = path.join(__dirname, 'news');

// ======================== 工具函数 ========================

/** 获取8位日期戳 */
function getDateStamp(argDate) {
  if (argDate) return argDate;
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/** 中文日期字符串 */
function getChineseDate(dateStamp) {
  return `${dateStamp.slice(0, 4)}年${parseInt(dateStamp.slice(4, 6))}月${parseInt(dateStamp.slice(6, 8))}日`;
}

/** 星期名称 */
function getWeekday(dateStamp) {
  const d = new Date(parseInt(dateStamp.slice(0,4)), parseInt(dateStamp.slice(4,6))-1, parseInt(dateStamp.slice(6,8)));
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  return weekdays[d.getDay()];
}

// ======================== HTTP 请求 ========================

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      }
    };

    const req = client.request(options, (res) => {
      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return reject(new Error(`重定向无Location: ${res.statusCode}`));
        const nextUrl = location.startsWith('http') ? location :
          `${parsed.protocol}//${parsed.hostname}${location}`;
        res.resume();
        return fetchPage(nextUrl).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        let text;
        if (contentType.includes('gbk') || contentType.includes('gb2312')) {
          try {
            const iconv = require('iconv-lite');
            text = iconv.decode(buffer, 'gbk');
          } catch {
            text = buffer.toString('utf-8');
          }
        } else {
          text = buffer.toString('utf-8');
        }
        resolve({ html: text, statusCode: res.statusCode, url });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`请求超时: ${url}`)); });
    req.end();
  });
}

// ======================== 内容解析 ========================

/** 从HTML中提取标题 */
function extractTitle(html) {
  const patterns = [
    /<title[^>]*>([^<]+)<\/title>/,
    /class="rich_media_title"[^>]*>([^<]+)</,
    /id="activity-name"[^>]*>([^<]+)</,
    /<h1[^>]*>([^<]+)<\/h1>/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1].trim().length > 5) {
      return m[1].trim()
        .replace(/_微信公众平台$/, '')
        .replace(/_微信$/, '')
        .replace(/_顶端新闻$/, '')
        .trim();
    }
  }
  return '';
}

/** HTML转纯文本（智能断行合并） */
function htmlToText(html) {
  const blockTags = ['p','div','section','article','br','h1','h2','h3','h4','h5','h6',
    'ul','ol','li','table','tr','td','blockquote','pre','hr','header','footer'];
  const blockPattern = new RegExp(`<\\/?(?:${blockTags.join('|')})[^>]*>`, 'gi');
  const inlinePattern = /<\/?(?:span|strong|em|b|i|a|font|sup|sub|u|s|mark|small|big|code|br)[^>]*>/gi;

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]+>/gi, '')
    .replace(/<mpvoice[^>]+>/gi, '')
    .replace(/<video[^>]+>/gi, '')
    .replace(/<iframe[^>]+>[\s\S]*?<\/iframe>/gi, '')
    .replace(inlinePattern, '')
    .replace(blockPattern, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 合并HTML导致的词语断裂
  const noMergeAfter = /[。，！？、：；""）\)\]]/;
  const noMergeBefore = /^[）\)\d\.]/;
  const lines = text.split('\n');
  const merged = [];
  let buf = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t) { if (buf) { merged.push(buf); buf = ''; } continue; }
    if (buf) {
      const lastChar = buf[buf.length - 1];
      const shouldMerge = !noMergeAfter.test(lastChar) && !noMergeBefore.test(t);
      if (shouldMerge) {
        buf += t;
      } else {
        merged.push(buf);
        buf = t;
      }
    } else {
      buf = t;
    }
  }
  if (buf) merged.push(buf);
  return merged.join('\n');
}

/** 从微信文章HTML提取正文 */
function parseWechatArticle(html) {
  const title = extractTitle(html);

  // 定位正文区域
  const contentPatterns = [
    /id="js_content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/,
    /id="js_content"[^>]*>([\s\S]*?)<\/div>/,
    /class="rich_media_content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>\s*){2}/,
  ];
  let contentHtml = '';
  for (const p of contentPatterns) {
    const m = html.match(p);
    if (m) { contentHtml = m[1]; break; }
  }
  if (!contentHtml) contentHtml = html;

  const text = htmlToText(contentHtml);
  return { title, text };
}

/** 从顶端新闻(topnews.cn)页面提取正文 */
function parseTopnewsArticle(html) {
  const title = extractTitle(html);

  // 顶端新闻正文通常在 <article> 或 class="article-content" 中
  const contentPatterns = [
    /class="article-content"[^>]*>([\s\S]*?)<\/div>/,
    /<article[^>]*>([\s\S]*?)<\/article>/,
    /class="content"[^>]*>([\s\S]*?)<\/div>/,
  ];
  let contentHtml = '';
  for (const p of contentPatterns) {
    const m = html.match(p);
    if (m && m[1].length > 200) { contentHtml = m[1]; break; }
  }
  if (!contentHtml) contentHtml = html;

  const text = htmlToText(contentHtml);
  return { title, text };
}

// ======================== 内容清理 ========================

function cleanArticleText(rawText) {
  let text = rawText;

  // 去顶部广告（第一个编号项之前的内容，如果只有广告图片和文字的话）
  const firstItemIdx = text.search(/\n1[）\)]/);
  if (firstItemIdx > 0) {
    const header = text.substring(0, firstItemIdx);
    const isAd = /(研究表明|购\d+支送|推荐|点击|北大博士|数据显示|颈肩腰|冯站长精选|炳济堂|诺必达)/.test(header);
    if (isAd) text = text.substring(firstItemIdx);
  }

  // 逐行广告过滤
  const adLinePatterns = [
    /^研究表明.*牙膏/,
    /^购\d+支送/,
    /^不满意全额退/,
    /^推荐.*一定要试试/,
    /^点击.*选购/,
    /^点击.*购买/,
    /^数据显示.*颈肩腰腿疼/,
    /^只靠止疼药/,
    /^冯站长精选.*老牌子/,
    /^古法熬制.*也能安心用/,
    /^贴一贴/,
    /^炳济堂/,
    /^诺必达/,
    /^粉丝专属福利/,
    /^北大博士团队/,
    /^\d+\.?\d* 元\/\d+/,
    /^\d+\.?\d*元\/\d+/,
    /^\*{3,}/,
    /^全场\d+折/,
    /^开通即赠/,
    /^年卡仅需/,
    /^海量权益/,
    /^（来源：新华/,
    /^编辑：冯站长/,
    /^播音：/,
    /^推荐阅读/,
    /^点击上方一键/,
    /^大家好，建议/,
    /^扫描.*二维码/,
    /^预览时标签/,
    /^▶\s*/,
    /^冯站长亲测定制/,
    /^每周一曲/,
    /^一日一诗/,
    /^防失联/,
    /^申请加入/,
    /^多一个备份/,
  ];

  let lines = text.split('\n');
  lines = lines.filter(line => {
    const t = line.trim();
    if (!t) return false;
    for (const p of adLinePatterns) { if (p.test(t)) return false; }
    return true;
  });

  // 去尾：来源标注之后全删
  let joined = lines.join('\n');
  const tailMarkers = [
    /\n（来源：新华/,
    /\n编辑：冯站长/,
    /\n推荐阅读/,
  ];
  for (const m of tailMarkers) {
    const match = joined.match(m);
    if (match) { joined = joined.substring(0, match.index); break; }
  }

  // 去健康板块内嵌的跨行广告
  joined = joined.replace(/[。\n]\s*数据显示[\s\S]*?(?:购买|选购)[^\n]*/g, '');

  return joined.trim();
}

/** 按板块分段 */
function splitSections(text) {
  const sectionNames = ['国内', '国际', '财经', '文教', '社会', '健康'];
  const lines = text.split('\n');
  let sectionIdx = 0;
  let currentSection = '国内';
  let sectionLines = {};
  for (const name of sectionNames) sectionLines[name] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // 检测新板块开始：每个板块以"1）"或"1)"开头
    if (/^1[）\)]/.test(t)) {
      if (sectionIdx < sectionNames.length) {
        currentSection = sectionNames[sectionIdx];
        sectionIdx++;
      }
    }

    if (sectionLines[currentSection]) {
      sectionLines[currentSection].push(t);
    }
  }

  const sections = {};
  for (const name of sectionNames) {
    if (sectionLines[name].length > 0) {
      sections[name] = sectionLines[name].join('\n');
    }
  }
  return sections;
}

/** 智能选择解析器 */
function parseArticle(html, url) {
  if (url.includes('mp.weixin.qq.com') || url.includes('weixin')) {
    return parseWechatArticle(html);
  }
  if (url.includes('topnews.cn')) {
    return parseTopnewsArticle(html);
  }
  // 通用：优先尝试微信格式，失败则回退到通用提取
  let parsed = parseWechatArticle(html);
  if (!parsed.text || parsed.text.length < 100) {
    parsed = parseTopnewsArticle(html);
  }
  return parsed;
}

// ======================== 主流程 ========================

async function main() {
  const args = process.argv.slice(2);
  let argUrl = '';
  let argDate = '';

  for (const arg of args) {
    if (arg.startsWith('--url='))  argUrl  = arg.replace('--url=', '');
    if (arg.startsWith('--date=')) argDate = arg.replace('--date=', '');
  }

  if (!argUrl) {
    console.error('用法: node DailyNews.js --url=<文章URL> [--date=YYYYMMDD]');
    console.error('URL支持微信文章(mp.weixin.qq.com)或顶端新闻(topnews.cn)');
    process.exit(1);
  }

  const dateStamp  = getDateStamp(argDate);
  const outputPath = path.join(NEWS_DIR, `${dateStamp}.json`);
  const chineseDate = getChineseDate(dateStamp);

  console.log('');
  console.log('========================================');
  console.log(`  冯站长之家 每日新闻解析`);
  console.log(`  日期: ${chineseDate} (${getWeekday(dateStamp)})`);
  console.log(`  URL:  ${argUrl}`);
  console.log(`  输出: ${outputPath}`);
  console.log('========================================\n');

  // 检查是否已获取
  if (fs.existsSync(outputPath)) {
    console.log(`✅ 今日新闻已存在: ${outputPath}`);
    return;
  }

  // 确保输出目录存在
  if (!fs.existsSync(NEWS_DIR)) fs.mkdirSync(NEWS_DIR, { recursive: true });

  // 获取文章
  console.log(`[获取] 请求文章页面...`);
  let result;
  try {
    result = await fetchPage(argUrl);
  } catch (e) {
    console.error(`❌ 获取失败: ${e.message}`);
    process.exit(1);
  }
  console.log(`[成功] 已获取 HTML (${result.html.length} bytes)`);

  // 解析
  console.log(`[解析] 提取正文...`);
  const parsed = parseArticle(result.html, argUrl);

  if (!parsed.text || parsed.text.length < 100) {
    console.error(`❌ 解析内容过短(${parsed.text.length}字)，可能被反爬拦截`);
    process.exit(1);
  }
  console.log(`[解析] 原始正文 ${parsed.text.length} 字`);

  // 清理
  console.log(`[清理] 去除广告和尾部信息...`);
  const cleanedText = cleanArticleText(parsed.text);

  // 分段
  const sections = splitSections(cleanedText);

  // 构建JSON
  const json = {
    date: dateStamp,
    title: parsed.title || `冯站长之家 ${chineseDate} 三分钟新闻早餐`,
    source: argUrl.includes('topnews.cn') ? '顶端新闻' :
            argUrl.includes('mp.weixin.qq.com') ? '微信文章' : '其他',
    url: argUrl,
    content: cleanedText,
    sections: sections,
    fetchedAt: new Date().toISOString(),
  };

  // 保存
  fs.writeFileSync(outputPath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`\n✅ 保存成功: ${outputPath}`);
  console.log(`   标题: ${json.title}`);
  console.log(`   正文: ${json.content.length} 字`);
  console.log(`   板块: ${Object.keys(json.sections).length} 个 (${Object.keys(json.sections).join(', ')})`);
}

main().catch(err => {
  console.error('严重错误:', err.message);
  process.exit(1);
});
