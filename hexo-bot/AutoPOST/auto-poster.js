/**
 * Hexo 自动评论发布器
 * 每天 02:00 执行：
 *   1. 从网络抓取 sitemap
 *   2. 从 sitemap 仅保留 html 内容页（排除 json 等非 html 资源），随机选取 3 篇
 *   3. 支持配置：randomRangeMode=1 全局 / =2 仅从 randomList 抽取（见 auto-poster.config.json）
 *   3. 生成评论内容（昵称 + 评论 + 完整 URL）
 *   4. 写入 daily-comment-schedule.json（包含全部所需数据）
 *   5. 创建 3 个一次性 Windows 计划任务，到点调用 comment-executor.js 发出预生成评论
 *
 * 计划任务命名：Hexo-Bot\AutoPost_Task_{1,2,3}
 * comment-executor.js 只负责读预生成数据并发出，不做任何解析或匹配
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// ============== 路径配置 ==============
const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');
const EXECUTOR_SCRIPT = path.join(__dirname, 'comment-executor.js');
const TASK_FOLDER = 'Hexo-Bot';
const SITEMAP_URL = 'https://snowhoo.net/sitemap.xml';
const CONFIG_FILE = path.join(__dirname, 'auto-poster.config.json');

// ============== 配置文件说明 ==============
// auto-poster.config.json:
//   randomRangeMode: 1 = 全局（所有 html 内容页随机）；2 = 仅从 randomList 抽取
//   randomList: 模式2下列表的条目，可为
//      · slug（如 20260622133140）
//      · 相对路径（如 2026/06/22/20260622133140 或 js/sevencolor/4/4.html）
//      · 完整 URL（如 https://snowhoo.net/2026/06/22/20260622133140/）
//   dailyCount: 每天生成的评论条数（默认 3，不足候选数时按实际数量）
//   articleMode: true = 文章级模式（按文章独立评论）；false = 关闭
//   articleSources: 文章级模式下的文章来源页，可选 reader / yedu / zjsz
//       各页唯一 key：reader=posts.json 文件名 / yedu=index.json 文件名 / zjsz=data.js 标题
//       机器人发的 url 字段值与页面端 Waline path 选项完全一致，线程自动对齐
//   ★ 文章级 + 页面级合并进同一候选池：articleSources 提供多文页的文章级候选，
//     randomList(模式2)/全局(模式1) 提供单页的页面级候选；页面级会自动排除已被
//     文章级覆盖的来源页（reader/yedu/zjsz 整页），避免重复发评论。

// 显式非 html 资源扩展名（一律排除，不进入随机范围）
const NON_HTML_EXT = ['.json', '.xml', '.txt', '.css', '.js', '.png', '.jpg', '.jpeg',
  '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.map', '.webp', '.mp3', '.mp4', '.pdf'];
// 系统/聚合页路径片段（排除）
const SYS_PATH_FRAGMENTS = ['/tags/', '/categories/', '/link/', '/guestbook/', '/about/',
  '/archives/', '/hotnews/', '/robots.txt', '/index.html', '生成文章'];

function loadConfig() {
  const cfg = { randomRangeMode: 1, randomList: [], dailyCount: 3, articleMode: false, articleSources: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    if (typeof parsed.randomRangeMode === 'number') cfg.randomRangeMode = parsed.randomRangeMode;
    if (Array.isArray(parsed.randomList)) {
      cfg.randomList = parsed.randomList.map(s => String(s).trim()).filter(Boolean);
    }
    if (typeof parsed.dailyCount === 'number' && parsed.dailyCount >= 1) {
      cfg.dailyCount = Math.floor(parsed.dailyCount);
    }
    if (typeof parsed.articleMode === 'boolean') cfg.articleMode = parsed.articleMode;
    if (Array.isArray(parsed.articleSources)) {
      cfg.articleSources = parsed.articleSources.map(s => String(s).trim().toLowerCase()).filter(Boolean);
    }
  } catch (e) {
    console.log('[AutoPoster] 未读取到配置，使用默认（全局模式）');
  }
  return cfg;
}

// 判断一个 sitemap URL 是否为可评论的 html 内容页
function isEligibleArticle(locDecoded) {
  const lower = locDecoded.toLowerCase();
  if (NON_HTML_EXT.some(ext => lower.endsWith(ext))) return false;          // json/xml/资源排除
  if (SYS_PATH_FRAGMENTS.some(frag => lower.includes(frag))) return false;  // 系统/聚合页排除
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return true;       // 显式 html 页
  if (/\/20\d{2}\/\d{2}\/\d{2}\/.+/.test(lower)) return true;              // 日期型文章目录（底层 index.html）
  return false;
}

// 归一化匹配键：小写、去协议+域名、去首尾斜杠、去 .html 后缀
function normalizeKey(s) {
  return s.toLowerCase()
    .replace(/^https?:\/\/[^/]+/, '')   // 去协议+域名（支持填完整 URL）
    .replace(/^[\\/]+/, '')
    .replace(/[\\/]+$/, '')
    .replace(/\.html?$/i, '');
}

// 模式2：从全局文章池中筛选 randomList 命中的条目
function filterByList(articles, list) {
  const keys = list.map(normalizeKey);
  return articles.filter(a => {
    const cands = [normalizeKey(a.url), normalizeKey(a.slug)];
    return cands.some(c => keys.includes(c));
  });
}

// ============== 文章级评论：从页面数据源拉取文章列表 ==============
// 每篇文章的“线程 path”必须与前端保持一致：
//   reader -> /app_n/reader.html?a=<filename 明文，仅转义 ?#&%>
//   yedu   -> /app_n/yedu_p.html?a=<fileList[i] 明文，仅转义 ?#&%>
//   zjsz   -> /app_n/zjsz_p.html?a=<title 明文，仅转义 ?#&%>
// 该 path 即 Waline 的评论线程标识（页面端 path 选项 / 机器人端 url 字段共用同一值）。
const ARTICLE_SOURCE_URL = {
  reader: 'https://snowhoo.net/posts.json',
  yedu: 'https://snowhoo.net/js/sevencolor/1/yedu_data/index.json',
  zjsz: 'https://snowhoo.net/js/sevencolor/1/zjsz_data/data.js'
};

// yedu/reader 文章路径用文件名（无中文），encodeURIComponent 即可
function encKey(s) {
  return encodeURIComponent(String(s));
}
// zjsz 文章标题含中文，必须用明文（仅转义会破坏 URL 的 ?#&%），
// 才能与浏览器地址栏的明文 ?a=中文 对上、把评论挂到对应文章
function rawKey(s) {
  return String(s).replace(/[?#&%]/g, c => ({ '#':'%23','?':'%3F','&':'%26','%':'%25' }[c]));
}

// 文章级来源对应的“整页”路径：页面级抽取时据此去重，避免对 reader/yedu/zjsz 整页重复发评论
const ARTICLE_SOURCE_PAGE = {
  reader: '/app_n/reader.html',
  yedu: '/app_n/yedu_p.html',
  zjsz: '/app_n/zjsz_p.html'
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}
function fetchJSON(url) {
  return fetchText(url).then(t => JSON.parse(t));
}

async function fetchArticlePool(sources) {
  const out = [];
  for (const s of sources) {
    try {
      if (s === 'reader') {
        const names = await fetchJSON(ARTICLE_SOURCE_URL.reader);
        (names || []).forEach(fn => {
          if (/\.md$/i.test(fn)) out.push({ page: 'reader', title: fn, url: '/app_n/reader.html?a=' + encKey(fn) });
        });
      } else if (s === 'yedu') {
        const list = await fetchJSON(ARTICLE_SOURCE_URL.yedu);
        (list || []).forEach(fn => {
          out.push({ page: 'yedu', title: fn, url: '/app_n/yedu_p.html?a=' + encKey(fn) });
        });
      } else if (s === 'zjsz') {
        const txt = await fetchText(ARTICLE_SOURCE_URL.zjsz);
        const m = txt.match(/var ARTICLE_DATA\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (m) {
          const data = JSON.parse(m[1]);
          (data || []).forEach(a => {
            if (a && a.title) out.push({ page: 'zjsz', title: a.title, url: '/app_n/zjsz_p.html?a=' + rawKey(a.title) });
          });
        }
      }
    } catch (e) {
      console.log('[AutoPoster] 拉取文章源 ' + s + ' 失败: ' + e.message);
    }
  }
  return out;
}

// ============== 昵称生成 ==============
function generateNickname() {
  const styles = [
    () => {
      const surnames = ['苏', '林', '江', '顾', '沈', '叶', '陆', '程', '方', '宋', '秦', '白', '夏', '周', '柳', '穆', '谢', '许', '何'];
      const names = ['念瑾', '沐晴', '挽棠', '清欢', '锦书', '知意', '南栀', '北辰', '西洲', '东篱', '安然', '夏安', '冬蕴', '春晓', '秋白', '星河', '云深', '鹿鸣', '鹤归', '蝉噪', '晚舟', '归鸿', '落梅', '听雨', '临渊'];
      const suffixes = ['', '呀', '呢', '的', '~', '…', '·'];
      return surnames[Math.floor(Math.random() * surnames.length)] + names[Math.floor(Math.random() * names.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    () => {
      const prefixes = ['一只', '可爱', '路过', '睡不醒', '馋嘴', '炸毛', '发呆', '流浪', '小', '迷你', '霸道', '软糯', '活泼', '迷糊', '贪玩'];
      const animals = ['猫', '狗', '兔', '熊', '狐狸', '松鼠', '刺猬', '仓鼠', '龙猫', '水獭', '小鹿', '猪猪', '老虎', '狮子'];
      const suffixes = ['', '子', '酱', '呀', '～', 'です', '~'];
      return prefixes[Math.floor(Math.random() * prefixes.length)] + animals[Math.floor(Math.random() * animals.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    () => {
      const adjs = ['孤独', '温暖', '明媚', '忧伤', '灿烂', '静谧', '缱绻', '清冽', '柔软', '澄澈', '薄凉', '热烈', '微醺', '薄荷', '清欢', '安然', '惆怅', '悠然', '寂寥', '烂漫'];
      const nouns = ['旅人', '过客', '行者', '归人', '远山', '近水', '月光', '日光', '星子', '尘埃', '落叶', '飞花', '烟雨', '流云', '晚风', '晨曦', '孤鸿', '游鱼', '飞鸟', '落霞'];
      return adjs[Math.floor(Math.random() * adjs.length)] + nouns[Math.floor(Math.random() * nouns.length)];
    },
    () => {
      const fronts = ['今天', '明天', '昨天', '每天', '此刻', '此时', '蓦然', '忽然', '恍然', '欣然'];
      const actions = ['想起', '念起', '记起', '遇见', '重温', '想起那年', '路过', '驻足', '发呆', '沉默'];
      const suffixes = ['', '…', '~', '的'];
      return fronts[Math.floor(Math.random() * fronts.length)] + actions[Math.floor(Math.random() * actions.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    () => {
      const anonymous = ['匿名用户', '路人甲', '路过打酱油', '悄悄路过', '打个酱油~', '路过的', '云游至此', '偶然路过', '随便看看', '晃悠路过'];
      return anonymous[Math.floor(Math.random() * anonymous.length)];
    },
  ];
  return styles[Math.floor(Math.random() * styles.length)]();
}

// ============== 根据 URL 类型生成情境化评论 ==============
// 说明：app_n 等应用页的 slug 是英文/拼音（tv / yedu / reader / zjsz / daliynews / app），
// 无法靠中文关键词命中，因此先按英文 token 识别页面性质，再退化到博客文章的中文关键词匹配。
function generateComment(articleUrl) {
  const url = articleUrl.toLowerCase();

  // —— 应用页（app_n，slug 为英文/拼音，需用 token 识别）——
  const isVideo = /(^|\/)tv(_p)?\.html|播霸|影视|视频|电影|剧|纪录片|综艺|短剧/.test(url);
  const isAppMain = /(^|\/)app\.html|修真小世界|小世界|修炼/.test(url);
  const isReader = /reader|小红故事|故事|小说|短篇/.test(url);
  const isNightReadApp = /yedu|夜读|晚安|入睡|睡前|今夜|今晚|夜语/.test(url);
  const isCity = /zjsz|照见苏州|苏州|城市|江南/.test(url);
  const isNews = /daliynews|news|新闻|资讯|日报|早报/.test(url);

  // —— 博客文章（slug 多为中文关键词）——
  const isPoetry = /[诗|词|曲|赋|颂|歌行|古风]/.test(url);
  const isQuote = /名言|语录|daily-quote|金句/.test(url) || /——/.test(url);
  const isTech = /技术|编程|代码|教程|前端|后端|系统|架构|算法|开源|框架/.test(url);
  const isEmotion = /情感|心情|随笔|感悟|温柔|感动|想念|爱|悲伤|难过|快乐|幸福|治愈|疗伤/.test(url);
  const isWork = /劳动|工作|职场|加班|上班|奋斗|拼搏/.test(url);
  const isHoliday = /节|假|日/.test(url) && !isTech && !isEmotion && !isWork;
  const isNature = /四季|春天|夏日|秋风|冬雪|山川|河流|草木|花开|叶落|风景/.test(url);
  const isHistory = /年|历史|岁月|时光|年代|那些年|那年/.test(url);
  const isBook = /书|读后|读《|·《|读书|阅读/.test(url);

  const REACTIONS = {
    // 影视/视频：绝对不能出现“写的真棒”之类阅读向措辞
    video: ['这个片子不错', '看完很过瘾', '影视区常客了', '这片子有点东西', '已收藏，回头二刷', '氛围感拉满', '看完意犹未尽', '导演有点东西', '演技在线', '剧情挺抓人的'],
    // 主应用（修真小世界）
    app: ['这个小世界真有意思', '又来打卡了', '每天都会打开看看', '修炼一下', '界面越来越顺手了', '功能越来越丰富了', '默默支持', '路过冒个泡', '玩得停不下来', '已安利给朋友'],
    // 故事/小说
    reader: ['这个故事好看', '追更中', '看完心里暖暖的', '故事写得很动人', '主角太可爱了', '催更！', '一口气读完了', '意犹未尽', '期待下一篇', '文笔真好'],
    // 夜读
    nightRead: ['夜读时光，最安静', '睡前读到，很治愈', '每晚必看这个栏目', '温暖的声音', '喜欢', '谢谢分享', '陪你入睡'],
    // 城市/苏州
    city: ['苏州真美', '想去走走', '江南韵味十足', '照片拍得真好', '人间烟火气', '小桥流水让人安心', '城市的故事真动人', '看完很治愈'],
    // 新闻/资讯
    news: ['关注了', '资讯很及时', '这个要转发', '得空细看', '谢谢播报', '最新动态不错', '已收藏', '信息量挺大'],
    // 诗词
    poetry: ['这句诗太美了', '意境真好', '好有诗意', '词穷了，只能说太美', '读来唇齿生香', '这意境让人沉醉', '古人的智慧，穿越千年依然打动人心', '这句要记下来', '越读越有味'],
    // 名言/金句
    quote: ['说得真好', '收藏了', '说到心坎里去了', '很有道理', '值得细细品味', '送给自己，也送给你', '这碗鸡汤我干了', '深有感触', '记下来了，共勉'],
    // 技术
    tech: ['学到了', '收藏了', '干货满满', '已关注', '很实用', '感谢分享', '这个思路很棒', '正需要这个', '解决了我的问题'],
    // 情感
    emotion: ['被戳中了', '好感人', '看哭了', '好温暖', '说得就是我', '感同身受', '想起很多事情', '文字有力量', '好共鸣', '我也经常这样想'],
    // 劳动/工作
    work: ['劳动最光荣', '奋斗最幸福', '辛苦了', '加油', '致敬每一个努力的人', '说得太对了'],
    // 节日
    holiday: ['节日快乐', '同乐同乐', '祝福收到', '涨知识了', '原来如此', '写得真好'],
    // 自然
    nature: ['好美', '让人心旷神怡', '好想出去走走', '风景如画', '大自然的美好', '让人平静', '写得很美'],
    // 历史
    history: ['时光匆匆', '岁月如梭', '怀念', '感慨万千', '读来很有感触', '时光一去不复返'],
    // 读书
    book: ['这本书我也想读', '读后感写得真好', '被种草了', '收藏了', '谢谢推荐'],
    // 兜底：仅用中性、不暗示“阅读/写作”的措辞，适配任意媒体
    generic: ['来支持一下', '打卡', '路过~冒个泡', '👍', '收藏了', '赞', '常来看看', '顶一个', '很不错', '来看看了']
  };

  let pool;
  if (isVideo) pool = REACTIONS.video;
  else if (isAppMain) pool = REACTIONS.app;
  else if (isReader) pool = REACTIONS.reader;
  else if (isNightReadApp) pool = REACTIONS.nightRead;
  else if (isCity) pool = REACTIONS.city;
  else if (isNews) pool = REACTIONS.news;
  else if (isPoetry) pool = REACTIONS.poetry;
  else if (isQuote) pool = REACTIONS.quote;
  else if (isTech) pool = REACTIONS.tech;
  else if (isEmotion) pool = REACTIONS.emotion;
  else if (isWork) pool = REACTIONS.work;
  else if (isHoliday) pool = REACTIONS.holiday;
  else if (isNature) pool = REACTIONS.nature;
  else if (isBook) pool = REACTIONS.book;
  else if (isHistory) pool = REACTIONS.history;
  else pool = REACTIONS.generic;

  return pool[Math.floor(Math.random() * pool.length)];
}

// ============== Fisher-Yates 洗牌 ==============
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(arr, count) {
  return shuffle(arr).slice(0, count);
}

// ============== 生成随机时间（06:00 - 23:00，精确到秒）==============
function generateRandomTimes(count) {
  const times = [];
  const MIN_HOUR = 6;
  const MAX_HOUR = 23;

  for (let i = 0; i < count; i++) {
    const minSeconds = MIN_HOUR * 3600;
    const maxSeconds = MAX_HOUR * 3600 - 1;
    const randomSeconds = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;

    const hour = Math.floor(randomSeconds / 3600);
    const minute = Math.floor((randomSeconds % 3600) / 60);
    const second = randomSeconds % 60;

    const label = hour.toString().padStart(2, '0') + ':' +
                  minute.toString().padStart(2, '0') + ':' +
                  second.toString().padStart(2, '0');

    times.push({ hour, minute, second, label });
  }

  times.sort((a, b) => {
    const aSec = a.hour * 3600 + a.minute * 60 + a.second;
    const bSec = b.hour * 3600 + b.minute * 60 + b.second;
    return aSec - bSec;
  });

  return times;
}

// ============== 创建 Windows 计划任务 ==============
function createWindowsTask(hour, minute, second, taskIndex) {
  const dateStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).split(' ')[0];

  const timeStr = hour.toString().padStart(2, '0') + ':' +
                  minute.toString().padStart(2, '0') + ':' +
                  second.toString().padStart(2, '0');

  const dateParts = dateStr.split('-');
  const formattedDate = dateParts[0] + '/' + dateParts[1].padStart(2, '0') + '/' + dateParts[2].padStart(2, '0');

  const taskName = 'AutoPost_Task_' + taskIndex;

  console.log('[AutoPoster] 创建计划任务: ' + TASK_FOLDER + '\\' + taskName + ' 于 ' + dateStr + ' ' + timeStr);

  // PowerShell 脚本内容
  const psScript = [
    '$ErrorActionPreference = "Stop"',
    '$nodeExe = "C:\\Program Files\\nodejs\\node.exe"',
    '$scriptPath = "' + EXECUTOR_SCRIPT.replace(/\\/g, '\\\\') + '"',
    '$argStr = "--taskIndex=' + taskIndex + '"',
    '$act = New-ScheduledTaskAction -Execute $nodeExe -Argument ($scriptPath + " " + $argStr)',
    '$trig = New-ScheduledTaskTrigger -Once -At "' + formattedDate + ' ' + timeStr + '"',
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    'Unregister-ScheduledTask -TaskName "' + taskName + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Confirm:$false -ErrorAction SilentlyContinue',
    'Register-ScheduledTask -TaskName "' + taskName + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Action $act -Trigger $trig -Settings $settings -Description "Hexo AutoPost ' + taskIndex + '" | Out-Null',
    'Write-Output "OK"'
  ].join('\n');

  const psFile = path.join(__dirname, '_temp_task_' + taskIndex + '.ps1');
  fs.writeFileSync(psFile, '\ufeff' + psScript, 'utf8');

  try {
    const output = execSync('powershell -ExecutionPolicy Bypass -NoProfile -File "' + psFile + '"', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000
    });
    const outStr = (output || '').toString();
    if (outStr.includes('OK')) {
      console.log('[AutoPoster] 任务创建成功');
      return true;
    }
    console.log('[AutoPoster] 任务创建失败: ' + outStr.trim());
    return false;
  } catch (e) {
    const errMsg = ((e.stderr || e.stdout || e.message || '').toString() || '').trim();
    console.log('[AutoPoster] 任务创建失败: ' + (errMsg || '未知错误'));
    return false;
  } finally {
    try { fs.unlinkSync(psFile); } catch (e) {}
  }
}

// ============== 从 Sitemap 获取已发布文章列表 ==============
function fetchSitemapArticles() {
  return new Promise((resolve, reject) => {
    console.log('[AutoPoster] 正在从网络获取 Sitemap...');
    https.get(SITEMAP_URL, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        const articles = [];
        const locs = d.match(/<loc>[^<]*<\/loc>/gi) || [];
        locs.forEach(l => {
          const locMatch = l.match(/<loc>([^<]*)<\/loc>/i);
          if (!locMatch) return;
          const loc = locMatch[1].trim();

          // 仅保留可发布评论的 html 内容页；排除 json 等非 html 资源及系统/聚合页
          const locDecoded = decodeURIComponent(loc);
          if (!isEligibleArticle(locDecoded)) {
            return;
          }

          try {
            const urlObj = new URL(loc);
            const pathPart = urlObj.pathname;
            const cleanPath = pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart;
            const parts = cleanPath.split('/');
            const slug = parts[parts.length - 1];

            if (slug) {
              // html 文件不加尾斜杠；日期型文章目录（底层 index.html）补尾斜杠
              const isHtmlFile = /\.html?$/i.test(cleanPath);
              articles.push({
                slug: slug,
                url: isHtmlFile ? cleanPath : cleanPath + '/',
                title: slug
              });
            }
          } catch (e) {
            // ignore parse error
          }
        });

        console.log('[AutoPoster] Sitemap 获取完成，共 ' + articles.length + ' 篇文章');
        resolve(articles);
      });
    }).on('error', reject);
  });
}

// ============== 主流程 ==============
async function runAutoPoster() {
  console.log('[AutoPoster] ========== Hexo 自动评论发布器 ==========');
  console.log('[AutoPoster] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  // 1. 从网络抓取 sitemap，获取已发布文章列表（已过滤 json 等非 html 资源）
  const sitemapArticles = await fetchSitemapArticles();

  // 文章级模式不依赖 sitemap 数量；仅全局/列表模式需要 sitemap 文章数充足
  const config0 = loadConfig();
  const isArticleMode = !!(config0.articleMode && config0.articleSources && config0.articleSources.length);
  if (!isArticleMode && sitemapArticles.length < 3) {
    console.log('[AutoPoster] Sitemap 文章数量不足（' + sitemapArticles.length + '），跳过');
    return;
  }

  // 读取配置，确定随机范围
  const config = loadConfig();

  // 候选池组装：文章级（多文页，按文章独立评论）+ 页面级（单页，按整页评论）
  // 两种来源合并进同一池子；页面级会排除已被文章级覆盖的来源页，避免对 reader/yedu/zjsz 整页重复发评论
  let pool = [];

  // 1) 文章级模式：从各页面数据源拉取文章
  if (config.articleMode && config.articleSources && config.articleSources.length) {
    const articlePool = await fetchArticlePool(config.articleSources);
    if (articlePool.length >= 1) {
      pool = pool.concat(articlePool);
      console.log('[AutoPoster] 文章级模式，候选 ' + articlePool.length + ' 篇（来源: ' + config.articleSources.join(',') + '）');
    } else {
      console.log('[AutoPoster] 文章级候选为空');
    }
  }

  // 2) 页面级：列表模式(randomRangeMode=2) 从 randomList 抽取；全局模式(=1) 取全部 sitemap
  //    排除已被文章级覆盖的来源页，避免把 reader/yedu/zjsz 整页又发一遍
  const coveredPages = (config.articleSources || [])
    .map(s => ARTICLE_SOURCE_PAGE[s])
    .filter(Boolean)
    .map(p => normalizeKey(p));
  const isCoveredPage = (a) => coveredPages.includes(normalizeKey(a.url));

  let pageLevel = [];
  if (config.randomRangeMode === 2) {
    pageLevel = filterByList(sitemapArticles, config.randomList);
    console.log('[AutoPoster] 页面级(列表)初筛 ' + pageLevel.length + ' 篇');
  } else {
    pageLevel = sitemapArticles.slice();
    console.log('[AutoPoster] 页面级(全局)初筛 ' + pageLevel.length + ' 篇');
  }
  const pageLevelFiltered = pageLevel.filter(a => !isCoveredPage(a));
  if (pageLevelFiltered.length !== pageLevel.length) {
    console.log('[AutoPoster] 已排除文章级覆盖页 ' + (pageLevel.length - pageLevelFiltered.length) + ' 篇');
  }
  pool = pool.concat(pageLevelFiltered);
  console.log('[AutoPoster] 页面级(去重后)候选 ' + pageLevelFiltered.length + ' 篇');

  if (pool.length < 1) {
    console.log('[AutoPoster] 候选池为空，跳过');
    return;
  }

  // 2. 随机选文章（按 dailyCount，不足候选数时按实际数量）
  const count = Math.min(config.dailyCount, pool.length);
  const selectedArticles = pickRandom(pool, count);
  console.log('[AutoPoster] 每日条数=' + config.dailyCount + '，选中 ' + selectedArticles.length + ' 篇文章');

  // 3. 生成随机时间（06:00-23:00，精确到秒）
  const randomTimes = generateRandomTimes(count);

  // 4. 构建 schedule，每条包含预生成的完整数据
  const schedule = [];
  for (let i = 0; i < count; i++) {
    const article = selectedArticles[i];
    const time = randomTimes[i];
    const nickname = generateNickname();
    // 生成评论（用 URL 中的关键词判断类型）
    const comment = generateComment(article.url);

    // 存完整 URL（comment-executor 直接使用）
    const articleUrl = article.url;

    schedule.push({
      index: i + 1,
      scheduledTime: time.label,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
      // 预生成数据，comment-executor 直接使用
      url: articleUrl,
      nick: nickname,
      comment: comment
    });

    console.log('[AutoPoster] 计划' + (i + 1) + ': ' + time.label + ' - ' + article.url);
    console.log('[AutoPoster]   完整URL: ' + articleUrl);
    console.log('[AutoPoster]   昵称: ' + nickname + ' | 评论: ' + comment);
  }

  // 5. 写入计划文件（包含全部所需数据，comment-executor 无需任何解析）
  const dateStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).split(' ')[0];
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
    date: dateStr,
    generatedAt: new Date().toISOString(),
    schedule: schedule
  }, null, 2), 'utf-8');
  console.log('[AutoPoster] 计划已写入: ' + SCHEDULE_FILE);

  // 6. 清理旧任务，创建新任务
  console.log('[AutoPoster] --- 创建 Windows 计划任务 ---');
  for (let i = 0; i < count; i++) {
    createWindowsTask(schedule[i].hour, schedule[i].minute, schedule[i].second, i + 1);
  }

  console.log('[AutoPoster] ========== 完成 ==========');
}

// ============== 入口 ==============
if (require.main === module) {
  runAutoPoster()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[AutoPoster] 异常: ' + err.message);
      process.exit(1);
    });
}

module.exports = { runAutoPoster, fetchSitemapArticles, loadConfig, isEligibleArticle, filterByList, normalizeKey, generateComment, fetchArticlePool, fetchText, fetchJSON };
