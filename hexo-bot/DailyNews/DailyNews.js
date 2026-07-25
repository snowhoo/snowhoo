/**
 * DailyNews.js — 每日获取冯站长之家新闻早餐
 *
 * 运行方式:
 *   node DailyNews.js                          # 自动模式（通过搜狗微信搜索找URL）
 *   node DailyNews.js --url=<微信文章URL>       # 手动指定URL
 *   node DailyNews.js --date=20260725           # 指定日期（默认今天）
 *
 * 输出: news/YYYYMMDD.json
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { URL } = require('url');

// ======================== 配置 ========================
const NEWS_DIR     = path.join(__dirname, 'news');
const COLUMN_URL   = 'https://www.jintiankansha.com/column/yLeQtrbPhc';
const WX_BIZ       = 'MzA5OTQyMDgyOQ==';  // 冯站长之家的 __biz (从搜狗搜索页获取)

// ======================== 工具函数 ========================

/** 获取8位日期戳，支持 --date 参数 */
function getDateStamp(argDate) {
  if (argDate) return argDate;
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/** 中文日期字符串 (用于搜索) */
function getChineseDate(dateStamp) {
  return `${dateStamp.slice(0, 4)}年${parseInt(dateStamp.slice(4, 6))}月${parseInt(dateStamp.slice(6, 8))}日`;
}

/** 中文简短日期 (用于搜索) */
function getShortChineseDate(dateStamp) {
  return `${parseInt(dateStamp.slice(4, 6))}月${parseInt(dateStamp.slice(6, 8))}日`;
}

/** 星期名称 */
function getWeekday(dateStamp) {
  const d = new Date(parseInt(dateStamp.slice(0,4)), parseInt(dateStamp.slice(4,6))-1, parseInt(dateStamp.slice(6,8)));
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  return weekdays[d.getDay()];
}

// ======================== HTTP 请求 ========================

/** 通用HTTP请求，支持重定向和编码检测 */
function fetchPage(url, options = {}) {
  return new Promise((resolve, reject) => {
    const maxRedirects = options.maxRedirects || 8;
    if (maxRedirects <= 0) return reject(new Error('重定向次数过多'));

    const parsed   = new URL(url);
    const client   = parsed.protocol === 'https:' ? https : http;
    const cookieStr = options.cookies || '';

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': options.referer || '',
        'Cookie': cookieStr,
      }
    };

    const req = client.request(reqOpts, (res) => {
      // 收集响应cookies
      const resCookies = (res.headers['set-cookie'] || []).map(c => c.split(';')[0]);
      const allCookies = cookieStr ? cookieStr + '; ' + resCookies.join('; ') : resCookies.join('; ');

      // 处理重定向
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return reject(new Error(`重定向无 Location: ${res.statusCode}`));
        const nextUrl = location.startsWith('http') ? location :
          location.startsWith('/') ? `${parsed.protocol}//${parsed.hostname}${location}` :
          `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${location}`;
        return fetchPage(nextUrl, { ...options, cookies: allCookies, maxRedirects: maxRedirects - 1 })
          .then(r => { r.cookies = r.cookies || allCookies; resolve(r); })
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // 优先用utf-8，GBK需要iconv-lite（可选依赖）
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        let text;
        if (contentType.includes('gbk') || contentType.includes('gb2312') || contentType.includes('gb18030')) {
          try {
            const iconv = require('iconv-lite');
            text = iconv.decode(buffer, 'gbk');
          } catch {
            text = buffer.toString('utf-8');
          }
        } else {
          text = buffer.toString('utf-8');
        }
        resolve({ html: text, cookies: allCookies, statusCode: res.statusCode, url });
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`请求超时: ${url}`)); });
    req.end();
  });
}

// ======================== URL 发现策略 ========================

/**
 * 策略1: jintiankansha专栏页 → 获取文章标题
 * 返回: { title, jksLink, dateStamp } 或 null
 */
async function findViaColumnPage(dateStamp) {
  console.log(`[策略1] 从 jintiankansha 专栏页获取文章信息...`);
  const { html } = await fetchPage(COLUMN_URL);
  const chineseDate = getChineseDate(dateStamp);
  const weekday = getWeekday(dateStamp);

  // 匹配包含日期和"三分钟新闻早餐"的链接
  const regex = /href="(http:\/\/www\.jintiankansha\.com\/t\/[^"]+)"[^>]*>([^<]*三分钟新闻早餐[^<]*)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const link = match[1];
    const title = match[2].trim();
    // 精确匹配日期
    if (title.includes(chineseDate) || title.includes(getShortChineseDate(dateStamp))) {
      console.log(`  ✓ 找到文章: ${title}`);
      console.log(`  ✓ jintiankansha链接: ${link}`);
      return { title, jksLink: link, dateStamp };
    }
  }
  console.log(`  ✗ 专栏页未找到 ${chineseDate} 的文章`);
  return null;
}

/**
 * 策略2: 搜狗微信搜索 → 发现微信文章URL
 * 搜狗返回加密代理链接，跟进可能触发反爬
 * 改进方案: 从搜狗搜索页HTML中提取搜索结果的摘要文本作为备选内容源
 */
async function findViaSogou(dateStamp) {
  console.log(`[策略2] 搜狗微信搜索...`);
  const shortDate = getShortChineseDate(dateStamp);
  const chineseDate = getChineseDate(dateStamp);
  const query = `冯站长之家 三分钟新闻早餐 ${shortDate}`;

  // 第一步: 获取搜狗首页建立session
  const homeResult = await fetchPage('https://weixin.sogou.com/');
  const homeCookies = homeResult.cookies || '';

  // 第二步: 搜索
  const searchUrl = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(query)}`;
  const searchResult = await fetchPage(searchUrl, {
    cookies: homeCookies,
    referer: 'https://weixin.sogou.com/',
  });

  const searchHtml = searchResult.html;
  const searchCookies = searchResult.cookies || '';

  // 提取搜狗代理链接
  const sogouLinks = searchHtml.match(/href="\/link\?url=[^"]+"/g);
  if (!sogouLinks || sogouLinks.length === 0) {
    console.log(`  ✗ 搜狗搜索无结果`);
    return null;
  }

  console.log(`  ✓ 搜狗返回 ${sogouLinks.length} 条结果链接`);

  // 尝试跟进每条搜狗链接（最多5条）
  for (let i = 0; i < Math.min(sogouLinks.length, 5); i++) {
    const linkHref = sogouLinks[i].match(/href="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const fullLink = 'https://weixin.sogou.com' + linkHref;

    try {
      const linkResult = await fetchPage(fullLink, {
        cookies: searchCookies,
        referer: searchUrl,
        maxRedirects: 3,
      });

      // 检查最终URL是否是微信文章
      if (linkResult.url && linkResult.url.includes('mp.weixin.qq.com')) {
        console.log(`  ✓ 获取到微信URL: ${linkResult.url}`);
        return { wxUrl: linkResult.url, source: 'sogou' };
      }

      // 检查HTML中是否有微信URL
      const wxUrlInHtml = linkResult.html.match(/mp\.weixin\.qq\.com\/s\/[A-Za-z0-9_-]+/);
      if (wxUrlInHtml) {
        const wxUrl = wxUrlInHtml[0].startsWith('http') ? wxUrlInHtml[0] : `https://${wxUrlInHtml[0]}`;
        console.log(`  ✓ HTML中发现微信URL: ${wxUrl}`);
        return { wxUrl, source: 'sogou' };
      }

      // 检查是否被反爬拦截
      if (linkResult.html.includes('antispider') || linkResult.html.includes('验证')) {
        console.log(`  ✗ 搜狗链接被反爬拦截`);
        break;  // 所有链接都会被拦截
      }

      // 检查HTML中是否有js_content（微信文章内容）
      if (linkResult.html.includes('js_content')) {
        console.log(`  ✓ 代理链接返回了微信文章内容页`);
        return { wxUrl: linkResult.url, html: linkResult.html, source: 'sogou-direct' };
      }
    } catch (e) {
      console.log(`  ✗ 跟进链接失败: ${e.message}`);
    }
  }

  console.log(`  ✗ 搜狗搜索未能获取微信URL`);
  return null;
}

// ======================== 内容提取 ========================

/** 从微信文章HTML中提取文本内容 */
function parseWechatArticle(html) {
  // 提取标题
  let title = '';
  const titlePatterns = [
    /<title[^>]*>([^<]+)<\/title>/,
    /class="rich_media_title"[^>]*>([^<]+)</,
    /id="activity-name"[^>]*>([^<]+)</,
  ];
  for (const p of titlePatterns) {
    const m = html.match(p);
    if (m && m[1].trim().length > 5) { title = m[1].trim(); break; }
  }
  // 清理标题中的网站名后缀
  title = title.replace(/_微信公众平台$/, '').replace(/_微信$/, '').trim();

  // 提取正文: js_content div
  const jsContentPatterns = [
    /id="js_content"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/,
    /id="js_content"[^>]*>([\s\S]*?)<\/div>/,
    /class="rich_media_content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/,
  ];

  let contentHtml = '';
  for (const p of jsContentPatterns) {
    const m = html.match(p);
    if (m) { contentHtml = m[1]; break; }
  }

  if (!contentHtml) {
    // 宽泛匹配: 取整个页面中最大的文本块
    console.log(`  ⚠ 未找到 js_content，尝试全页提取...`);
    contentHtml = html;
  }

  // 将HTML转为纯文本 — 按块级/行内标签区分处理
  // 块级标签 → 换行，行内标签 → 直接删除（不换行）
  const blockTags = ['p','div','section','article','br','h1','h2','h3','h4','h5','h6',
    'ul','ol','li','table','tr','td','blockquote','pre','hr','header','footer'];
  const blockPattern = new RegExp(`<\\/?(?:${blockTags.join('|')})[^>]*>`, 'gi');
  const inlinePattern = /<\/?(?:span|strong|em|b|i|a|font|sup|sub|u|s|mark|small|big|code)[^>]*>/gi;

  let textStep = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]+>/gi, '')
    .replace(/<mpvoice[^>]+>/gi, '')
    .replace(/<video[^>]+>/gi, '')
    .replace(/<iframe[^>]+>[\s\S]*?<\/iframe>/gi, '')
    .replace(inlinePattern, '')           // 行内标签直接删
    .replace(blockPattern, '\n')          // 块级标签换行
    .replace(/<[^>]+>/g, '')              // 剩余标签全删
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 合并HTML导致的词语断裂 (如 "2\n）" → "2）", "国务\n院" → "国务院")
  // 规则: 如果换行前后是中文/数字/符号(不是句末标点)，合并
  const noMergeAfter = /[。，！？、：；""）\)\]]/;   // 这些之后可以换行
  const noMergeBefore = /[【（\(\[]|^\d$/;           // 这些之前可以换行(编号开头)
  const lines = textStep.split('\n');
  const merged = [];
  let buf = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (buf) { merged.push(buf); buf = ''; } continue; }
    // 判断是否应该和前一行合并
    if (buf) {
      const lastChar = buf[buf.length - 1];
      const firstChar = trimmed[0];
      const shouldMerge = !noMergeAfter.test(lastChar) && !noMergeBefore.test(firstChar);
      if (shouldMerge) {
        buf += trimmed;
      } else {
        merged.push(buf);
        buf = trimmed;
      }
    } else {
      buf = trimmed;
    }
  }
  if (buf) merged.push(buf);
  const text = merged.join('\n');

  return { title, text };
}

/** 从普通网站HTML中提取正文 */
function parseGenericArticle(html) {
  let title = '';
  const titlePatterns = [
    /<h1[^>]*>([^<]+)<\/h1>/,
    /<title[^>]*>([^<]+)<\/title>/,
  ];
  for (const p of titlePatterns) {
    const m = html.match(p);
    if (m && m[1].trim().length > 5) { title = m[1].trim(); break; }
  }
  title = title.replace(/_.*$/, '').replace(/-.*$/, '').trim();

  // 通用提取: 去除标签取文本
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]+>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}

// ======================== 内容智能清理 ========================

/** 清理文章文本: 去广告、合并断行、去尾部推荐区 */
function cleanArticleText(rawText) {
  // --- 1. 合并HTML导致的断行 ---
  // 微信文章HTML会在数字/符号/词语间插入换行，需要合并
  let text = rawText;

  // 合并 "2\n）" → "2）" 之类的编号断行
  text = text.replace(/(\d)\n([）\)])\s*\n/g, '$1$2 ');
  // 合并句中断行（如 "国务\n院" → "国务院"）
  text = text.replace(/([^\n。，！？、：；""（）])\n([^\n\d）\)\[【])/g, '$1$2');
  // 合并引号内的断行
  text = text.replace(/([""])\n/g, '$1');

  // --- 2. 去广告块 ---
  // 顶部广告（开头到第一个编号之间）
  const firstItemIdx = text.search(/\n1[）\)]/);
  if (firstItemIdx > 0) {
    const header = text.substring(0, firstItemIdx);
    // 如果开头只有 [图片] 和广告文字，全部删除
    const isAd = /^(\s*\[图片\]\s*){0,2}(研究表明|购\d+支|推荐|点击|北大博士|数据显示|只靠止疼药|冯站长精选|古法熬制|贴一贴|炳济堂|诺必达)/.test(header);
    if (isAd) text = text.substring(firstItemIdx);
  }

  // 逐行广告过滤
  const adPatterns = [
    /^研究表明.*牙膏.*抑制率/,
    /^购\d+支送/,
    /^不满意全额退/,
    /^推荐.*一定要试试/,
    /^点击.*选购/,
    /^数据显示.*颈肩腰腿疼/,
    /^只靠止疼药.*治标不治本/,
    /^冯站长精选.*老牌子/,
    /^古法熬制.*也能安心用/,
    /^贴一贴舒缓放松/,
    /^炳济堂/,
    /^诺必达/,
    /^粉丝专属福利/,
    /^\*{3,}/,
    /^北大博士团队/,
    /\[图片\]\s*$/,
  ];

  let lines = text.split('\n');
  lines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    for (const p of adPatterns) {
      if (p.test(trimmed)) return false;
    }
    return true;
  });

  // --- 3. 去尾部推荐区 ---
  // 健康板块结束后，后面是来源标注、推荐阅读、客服信息等
  // 先将整段合并为一个字符串，方便正则匹配跨行模式
  let joined = lines.join('\n');

  // 去尾部: 从"（来源：新华"或"编辑："开始到末尾
  const footerStartPatterns = [
    /\n（来源：新华/,
    /\n编辑：冯站长/,
    /\n推荐阅读/,
    /\n点击上方一键关注/,
    /\n大家好，建议/,
    /\n预览时标签不可点/,
    /\n防失联/,
    /\n冯站长亲测/,
    /\n▶\s*冯站长/,
  ];
  for (const p of footerStartPatterns) {
    const m = joined.match(p);
    if (m) { joined = joined.substring(0, m.index); break; }
  }

  // 去健康板块内嵌广告（跨多行的广告块）
  joined = joined.replace(/数据显示[\s\S]*?点击[^\n]*购买/g, '');
  joined = joined.replace(/数据显示[\s\S]*?点击[^\n]*选购/g, '');

  // 逐行去残余广告碎片
  const trailingAdPatterns = [
    /^数据显示/,
    /^颈肩腰腿疼人群/,
    /^只靠止疼药/,
    /^冯站长精选/,
    /^传承\d+年的/,
    /^古法熬制/,
    /^专为颈肩/,
    /^颈椎僵硬/,
    /^贴一贴/,
    /^舒缓放松/,
    /^温和渗透/,
    /^老人.*敏感肌/,
    /^粉丝专属福利/,
    /^\d+\.?\d+ 元/,
    /^99\.9 元/,
    /^199\.9 元/,
    /^点击$/,
    /^购买$/,
    /^\*{3,}/,
  ];
  lines = joined.split('\n').filter(line => {
    const t = line.trim();
    if (!t) return false;
    for (const p of trailingAdPatterns) { if (p.test(t)) return false; }
    return true;
  });

  return lines.join('\n').trim();
}

/** 按板块分段 (国内/国际/财经/文教/社会/健康) */
function splitSections(text) {
  const sectionMap = {
    '国内':   /^1[）\)]\s*.*(?:国务院|农业农村|交通运输|住建|法治|军事|港澳|台湾)/m,
    '国际':   /^1[）\)]\s*.*(?:习近平|王毅|外交部|商务部|特朗普|伊朗|俄罗斯|欧盟)/m,
    '财经':   /^1[）\)]\s*.*(?:财政部|央行|证监会|收盘)/m,
    '文教':   /^1[）\)]\s*.*(?:图书|近视|科研|票房|故宫|封面)/m,
    '社会':   /^1[）\)]\s*.*(?:消协|台风|港口|倒伏|景区|口岸|天气)/m,
    '健康':   /^1[）\)]\s*.*(?:中医|姜|晒|腐乳|膳食)/m,
  };

  // 简化: 用编号行来分段
  // 格式: "1）xxx" 或 "1)xxx" 是每个板块的第一条
  // 板块之间用 [法治] [军事] [港澳] [台湾] 等标记

  const sections = {};
  const lines = text.split('\n');
  let currentSection = '综合';

  // 识别板块的大致规律:
  // 国内板块: 第一个"1）"开头的内容，通常提到国务院/部委
  // 国际板块: 第二个"1）"开头的内容，通常提到外交
  // 财经板块: 第三个"1）"开头的内容
  // 文教板块: 第四个"1）"
  // 社会板块: 第五个"1）"
  // 健康板块: 最后的养生内容

  let sectionIdx = 0;
  const sectionNames = ['国内', '国际', '财经', '文教', '社会', '健康'];
  let sectionLines = {};

  for (const name of sectionNames) sectionLines[name] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 检测新板块开始 (编号"1）"或"1)")
    if (/^[1]）|^[1]\)/.test(trimmed)) {
      if (sectionIdx < sectionNames.length) {
        currentSection = sectionNames[sectionIdx];
        sectionIdx++;
      }
    }

    // 检测子板块标记
    if (/^\[法治\]/.test(trimmed)) currentSection = '国内·法治';
    if (/^\[军事\]/.test(trimmed)) currentSection = '国内·军事';
    if (/^\[港澳\]/.test(trimmed)) currentSection = '国内·港澳';
    if (/^\[台湾\]/.test(trimmed)) currentSection = '国内·台湾';

    // 添加到当前板块
    const baseName = currentSection.split('·')[0];
    if (sectionLines[baseName]) {
      sectionLines[baseName].push(trimmed);
    }
  }

  // 合并为文本
  for (const name of sectionNames) {
    if (sectionLines[name].length > 0) {
      sections[name] = sectionLines[name].join('\n');
    }
  }

  return sections;
}

// ======================== 主流程 ========================

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  let argUrl = '';
  let argDate = '';

  for (const arg of args) {
    if (arg.startsWith('--url='))  argUrl  = arg.replace('--url=', '');
    if (arg.startsWith('--date=')) argDate = arg.replace('--date=', '');
  }

  const dateStamp  = getDateStamp(argDate);
  const outputPath = path.join(NEWS_DIR, `${dateStamp}.json`);
  const chineseDate = getChineseDate(dateStamp);

  console.log('');
  console.log('========================================');
  console.log(`  冯站长之家 每日新闻获取`);
  console.log(`  日期: ${chineseDate} (${getWeekday(dateStamp)})`);
  console.log(`  输出: ${outputPath}`);
  console.log('========================================');
  console.log('');

  // 检查是否已获取
  if (fs.existsSync(outputPath)) {
    console.log(`✅ 今日新闻已存在: ${outputPath}`);
    const existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    console.log(`   标题: ${existing.title}`);
    return;
  }

  // 确保输出目录存在
  if (!fs.existsSync(NEWS_DIR)) fs.mkdirSync(NEWS_DIR, { recursive: true });

  // ===== URL 发现 =====
  let articleUrl = argUrl;
  let articleTitle = '';
  let sourceName = '';

  if (!articleUrl) {
    // 自动发现URL

    // 策略1: jintiankansha专栏页
    let columnInfo = null;
    try {
      columnInfo = await findViaColumnPage(dateStamp);
      if (columnInfo) {
        articleTitle = columnInfo.title;
        console.log(`  从专栏页获取标题: ${articleTitle}`);
      }
    } catch (e) {
      console.log(`  ✗ 专栏页获取失败: ${e.message}`);
    }

    // 策略2: 搜狗微信搜索
    try {
      const sogouResult = await findViaSogou(dateStamp);
      if (sogouResult) {
        if (sogouResult.wxUrl) {
          articleUrl = sogouResult.wxUrl;
          sourceName = '搜狗微信搜索';
          console.log(`  ✓ 通过搜狗获取URL: ${articleUrl}`);
        }
        // 如果搜狗直接返回了微信文章HTML (代理链接跳转成功)
        if (sogouResult.html && sogouResult.html.includes('js_content')) {
          console.log(`  ✓ 搜狗直接返回了文章内容`);
          const parsed = parseWechatArticle(sogouResult.html);
          const cleanedText = cleanArticleText(parsed.text);
          const sections = splitSections(cleanedText);

          const result = {
            date: dateStamp,
            title: articleTitle || parsed.title || `冯站长之家 ${chineseDate} 三分钟新闻早餐`,
            source: sourceName || '搜狗代理',
            url: sogouResult.wxUrl || sogouResult.url || '',
            content: cleanedText,
            sections: sections,
            fetchedAt: new Date().toISOString(),
          };

          fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
          console.log(`\n✅ 成功保存: ${outputPath}`);
          console.log(`   标题: ${result.title}`);
          console.log(`   内容: ${result.content.length} 字`);
          return;
        }
      }
    } catch (e) {
      console.log(`  ✗ 搜狗搜索失败: ${e.message}`);
    }

    // 如果自动发现失败
    if (!articleUrl) {
      console.log('');
      console.log('❌ 自动URL发现失败，请手动提供微信文章URL:');
      console.log(`   node DailyNews.js --url=https://mp.weixin.qq.com/s/XXXXX`);
      console.log('');
      console.log('💡 提示: 可以在微信中打开冯站长之家文章，复制链接后传入');
      if (articleTitle) {
        console.log(`   今天文章标题: ${articleTitle}`);
      }
      process.exit(1);
    }
  } else {
    console.log(`  使用手动提供的URL: ${articleUrl}`);
    sourceName = '手动输入';
  }

  // ===== 内容获取 =====
  console.log(`\n[获取] 从 ${articleUrl} 获取文章内容...`);

  let html;
  try {
    const result = await fetchPage(articleUrl);
    html = result.html;
  } catch (e) {
    console.error(`❌ 获取文章失败: ${e.message}`);
    process.exit(1);
  }

  // ===== 内容解析 =====
  console.log('[解析] 提取文章内容...');
  const parsed = parseWechatArticle(html);

  if (!parsed.text || parsed.text.length < 100) {
    console.error(`❌ 解析内容过短或为空 (${parsed.text.length} 字)`);
    console.log('   可能是微信反爬导致内容不可用，请尝试:');
    console.log('   1. 在浏览器中打开URL，确认文章可正常访问');
    console.log('   2. 重新复制微信文章链接');
    process.exit(1);
  }

  // ===== 内容清理 =====
  const cleanedText = cleanArticleText(parsed.text);
  const sections = splitSections(cleanedText);

  // ===== 构建并保存JSON =====
  const result = {
    date: dateStamp,
    title: articleTitle || parsed.title || `冯站长之家 ${chineseDate} 三分钟新闻早餐`,
    source: sourceName,
    url: articleUrl,
    content: cleanedText,
    sections: sections,
    fetchedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n✅ 成功保存: ${outputPath}`);
  console.log(`   标题: ${result.title}`);
  console.log(`   内容: ${result.content.length} 字`);
  console.log(`   板块: ${Object.keys(result.sections).join(', ')}`);
}

main().catch(err => {
  console.error('严重错误:', err.message);
  process.exit(1);
});
