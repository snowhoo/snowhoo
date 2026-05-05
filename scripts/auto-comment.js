/**
 * 自动评论系统 v2
 * 每天三个随机时间，随机选取非热搜文章，基于文章内容生成相关性强的自然语言评论
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============== 配置 ==============
const BLOG_URL = 'https://snowhoo.net';
const POSTS_DIR = path.join(__dirname, '../source/_posts');

// ============== 昵称生成（当场随机生成）==============
function generateNickname() {
  const styles = [
    // 古风类
    () => {
      const surnames = ['苏', '林', '江', '顾', '沈', '叶', '陆', '程', '方', '宋', '秦', '白', '夏', '周', '柳', '穆', '谢', '许', '何', '苏'];
      const names = ['念瑾', '沐晴', '挽棠', '清欢', '锦书', '知意', '南栀', '北辰', '西洲', '东篱', '安然', '夏安', '冬蕴', '春晓', '秋白', '星河', '云深', '鹿鸣', '鹤归', '蝉噪', '晚舟', '归鸿', '落梅', '听雨', '临渊'];
      const suffixes = ['', '呀', '呢', '的', '~', '…', '·', ''];
      return surnames[Math.floor(Math.random() * surnames.length)] + names[Math.floor(Math.random() * names.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    // 萌物类
    () => {
      const prefixes = ['一只', '可爱', '路过', '睡不醒', '馋嘴', '炸毛', '发呆', '流浪', '小', '迷你', '霸道', '软糯', '活泼', '迷糊', '贪玩'];
      const animals = ['猫', '狗', '兔', '熊', '狐狸', '松鼠', '刺猬', '仓鼠', '龙猫', '水獭', '小鹿', '猪猪', '老虎', '狮子', '豹子'];
      const suffixes = ['', '子', '酱', '呀', '～', 'です', '', '~'];
      return prefixes[Math.floor(Math.random() * prefixes.length)] + animals[Math.floor(Math.random() * animals.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    // 文艺类
    () => {
      const adjs = ['孤独', '温暖', '明媚', '忧伤', '灿烂', '静谧', '缱绻', '清冽', '柔软', '澄澈', '薄凉', '热烈', '微醺', '薄荷', '清欢', '安然', '惆怅', '悠然', '寂寥', '烂漫'];
      const nouns = ['旅人', '过客', '行者', '归人', '远山', '近水', '月光', '日光', '星子', '尘埃', '落叶', '飞花', '烟雨', '流云', '晚风', '晨曦', '孤鸿', '游鱼', '飞鸟', '落霞'];
      return adjs[Math.floor(Math.random() * adjs.length)] + nouns[Math.floor(Math.random() * nouns.length)];
    },
    // 感慨类
    () => {
      const fronts = ['今天', '明天', '昨天', '每天', '此刻', '此时', '此刻', '蓦然', '忽然', '恍然', '欣然'];
      const actions = ['想起', '念起', '记起', '遇见', '重温', '想起那年', '路过', '驻足', '发呆', '沉默'];
      const suffixes = ['', '…', '~', '的', ''];
      return fronts[Math.floor(Math.random() * fronts.length)] + actions[Math.floor(Math.random() * actions.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
    },
    // 匿名类
    () => {
      const anonymous = ['匿名用户', '路人甲', '路过打酱油', '悄悄路过', '打个酱油~', '路过的', '云游至此', '偶然路过', '随便看看', '晃悠路过'];
      return anonymous[Math.floor(Math.random() * anonymous.length)];
    },
  ];
  return styles[Math.floor(Math.random() * styles.length)]();
}

// ============== 评论生成（基于文章内容）==============
function analyzeArticle(article) {
  const title = (article.title || '').toLowerCase();
  const tags = (article.tags || []).map(t => t.toLowerCase());
  const cats = (article.categories || []).map(c => c.toLowerCase());
  const excerpt = (article.excerpt || '').toLowerCase();

  const allText = title + ' ' + tags.join(' ') + ' ' + cats.join(' ') + ' ' + excerpt;

  // 判断文章类型
  const isPoetry = /\u4e00-\u9fff/.test(article.title) && (article.title.includes('诗') || article.title.includes('词') || article.title.includes('——') || tags.includes('诗词') || tags.includes('古诗词') || /苏东坡|李白|杜甫|苏轼|辛弃疾|陆游|纳兰|柳永/.test(allText));
  const isQuote = title.includes('——') || title.includes('—') || tags.includes('语录') || tags.includes('名言') || tags.includes('daily-quote');
  const isTech = tags.includes('技术') || tags.includes('编程') || tags.includes('代码') || tags.includes('教程') || tags.includes('前端') || tags.includes('后端') || cats.includes('技术');
  const isFinance = tags.includes('金融') || tags.includes('投资') || tags.includes('理财') || tags.includes('股票') || tags.includes('基金') || cats.includes('理财') || cats.includes('投资') || cats.includes('金融');
  const isEmotion = tags.includes('情感') || tags.includes('心情') || tags.includes('随笔') || tags.includes('感悟') || cats.includes('情感') || cats.includes('随笔') || /温柔|感动|想念|爱|喜欢|悲伤|难过|快乐|幸福/.test(allText);
  const isNews = cats.includes('新闻') || cats.includes('热搜') || tags.includes('新闻') || tags.includes('资讯');
  const isRead = cats.includes('夜读') || tags.includes('夜读') || tags.includes('阅读');
  const isLife = tags.includes('生活') || tags.includes('日常') || tags.includes('日常') || cats.includes('生活') || cats.includes('日常');

  // 提取标题关键词（2-4个字的词）
  const titleChars = article.title.replace(/[^\\u4e00-\\u9fff]/g, '').slice(0, 10);
  const titleWords = [];
  for (let i = 0; i < titleChars.length - 1; i++) {
    titleWords.push(titleChars.slice(i, i + 2));
  }

  return { isPoetry, isQuote, isTech, isFinance, isEmotion, isNews, isRead, isLife, titleWords, allText };
}

function generateComment(article) {
  const analysis = analyzeArticle(article);
  const title = article.title || '';
  const titleWord = analysis.titleWords.length > 0 ? analysis.titleWords[Math.floor(Math.random() * Math.min(3, analysis.titleWords.length))] : '';

  // 根据文章类型生成不同风格的评论
  if (analysis.isPoetry) {
    const poetryComments = [
      '这句诗太美了，百读不厌',
      '意境真好，喜欢这句',
      '每次读到都觉得心静下来了',
      '好有诗意，收藏了',
      '这句词真是绝了',
      '古人的智慧，穿越千年依然打动人心',
      '词穷了，只能说太美',
      '这意境让人沉醉',
    ];
    return poetryComments[Math.floor(Math.random() * poetryComments.length)];
  }

  if (analysis.isQuote) {
    const quoteComments = [
      '这句话说得真好，说到心坎里去了',
      '很有道理，值得细细品味',
      '收藏了，时不时拿出来看看',
      '说得太对了，深有感触',
      '这碗鸡汤我干了',
      '送给自己，也送给你',
      '记下来了，共勉',
    ];
    return quoteComments[Math.floor(Math.random() * quoteComments.length)];
  }

  if (analysis.isTech) {
    const techComments = [
      '学到了，谢谢博主分享',
      '收藏了，感觉很有用',
      '写的很清楚，学会了',
      '666，已关注',
      '干货满满，支持一下',
      '感谢分享，正需要这个',
      '这个思路很棒，点赞',
      '已保存，以后用得上',
    ];
    return techComments[Math.floor(Math.random() * techComments.length)];
  }

  if (analysis.isFinance) {
    const financeComments = [
      '说得有道理，稳健最重要',
      '收藏了，慢慢学习',
      '投资还是要谨慎',
      '感谢分享，有收获',
      '说得实在',
      '确实是这样，要有自己的判断',
      '理性投资，不跟风',
    ];
    return financeComments[Math.floor(Math.random() * financeComments.length)];
  }

  if (analysis.isEmotion) {
    // 根据标题情感生成
    const warmComments = [
      '写的真好，感同身受',
      '被戳中了...',
      '好有感触，想起很多事情',
      '文字好温暖',
      '好感人，看哭了',
      '说得就是我啊',
      '好共鸣，我也经常这样想',
      '文字很有力量',
    ];
    return warmComments[Math.floor(Math.random() * warmComments.length)];
  }

  if (analysis.isRead) {
    const readComments = [
      '夜读时光，最安静',
      '喜欢这个栏目，每天来看看',
      '睡前读一读，很治愈',
      '感谢分享，每晚必看',
      '很温暖的声音',
      '喜欢这个内容',
    ];
    return readComments[Math.floor(Math.random() * readComments.length)];
  }

  if (analysis.isLife) {
    const lifeComments = [
      '写的不错，支持一下',
      '来看看老哥',
      '写的挺好',
      '路过~',
      '冒个泡',
      '打卡',
      '踩踩，早些来过了',
      '有空多写写',
    ];
    return lifeComments[Math.floor(Math.random() * lifeComments.length)];
  }

  // 通用评论
  const generalComments = [
    '写的不错，支持一下',
    '来看看',
    '路过~',
    '写的挺好',
    '冒个泡',
    '打卡',
    '收藏了',
    '👍',
    '写的真好',
  ];
  return generalComments[Math.floor(Math.random() * generalComments.length)];
}

// ============== 文章获取 ==============
function getAllArticles() {
  const files = fs.readdirSync(POSTS_DIR);
  const articles = [];

  for (const file of files) {
    if (file.includes('hotnews')) continue;
    if (!file.endsWith('.md')) continue;

    const filePath = path.join(POSTS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;

    const frontMatter = {};
    match[1].split('\n').forEach(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        frontMatter[key] = value;
      }
    });

    // 提取文章前300字作为内容摘要
    const parts = content.split(/^---$/m);
    let excerpt = '';
    if (parts.length >= 3) {
      excerpt = parts[2].trim().substring(0, 300);
    } else {
      excerpt = content.replace(/^---[\s\S]*?---/, '').trim().substring(0, 300);
    }

    const slug = file.replace('.md', '');
    const articlePath = '/articles/' + slug + '.html';

    articles.push({
      slug,
      title: frontMatter.title || '无标题',
      date: frontMatter.date || '',
      tags: frontMatter.tags ? frontMatter.tags.split(',').map(t => t.trim()) : [],
      categories: frontMatter.categories ? frontMatter.categories.split(',').map(c => c.trim()) : [],
      excerpt,
      url: articlePath,
      filename: file
    });
  }

  return articles;
}

// ============== Waline 评论发布 ==============
function postComment(comment, nickname, url) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      comment: comment,
      nick: nickname,
      url: url
    });

    console.log('[Auto-Comment] 发送数据:', postData);

    const options = {
      hostname: 'waline.snowhoo.net',
      port: 443,
      path: '/api/comment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errno === 0 || json.code === 0 || json.code === 200) {
            resolve(json);
          } else {
            reject(new Error('Waline error: ' + (json.errmsg || JSON.stringify(json))));
          }
        } catch (e) {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            reject(new Error('Failed to parse response: ' + data));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
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

// ============== 主流程 ==============
async function runAutoComment() {
  console.log('[Auto-Comment] 开始执行自动评论...');
  console.log('[Auto-Comment] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  try {
    const articles = getAllArticles();
    console.log('[Auto-Comment] 共找到 ' + articles.length + ' 篇非热搜文章');

    if (articles.length === 0) {
      console.log('[Auto-Comment] 没有可评论的文章');
      return;
    }

    // 随机选取3篇文章
    const selectedArticles = pickRandom(articles, 3);
    console.log('[Auto-Comment] 随机选取了3篇文章:');
    selectedArticles.forEach((a, i) => {
      console.log('  ' + (i + 1) + '. [' + (a.categories.length ? a.categories.join(',') : '未分类') + '] ' + a.title);
    });

    const results = [];
    for (const article of selectedArticles) {
      const nickname = generateNickname();
      const comment = generateComment(article);

      console.log('[Auto-Comment] 文章: ' + article.title);
      console.log('[Auto-Comment] 分类/标签: ' + [...article.categories, ...article.tags].join(', ') || '无');
      console.log('[Auto-Comment] 昵称: ' + nickname);
      console.log('[Auto-Comment] 评论: ' + comment);

      try {
        const result = await postComment(comment, nickname, article.url);
        console.log('[Auto-Comment] ✓ 评论发布成功 (ID: ' + (result.data ? result.data.objectId : 'N/A') + ')');
        results.push({ article: article.title, nickname, comment, status: 'success' });
      } catch (err) {
        console.log('[Auto-Comment] ✗ 评论发布失败: ' + err.message);
        results.push({ article: article.title, nickname, comment, status: 'failed', error: err.message });
      }

      // 每个评论间隔60秒，避免服务端限流
      await new Promise(r => setTimeout(r, 60000 + Math.random() * 30000));
    }

    console.log('[Auto-Comment] 本次执行完成');
    console.log('--- 结果汇总 ---');
    results.forEach((r, i) => {
      console.log((i + 1) + '. [' + r.status + '] ' + r.article + ' - ' + r.nickname + ': ' + r.comment);
    });

    return results;
  } catch (err) {
    console.error('[Auto-Comment] 执行出错:', err);
    throw err;
  }
}

// 直接运行时执行
if (require.main === module) {
  runAutoComment()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runAutoComment };
