/**
 * Hexo 自动评论发布器
 * 每天 02:00 执行：
 *   1. 从网络抓取 sitemap
 *   2. 从 sitemap 直接随机选取 3 篇已发布文章
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

// ============== 根据 URL slug 类型生成评论 ==============
function generateComment(articleUrl) {
  const url = articleUrl.toLowerCase();

  const isPoetry = /[诗|词|曲|赋|颂|歌行|古风]/.test(url);
  const isQuote = /名言|语录|daily-quote|金句/.test(url) || /——/.test(url);
  const isTech = /技术|编程|代码|教程|前端|后端|系统|架构|算法|开源|框架/.test(url);
  const isEmotion = /情感|心情|随笔|感悟|温柔|感动|想念|爱|悲伤|难过|快乐|幸福|治愈|疗伤/.test(url);
  const isNightRead = /夜读|晚安|入睡|睡前|今夜|今晚/.test(url);
  const isWork = /劳动|工作|职场|加班|上班|奋斗|拼搏/.test(url);
  const isHoliday = /节|假|日/.test(url) && !isTech && !isEmotion && !isWork;
  const isNature = /四季|春天|夏日|秋风|冬雪|山川|河流|草木|花开|叶落|风景/.test(url);
  const isHistory = /年|历史|岁月|时光|年代|那些年|那年/.test(url);
  const isBook = /书|读后|读《|·《|读书|阅读/.test(url);

  const REACTIONS = {
    poetry: ['这句诗太美了', '意境真好', '好有诗意', '词穷了，只能说太美', '读来唇齿生香', '这意境让人沉醉', '古人的智慧，穿越千年依然打动人心', '这句要记下来', '越读越有味'],
    quote: ['说得真好', '收藏了', '说到心坎里去了', '很有道理', '值得细细品味', '送给自己，也送给你', '这碗鸡汤我干了', '深有感触', '记下来了，共勉'],
    tech: ['学到了', '收藏了', '干货满满', '已关注', '很实用', '感谢分享', '这个思路很棒', '正需要这个', '解决了我的问题'],
    emotion: ['被戳中了', '好感人', '看哭了', '好温暖', '说得就是我', '感同身受', '想起很多事情', '文字有力量', '好共鸣', '我也经常这样想'],
    nightRead: ['夜读时光，最安静', '睡前读到，很治愈', '每晚必看这个栏目', '温暖的声音', '喜欢', '谢谢分享', '陪你入睡'],
    work: ['劳动最光荣', '奋斗最幸福', '辛苦了', '加油', '致敬每一个努力的人', '写的真好'],
    holiday: ['节日快乐', '同乐同乐', '祝福收到', '写得好', '涨知识了', '原来如此'],
    nature: ['好美', '让人心旷神怡', '好想出去走走', '风景如画', '大自然的美好', '让人平静', '写得很美'],
    history: ['时光匆匆', '岁月如梭', '怀念', '感慨万千', '读来很有感触', '时光一去不复返'],
    book: ['这本书我也想读', '读后感写得真好', '被种草了', '收藏了', '谢谢推荐'],
    generic: ['写得真好', '来看望一下', '打卡', '路过~冒个泡', '👍', '收藏了', '支持', '赞', '写得真棒']
  };

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

          // 过滤非文章页面、标签/分类页、热搜/新闻、首页、静态页面
          const locDecoded = decodeURIComponent(loc);
          if (locDecoded.includes('/index.html') || locDecoded.includes('生成文章') ||
              locDecoded.includes('/tags/') || locDecoded.includes('/categories/') ||
              locDecoded.includes('/link/') || locDecoded.includes('/guestbook/') ||
              locDecoded.includes('/about/') || locDecoded.includes('/archives/') ||
              locDecoded.includes('/robots.txt') || locDecoded.includes('/hotnews/') ||
              locDecoded.includes('hotnews') ||
              locDecoded.endsWith('.html') || locDecoded.endsWith('.htm')) {
            return;
          }

          try {
            const urlObj = new URL(loc);
            const pathPart = urlObj.pathname;
            const cleanPath = pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart;
            const parts = cleanPath.split('/');
            const slug = parts[parts.length - 1];

            if (slug) {
              // 补回尾部斜杠（sitemap URL 末尾有 /，去掉后又需保留以准确匹配）
              articles.push({
                slug: slug,
                url: cleanPath + '/',
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

  // 1. 从网络抓取 sitemap，获取已发布文章列表
  const sitemapArticles = await fetchSitemapArticles();

  if (sitemapArticles.length < 3) {
    console.log('[AutoPoster] Sitemap 文章数量不足（' + sitemapArticles.length + '），跳过');
    return;
  }

  // 2. 随机选 3 篇
  const selectedArticles = pickRandom(sitemapArticles, 3);
  console.log('[AutoPoster] 选中 ' + selectedArticles.length + ' 篇文章');

  // 3. 生成 3 个随机时间（06:00-23:00，精确到秒）
  const randomTimes = generateRandomTimes(3);

  // 4. 构建 schedule，每条包含预生成的完整数据
  const schedule = [];
  for (let i = 0; i < 3; i++) {
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
  for (let i = 0; i < 3; i++) {
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

module.exports = { runAutoPoster, fetchSitemapArticles };
