/**
 * 每日评论计划生成器 v2
 * 每天0点执行：生成三个随机时间+文章+昵称+评论，并创建Windows计划任务
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTS_DIR = path.join(__dirname, '../source/_posts');
const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');
const EXECUTOR_SCRIPT = path.join(__dirname, 'comment-executor.js');

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

// ============== 评论生成 ==============
function generateComment(article) {
  const tags = article.tags || [];
  const cats = article.categories || [];
  const allText = (article.title || '').toLowerCase() + ' ' + tags.join(' ') + ' ' + cats.join(' ');

  const isPoetry = /\u4e00-\u9fff/.test(article.title) && (/诗|词|——/.test(article.title) || /诗词|古诗词/.test(allText));
  const isQuote = article.title.includes('——') || article.title.includes('—') || /语录|名言|daily-quote/.test(allText);
  const isTech = /技术|编程|代码|教程|前端|后端/.test(allText);
  const isEmotion = /情感|心情|随笔|感悟|温柔|感动|想念|爱|悲伤|难过|快乐|幸福/.test(allText);
  const isRead = /夜读|阅读/.test(allText);

  if (isPoetry) {
    const c = ['这句诗太美了，百读不厌', '意境真好，喜欢这句', '每次读到都觉得心静下来了', '好有诗意，收藏了', '这句词真是绝了', '古人的智慧，穿越千年依然打动人心', '词穷了，只能说太美', '这意境让人沉醉'];
    return c[Math.floor(Math.random() * c.length)];
  }
  if (isQuote) {
    const c = ['这句话说得真好，说到心坎里去了', '很有道理，值得细细品味', '收藏了，时不时拿出来看看', '说得太对了，深有感触', '这碗鸡汤我干了', '送给自己，也送给你', '记下来了，共勉'];
    return c[Math.floor(Math.random() * c.length)];
  }
  if (isTech) {
    const c = ['学到了，谢谢博主分享', '收藏了，感觉很有用', '写的很清楚，学会了', '666，已关注', '干货满满，支持一下', '感谢分享，正需要这个', '这个思路很棒，点赞'];
    return c[Math.floor(Math.random() * c.length)];
  }
  if (isEmotion) {
    const c = ['写的真好，感同身受', '被戳中了...', '好有感触，想起很多事情', '文字好温暖', '好感人，看哭了', '说得就是我啊', '好共鸣，我也经常这样想', '文字很有力量'];
    return c[Math.floor(Math.random() * c.length)];
  }
  if (isRead) {
    const c = ['夜读时光，最安静', '喜欢这个栏目，每天来看看', '睡前读一读，很治愈', '感谢分享，每晚必看', '很温暖的声音', '喜欢这个内容'];
    return c[Math.floor(Math.random() * c.length)];
  }

  const c = ['写的不错，支持一下', '来看看', '路过~', '冒个泡', '打卡', '收藏了', '👍', '写的真好'];
  return c[Math.floor(Math.random() * c.length)];
}

// ============== 获取文章 ==============
function getAllArticles() {
  const files = fs.readdirSync(POSTS_DIR);
  const articles = [];

  for (const file of files) {
    if (file.includes('hotnews') || !file.endsWith('.md')) continue;

    const filePath = path.join(POSTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
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
      // 去掉协议和域名，保留路径部分
      articlePath = permalink.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '/');
    } else {
      // 用 date 和 title 按 Hexo permalink 格式计算
      // permalink: :year/:month/:day/:title/  + trailing_html: true
      const dateStr = frontMatter.date || '';
      const dateParts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (dateParts) {
        const [, year, month, day] = dateParts;
        // 去掉文件名中的日期前缀，用剩余部分作为 title
        const titlePart = file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
        // 路径格式: /年/月/日/标题/
        articlePath = `/${year}/${month}/${day}/${titlePart}/`;
      } else {
        // 没有日期时，用纯 slug
        articlePath = '/articles/' + file.replace('.md', '') + '/';
      }
    }

    const slug = file.replace('.md', '');
    articles.push({
      slug,
      title: frontMatter.title || '无标题',
      tags: frontMatter.tags ? frontMatter.tags.split(',').map(t => t.trim()) : [],
      categories: frontMatter.categories ? frontMatter.categories.split(',').map(c => c.trim()) : [],
      path: articlePath
    });
  }
  return articles;
}

// ============== 随机选择 ==============
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

// ============== 创建Windows计划任务 ==============
function createWindowsTask(hour, minute, taskIndex) {
  const today = new Date();
  const scheduledDate = today.toISOString().split('T')[0];
  const timeStr = hour.toString().padStart(2, '0') + ':' + minute.toString().padStart(2, '0');

  const now = today.getHours() * 60 + today.getMinutes();
  const scheduledMinutes = hour * 60 + minute;
  let dateStr = scheduledDate;
  if (scheduledMinutes <= now) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateStr = tomorrow.toISOString().split('T')[0];
  }

  const dateParts = dateStr.split('-');
  const formattedDate = dateParts[0] + '/' + dateParts[1] + '/' + dateParts[2];

  const taskFullName = 'Snowhoo_AutoComment_' + taskIndex;
  const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';

  console.log('[ScheduleGenerator] 创建计划任务: ' + taskFullName + ' 于 ' + dateStr + ' ' + timeStr);

  try {
    // 写一个临时的 PowerShell 脚本文件
    const psFile = path.join(__dirname, '_temp_task_' + taskIndex + '.ps1');
    const psContent = [
      '$ErrorActionPreference = "Stop"',
      'try {',
      '  Unregister-ScheduledTask -TaskName "' + taskFullName + '" -Confirm:$false -ErrorAction SilentlyContinue',
      '  $act = New-ScheduledTaskAction -Execute "' + nodeExe + '" -Argument "\\"' + EXECUTOR_SCRIPT + '\\" --taskIndex=' + taskIndex + '"',
      '  $trig = New-ScheduledTaskTrigger -Once -At "' + formattedDate + ' ' + timeStr + '"',
      '  Register-ScheduledTask -TaskName "' + taskFullName + '" -Action $act -Trigger $trig -Description "Auto Comment ' + taskIndex + '" | Out-Null',
      '  Write-Output "OK"',
      '} catch {',
      '  Write-Output ("ERR: " + $_.Exception.Message)',
      '  exit 1',
      '}',
      'exit 0'
    ].join('\n');

    fs.writeFileSync(psFile, '\ufeff' + psContent, 'utf8');

    try {
      const output = execSync('powershell -ExecutionPolicy Bypass -NoProfile -File "' + psFile + '"', { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      const outStr = (output || '').toString();
      if (outStr.includes('OK')) {
        console.log('[ScheduleGenerator] 任务创建成功');
        return true;
      }
      console.log('[ScheduleGenerator] 任务创建失败: ' + outStr.trim());
      return false;
    } finally {
      try { fs.unlinkSync(psFile); } catch(e) {}
    }
  } catch (e) {
    const errMsg = ((e.stderr || e.stdout || e.message || '').toString() || '').trim();
    console.log('[ScheduleGenerator] 任务创建失败: ' + (errMsg || '未知错误'));
    return false;
  }
}

// ============== 主流程 ==============
function runScheduleGenerator() {
  console.log('[ScheduleGenerator] 开始生成每日评论计划...');
  console.log('[ScheduleGenerator] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  const articles = getAllArticles();
  console.log('[ScheduleGenerator] 共找到 ' + articles.length + ' 篇非热搜文章');

  if (articles.length < 3) {
    console.log('[ScheduleGenerator] 文章数量不足');
    return;
  }

  // 随机选3篇文章
  const selectedArticles = pickRandom(articles, 3);

  // 生成3个随机时间（分散在全天）
  const randomTimes = [];
  const ranges = [
    { min: 6, max: 12 },
    { min: 12, max: 18 },
    { min: 18, max: 24 }
  ];

  for (const range of ranges) {
    const hour = Math.floor(Math.random() * (range.max - range.min)) + range.min;
    const minute = Math.floor(Math.random() * 60);
    randomTimes.push({ hour, minute, label: hour.toString().padStart(2, '0') + ':' + minute.toString().padStart(2, '0') });
  }

  // 为每篇文章生成昵称和评论
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
      article: {
        slug: article.slug,
        title: article.title,
        path: article.path
      },
      nickname: nickname,
      comment: comment
    });

    console.log('[ScheduleGenerator] 计划' + (i + 1) + ': ' + time.label + ' - 《' + article.title + '》- ' + nickname + ': ' + comment);
  }

  // 写入计划文件
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    schedule: schedule
  }, null, 2), 'utf-8');

  console.log('[ScheduleGenerator] 计划已写入: ' + SCHEDULE_FILE);

  // 创建Windows计划任务
  console.log('[ScheduleGenerator] --- 创建Windows计划任务 ---');
  for (let i = 0; i < 3; i++) {
    createWindowsTask(schedule[i].hour, schedule[i].minute, i + 1);
  }

  console.log('[ScheduleGenerator] 今日评论计划生成完成');
  console.log('');
  console.log('=== 今日评论计划 ===');
  schedule.forEach(s => {
    console.log('  ' + s.scheduledTime + ' | ' + s.nickname + ' | ' + s.comment);
    console.log('         《' + s.article.title + '》');
  });
}

runScheduleGenerator();
