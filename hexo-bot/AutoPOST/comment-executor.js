const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');
const SITEMAP_URL = 'https://snowhoo.net/sitemap.xml';
const CACHE_FILE = path.join(__dirname, 'sitemap-cache.json');
const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4小时

// ============== Sitemap 获取 & 缓存 ==============

async function fetchSitemap() {
  // 1. 尝试从本地缓存加载
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cache.fetchedAt < CACHE_MAX_AGE) {
        console.log('[Sitemap] 从本地缓存加载 (' + Math.round(cache.urlMap.length / 3) + ' 条)');
        return cache;
      }
    } catch (e) {
      // 缓存损坏，重新获取
    }
  }

  // 2. 从网络获取
  console.log('[Sitemap] 正在从网络获取...');
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) {
    throw new Error('Sitemap fetch failed: ' + response.status);
  }
  const xmlText = await response.text();

  const urlMap = [];
  const locMatches = xmlText.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of locMatches) {
    const loc = match[1].trim();
    if (loc.includes('/index.html') || loc.includes('生成文章') || loc.includes('tags/index') || loc.includes('categories/index') || loc.includes('link/index') || loc.includes('guestbook/index') || loc.includes('about/index') || loc.includes('robots.txt')) {
      continue;
    }
    try {
      const urlObj = new URL(loc);
      const pathPart = urlObj.pathname;
      const cleanPath = pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart;
      const parts = cleanPath.split('/');
      const slug = parts[parts.length - 1];
      if (slug) {
        urlMap.push({ slug, url: loc });
        urlMap.push({ slug: slug.replace(/_/g, '-'), url: loc });
        urlMap.push({ slug: slug.replace(/-/g, '_'), url: loc });
      }
    } catch (e) {
      // ignore
    }
  }

  const uniqueCount = Math.round(urlMap.length / 3);
  console.log('[Sitemap] 解析完成，共 ' + uniqueCount + ' 条文章');

  // 3. 保存本地缓存
  const cache = { urlMap, fetchedAt: Date.now() };
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('[Sitemap] 已缓存到本地');
  } catch (e) {
    console.log('[Sitemap] 缓存写入失败: ' + e.message);
  }

  return cache;
}

function findArticleUrl(article, cache) {
  const urlMap = cache.urlMap;

  // 方法1: slug 精确匹配（三种变体）
  const slugVariants = [article.slug, article.slug.replace(/_/g, '-'), article.slug.replace(/-/g, '_')];
  for (const item of urlMap) {
    if (slugVariants.includes(item.slug)) {
      return item.url;
    }
  }

  // 方法2: 标题关键词部分匹配
  const titleWords = article.title
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .map(w => w.toLowerCase());

  for (const item of urlMap) {
    const slugLower = item.slug.toLowerCase();
    const match = titleWords.some(w => slugLower.includes(w) || (w.length > 4 && slugLower.includes(w.split('-')[0])));
    if (match) {
      console.log('[Sitemap] 标题匹配: ' + item.slug + ' <- ' + article.title.substring(0, 40));
      return item.url;
    }
  }

  // 方法3: 回退到旧路径
  if (article.path && article.path.startsWith('/')) {
    return 'https://snowhoo.net' + article.path;
  }
  return null;
}

// ============== 评论发布 ==============

function postComment(comment, nickname, url) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ comment, nick: nickname, url });
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

// ============== 删除 Windows 计划任务 ==============

function deleteScheduledTask(taskIndex) {
  const taskName = 'AutoPost_Task_' + taskIndex;
  const taskPath = 'Hexo-Bot/';
  const psScript = 'Unregister-ScheduledTask -TaskName "' + taskName + '" -TaskPath "' + taskPath + '" -Confirm:$false -ErrorAction SilentlyContinue; Write-Output deleted';
  try {
    execSync('powershell -ExecutionPolicy Bypass -NoProfile -Command "' + psScript.replace(/"/g, '\\"') + '"', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000
    });
    console.log('[CommentExecutor] 已清理计划任务: Hexo-Bot/' + taskName);
  } catch (e) {
    // ignore
  }
}

// ============== 主流程 ==============

async function runExecutor() {
  console.log('[CommentExecutor] 开始执行评论发布...');
  console.log('[CommentExecutor] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  if (!fs.existsSync(SCHEDULE_FILE)) {
    console.log('[CommentExecutor] 未找到计划文件，跳过执行');
    return;
  }

  const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  if (scheduleData.date !== today) {
    console.log('[CommentExecutor] 计划已过期(' + scheduleData.date + ')，跳过执行');
    return;
  }

  const tasks = scheduleData.schedule;
  console.log('[CommentExecutor] 今日计划共 ' + tasks.length + ' 条评论');

  const args = process.argv.slice(2);
  let taskIndex = null;
  for (const arg of args) {
    if (arg.startsWith('--taskIndex=')) {
      taskIndex = parseInt(arg.split('=')[1], 10);
    }
  }

  const tasksToRun = taskIndex !== null
    ? tasks.filter(t => t.index === taskIndex)
    : tasks;

  if (tasksToRun.length === 0) {
    if (taskIndex !== null) {
      console.log('[CommentExecutor] 未找到序号为 ' + taskIndex + ' 的计划，跳过');
    }
    return;
  }

  // 获取 sitemap（本地缓存优先）
  let cache = null;
  try {
    cache = await fetchSitemap();
  } catch (err) {
    console.log('[CommentExecutor] Sitemap 获取失败，使用旧路径: ' + err.message);
  }

  for (const task of tasksToRun) {
    const correctUrl = cache ? findArticleUrl(task.article, cache) : null;
    const finalUrl = correctUrl || ('https://snowhoo.net' + task.article.path);

    console.log('[CommentExecutor] [' + task.index + '/' + tasks.length + ']');
    console.log('[CommentExecutor] 文章: 《' + task.article.title + '》');
    console.log('[CommentExecutor] 旧路径: ' + task.article.path);
    console.log('[CommentExecutor] 解析路径: ' + finalUrl);
    console.log('[CommentExecutor] 昵称: ' + task.nickname + ' | 评论: ' + task.comment);

    try {
      const result = await postComment(task.comment, task.nickname, finalUrl);
      console.log('[CommentExecutor] 成功 (ID: ' + (result.data ? result.data.objectId : 'N/A') + ')');
      deleteScheduledTask(task.index);
    } catch (err) {
      console.log('[CommentExecutor] 失败: ' + err.message);
    }
  }

  console.log('[CommentExecutor] 执行完成');
}

// ============== 直接运行时执行 ==============

if (require.main === module) {
  runExecutor()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[CommentExecutor] 异常: ' + err.message);
      process.exit(1);
    });
}

module.exports = { runExecutor, fetchSitemap, findArticleUrl };
