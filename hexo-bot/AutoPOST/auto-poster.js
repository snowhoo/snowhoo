/**
 * Hexo 自动评论发布器
 * 每天 02:00 执行：
 *   1. 从 _posts 随机选取 3 篇文章
 *   2. 生成 3 个随机时间（06:00-23:00，精确到秒）
 *   3. 写入 daily-comment-schedule.json
 *   4. 创建 3 个一次性 Windows 计划任务，到点调用 comment-executor.js 发布评论
 *
 * 计划任务命名：Hexo-Bot\AutoPost_Task_{1,2,3}
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============== 路径配置 ==============
const POSTS_DIR = path.join(__dirname, '../../source/_posts');
const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');
const EXECUTOR_SCRIPT = path.join(__dirname, 'comment-executor.js');
const TASK_FOLDER = 'Hexo-Bot';

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

// ============== 文章内容分析 ==============

/**
 * 从文章正文中提取有价值的句子
 * 跳过：代码块、标题行、太短/太长的句子、链接、太水的句子
 */
function extractMeaningfulSentences(body) {
  // 预处理：去掉代码块、链接、图片
  let cleaned = body
    .replace(/```[\s\S]*?```/g, '')          // 代码块
    .replace(/`[^`]*`/g, '')                  // 行内代码
    .replace(/\[.*?\]\(.*?\)/g, '')         // 链接
    .replace(/!\[.*?\]\(.*?\)/g, '')        // 图片
    .replace(/^#{1,6}\s+.+$/gm, '')            // 标题行
    .replace(/^\s*[-*+]\s+/gm, '')           // 列表项
    .replace(/^\s*\d+\.\s+/gm, '')          // 有序列表
    .replace(/^\s*>/gm, '')                   // 引用符
    .replace(/\n{3,}/g, '\n\n');             // 多个空行

  // 按句子拆分（兼容中文句号、感叹号、问号）
  const rawSentences = cleaned.split(/[！？。\n]/).filter(s => s.trim());

  const MIN_LEN = 10;
  const MAX_LEN = 60;
  // 太水/太通用的词
  const SKIP_KEYWORDS = ['点击上方', '关注公众号', '微信公众号', '扫码关注', '本文首发', '转载注明',
    '版权所有', '保留权利', '商务合作', '广告投放', '打赏作者', '赞赏支持', '长按识别',
    '扫描二维码', '回复关键词', '发送"', '菜单栏', '工具栏', '置顶公众号', '往期回顾',
    '相关推荐', '猜你喜欢', '热门文章', '最新文章', '打开App', '打开网易云', '打开知乎',
    '来源：', '来源网络', '来源互联网', '互联网', '农历', '公历', '——打卡', '—— END',
    '更多', '请勿', '未经授权', '禁止转载', '转载须', '合作请', '商务请'];

  // 过滤太水的句子（无实质内容）
  const WATER_THRESHOLD = 3;
  const candidates = rawSentences
    .map(s => s.trim())
    .filter(s => s.length >= MIN_LEN && s.length <= MAX_LEN)
    .filter(s => !SKIP_KEYWORDS.some(k => s.includes(k)))
    .filter(s => /[\u4e00-\u9fff]/.test(s))
    .filter(s => (s.match(/[\u4e00-\u9fff]/g) || []).length >= WATER_THRESHOLD);  // 至少3个汉字  // 必须含中文

  return candidates;
}

/**
 * 根据句子内容判断文章类型并生成自然评论
 * 策略：先从正文抽取一句有内涵的话，再套上真实读后感
 */
function generateComment(article) {
  const title = article.title || '';
  const tags = article.tags || [];
  const cats = article.categories || [];
  const body = article.body || '';
  const allText = title + ' ' + tags.join(' ') + ' ' + cats.join(' ') + ' ' + body.slice(0, 500);

  // 判断文章类型
  const isPoetry = /[诗|词|曲|赋|颂|歌行|古风]/.test(title) || /——/.test(title);
  const isQuote = /——/.test(title) || /名言|语录|daily-quote|金句/.test(allText);
  const isTech = /技术|编程|代码|教程|前端|后端|系统|架构|算法|开源|框架/.test(allText);
  const isEmotion = /情感|心情|随笔|感悟|温柔|感动|想念|爱|悲伤|难过|快乐|幸福|治愈|疗伤/.test(allText);
  const isNightRead = /夜读|晚安|入睡|睡前|今夜|今晚/.test(allText);
  const isWork = /劳动|工作|职场|加班|上班|奋斗|拼搏/.test(allText);
  const isHoliday = /节|假|日/.test(title) && !isTech && !isEmotion && !isWork;
  const isNature = /四季|春天|夏日|秋风|冬雪|山川|河流|草木|花开|叶落|风景/.test(allText);
  const isHistory = /年|历史|岁月|时光|年代|那些年|那年/.test(allText);
  const isBook = /书|读后|读《|·《|读书|阅读/.test(allText);

  // 从正文中抽取一句有价值的句子
  const sentences = extractMeaningfulSentences(body);
  let quoted = '';
  if (sentences.length > 0) {
    // 优先挑含有情感词/哲理词的句子
    const precious = sentences.filter(s => /[爱|恨|思|念|时光|岁月|人生|生活|生命|孤独|温暖|幸福|美好|希望|梦想|坚持|初心]/.test(s));
    const pool = precious.length > 0 ? precious : sentences;
    quoted = pool[Math.floor(Math.random() * pool.length)];
    // 截取前30字，清理开头标点
    if (quoted.length > 30) quoted = quoted.slice(0, 30) + '…';
    quoted = quoted.replace(/^[.。,，:：;；、]+/, '');
  }

  // 通用反应句
  const REACTIONS = {
    poetry: [
      '这句诗太美了', '意境真好', '好有诗意', '词穷了，只能说太美',
      '读来唇齿生香', '这意境让人沉醉', '古人的智慧，穿越千年依然打动人心',
      '这句要记下来', '越读越有味'
    ],
    quote: [
      '说得真好', '收藏了', '说到心坎里去了', '很有道理',
      '值得细细品味', '送给自己，也送给你', '这碗鸡汤我干了',
      '深有感触', '记下来了，共勉'
    ],
    tech: [
      '学到了', '收藏了', '干货满满', '已关注',
      '很实用', '感谢分享', '这个思路很棒', '正需要这个',
      '解决了我的问题'
    ],
    emotion: [
      '被戳中了', '好感人', '看哭了', '好温暖',
      '说得就是我', '感同身受', '想起很多事情', '文字有力量',
      '好共鸣', '我也经常这样想'
    ],
    nightRead: [
      '夜读时光，最安静', '睡前读到，很治愈', '每晚必看这个栏目',
      '温暖的声音', '喜欢', '谢谢分享',
      '陪你入睡'
    ],
    work: [
      '劳动最光荣', '奋斗最幸福', '辛苦了', '加油',
      '致敬每一个努力的人', '写的真好'
    ],
    holiday: [
      '节日快乐', '同乐同乐', '祝福收到', '写得好',
      '涨知识了', '原来如此'
    ],
    nature: [
      '好美', '让人心旷神怡', '好想出去走走', '风景如画',
      '大自然的美好', '让人平静', '写得很美'
    ],
    history: [
      '时光匆匆', '岁月如梭', '怀念', '感慨万千',
      '读来很有感触', '时光一去不复返'
    ],
    book: [
      '这本书我也想读', '读后感写得真好', '被种草了',
      '收藏了', '谢谢推荐'
    ],
    generic: [
      '写得真好', '来看望一下', '打卡', '路过~冒个泡', '👍', '收藏了', '支持'
    ]
  };

  // 分类匹配
  let pool;
  if (isPoetry) pool = REACTIONS.poetry;
  else if (isQuote) pool = REACTIONS.quote;
  else if (isTech) pool = REACTIONS.tech;
  else if (isEmotion) pool = REACTIONS.emotion;
  else if (isNightRead) pool = REACTIONS.nightRead;
  else if (isWork) pool = REACTIONS.work;
  else if (isHoliday) pool = REACTIONS.holiday;
  else if (isNature) pool = REACTIONS.nature;
  else if (isBook) pool = REACTIONS.book;
  else pool = REACTIONS.generic;

  const reaction = pool[Math.floor(Math.random() * pool.length)];

  // 如果抽到了正文句子，生成"读到了某句话"型评论
  if (quoted && Math.random() > 0.4) {
    const quoteTemplates = [
      '读到这句"' + quoted + '"，' + reaction,
      quoted + '——' + reaction,
      '"' + quoted + '"，' + reaction,
      reaction + '，尤其这句："' + quoted + '"'
    ];
    return quoteTemplates[Math.floor(Math.random() * quoteTemplates.length)];
  }

  return reaction;
}

// ============== 获取文章（使用正确路径计算）==============
function getAllArticles() {
  const files = fs.readdirSync(POSTS_DIR);
  const articles = [];

  for (const file of files) {
    if (file.includes('hotnews') || !file.endsWith('.md')) continue;

    const filePath = path.join(POSTS_DIR, file);
    const raw = fs.readFileSync(filePath);
    // 自动检测编码：UTF-8 BOM → UTF-8，否则尝试 UTF-8 含中文则用，否则 GBK
    let content;
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
      content = raw.slice(3).toString('utf-8');
    } else {
      const utf8Str = raw.toString('utf-8');
      // 含中文且无大量乱码替换符 → UTF-8；否则 GBK
      const hasCJK = /[\u4e00-\u9fff]{3}/.test(utf8Str);
      const hasGarbage = (utf8Str.match(/�/g) || []).length > 3;
      content = hasCJK && !hasGarbage ? utf8Str : raw.toString('gbk');
    }
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;

    const frontMatter = {};
    match[1].split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx > 0) {
        frontMatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });

    // 优先用 frontmatter 中的 permalink，否则用 date + title 计算
    let articlePath;
    const permalink = frontMatter.permalink;

    if (permalink) {
      articlePath = permalink.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/) === permalink
        ? permalink
        : '/' + permalink.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '');
      articlePath = articlePath.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '/');
    } else {
      const dateStr = frontMatter.date || '';
      const dateParts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateParts) {
        const [, year, month, day] = dateParts;
        // 用 frontmatter 的实际 title 转 slug，不用文件名
        const fmTitle = frontMatter.title || '';
        const slugTitle = fmTitle
          .toLowerCase()
          .replace(/[^\w\u4e00-\u9fff]+/g, '-')
          .replace(/^-|-$/g, '');
        // 同时处理文件名作为兜底，确保空格变横杠
        const fileSlug = file.replace('.md', '').replace(/\s+/g, '-');
        articlePath = '/' + year + '/' + month + '/' + day + '/' + (slugTitle || fileSlug) + '/';
      } else {
        articlePath = '/articles/' + file.replace('.md', '') + '/';
      }
    }

    const slug = file.replace('.md', '');

    // 提取正文（去掉 frontmatter）
    const bodyContent = content.slice(match[0].length).trim();

    // 过滤"热搜""新闻"分类
    const fmText = (frontMatter.tags || '') + ' ' + (frontMatter.categories || '');
    if (/热搜|新闻/.test(fmText)) continue;

    articles.push({
      slug,
      title: frontMatter.title || '无标题',
      tags: frontMatter.tags ? frontMatter.tags.split(',').map(t => t.trim()) : [],
      categories: frontMatter.categories ? frontMatter.categories.split(',').map(c => c.trim()) : [],
      path: articlePath,
      body: bodyContent
    });
  }
  return articles;
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
    // 转换为当天 06:00:00 到 23:59:59 的秒数范围内随机
    const minSeconds = MIN_HOUR * 3600; // 21600
    const maxSeconds = MAX_HOUR * 3600 - 1; // 82799
    const randomSeconds = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;

    const hour = Math.floor(randomSeconds / 3600);
    const minute = Math.floor((randomSeconds % 3600) / 60);
    const second = randomSeconds % 60;

    const label = hour.toString().padStart(2, '0') + ':' +
                  minute.toString().padStart(2, '0') + ':' +
                  second.toString().padStart(2, '0');

    times.push({ hour, minute, second, label });
  }

  // 按时间排序
  times.sort((a, b) => {
    const aSec = a.hour * 3600 + a.minute * 60 + a.second;
    const bSec = b.hour * 3600 + b.minute * 60 + b.second;
    return aSec - bSec;
  });

  return times;
}

// ============== 创建 Windows 计划任务 ==============
function createWindowsTask(hour, minute, second, taskIndex) {
  const today = new Date();
  const now = today.getHours() * 3600 + today.getMinutes() * 60 + today.getSeconds();
  const scheduledSeconds = hour * 3600 + minute * 60 + second;

  let dateStr = today.toISOString().split('T')[0];
  if (scheduledSeconds <= now) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateStr = tomorrow.toISOString().split('T')[0];
  }

  const timeStr = hour.toString().padStart(2, '0') + ':' +
                  minute.toString().padStart(2, '0') + ':' +
                  second.toString().padStart(2, '0');

  // 格式: YYYY/MM/DD HH:MM:SS
  const dateParts = dateStr.split('-');
  const formattedDate = dateParts[0] + '/' + dateParts[1] + '/' + dateParts[2];

  const taskName = 'AutoPost_Task_' + taskIndex;
  const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';

  console.log('[AutoPoster] 创建计划任务: ' + TASK_FOLDER + '\\' + taskName + ' 于 ' + dateStr + ' ' + timeStr);

  const psFile = path.join(__dirname, '_temp_task_' + taskIndex + '.ps1');
  const psContent = [
    '$ErrorActionPreference = "Stop"',
    '$act = New-ScheduledTaskAction -Execute "' + nodeExe.replace('\\', '\\\\') + '" -Argument "' + EXECUTOR_SCRIPT.replace('\\', '\\\\') + ' --taskIndex=' + taskIndex + '"',
    '$trig = New-ScheduledTaskTrigger -Once -At "' + formattedDate + ' ' + timeStr + '"',
    '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    'Unregister-ScheduledTask -TaskName "' + taskName + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Confirm:$false -ErrorAction SilentlyContinue',
    'Register-ScheduledTask -TaskName "' + taskName + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Action $act -Trigger $trig -Settings $settings -Description "Hexo AutoPost ' + taskIndex + '" | Out-Null',
    'Write-Output "OK"'
  ].join('\n');

  fs.writeFileSync(psFile, '\ufeff' + psContent, 'utf8');

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

// ============== 主流程 ==============
function runAutoPoster() {
  console.log('[AutoPoster] ========== Hexo 自动评论发布器 ==========');
  console.log('[AutoPoster] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  // 1. 读取文章
  const articles = getAllArticles();
  console.log('[AutoPoster] 共找到 ' + articles.length + ' 篇文章');

  if (articles.length < 3) {
    console.log('[AutoPoster] 文章数量不足，需要至少 3 篇');
    return;
  }

  // 2. 随机选 3 篇
  const selectedArticles = pickRandom(articles, 3);

  // 3. 生成 3 个随机时间（06:00-23:00，精确到秒）
  const randomTimes = generateRandomTimes(3);

  // 4. 构建 schedule
  const schedule = [];
  for (let i = 0; i < 3; i++) {
    const article = selectedArticles[i];
    const time = randomTimes[i];
    const nickname = generateNickname();
    const comment = generateComment(article);

    schedule.push({
      index: i + 1,
      scheduledTime: time.label,
      hour: time.hour,
      minute: time.minute,
      second: time.second,
      article: {
        slug: article.slug,
        title: article.title,
        path: article.path
      },
      nickname: nickname,
      comment: comment
    });

    console.log('[AutoPoster] 计划' + (i + 1) + ': ' + time.label + ' - 《' + article.title + '》');
    console.log('[AutoPoster]   路径: ' + article.path);
    console.log('[AutoPoster]   昵称: ' + nickname + ' | 评论: ' + comment);
  }

  // 5. 写入计划文件
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    schedule: schedule
  }, null, 2), 'utf-8');

  console.log('[AutoPoster] 计划已写入: ' + SCHEDULE_FILE);

  // 6. 创建 Windows 计划任务
  console.log('[AutoPoster] --- 创建 Windows 计划任务 ---');
  for (let i = 0; i < 3; i++) {
    createWindowsTask(schedule[i].hour, schedule[i].minute, schedule[i].second, i + 1);
  }

  console.log('[AutoPoster] ========== 完成 ==========');
}

// ============== 入口 ==============
if (require.main === module) {
  runAutoPoster();
}
