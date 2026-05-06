const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');
const SITEMAP_URL = 'https://snowhoo.net/sitemap.xml';
const CACHE_FILE = path.join(__dirname, 'sitemap-cache.json');
const CACHE_MAX_AGE = 4 * 60 * 60 * 1000; // 4灏忔椂

// ============== Sitemap 鑾峰彇 & 缂撳瓨 ==============

async function fetchSitemap() {
  // 1. 灏濊瘯浠庢湰鍦扮紦瀛樺姞杞?  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Date.now() - cache.fetchedAt < CACHE_MAX_AGE) {
        console.log('[Sitemap] 浠庢湰鍦扮紦瀛樺姞杞?(' + Math.round(cache.urlMap.length / 3) + ' 鏉?');
        return cache;
      }
    } catch (e) {
      // 缂撳瓨鎹熷潖锛岄噸鏂拌幏鍙?    }
  }

  // 2. 浠庣綉缁滆幏鍙?  console.log('[Sitemap] 姝ｅ湪浠庣綉缁滆幏鍙?..');
  const response = await fetch(SITEMAP_URL);
  if (!response.ok) {
    throw new Error('Sitemap fetch failed: ' + response.status);
  }
  const xmlText = await response.text();

  const urlMap = [];
  const locMatches = xmlText.matchAll(/<loc>([^<]+)<\/loc>/gi);
  for (const match of locMatches) {
    const loc = match[1].trim();
    if (loc.includes('/index.html') || loc.includes('鐢熸垚鏂囩珷') || loc.includes('tags/index') || loc.includes('categories/index') || loc.includes('link/index') || loc.includes('guestbook/index') || loc.includes('about/index') || loc.includes('robots.txt')) {
      continue;
    }
    try {
      const urlObj = new URL(loc);
      const pathPart = urlObj.pathname;
      const cleanPath = pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart;
      const parts = cleanPath.split('/');
      const slug = parts[parts.length - 1];
      if (slug) {
        urlMap.push({ slug, url: cleanPath });
        urlMap.push({ slug: slug.replace(/_/g, '-'), url: cleanPath });
        urlMap.push({ slug: slug.replace(/-/g, '_'), url: cleanPath });
      }
    } catch (e) {
      // ignore
    }
  }

  const uniqueCount = Math.round(urlMap.length / 3);
  console.log('[Sitemap] 瑙ｆ瀽瀹屾垚锛屽叡 ' + uniqueCount + ' 鏉℃枃绔?);

  // 3. 淇濆瓨鏈湴缂撳瓨
  const cache = { urlMap, fetchedAt: Date.now() };
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('[Sitemap] 宸茬紦瀛樺埌鏈湴');
  } catch (e) {
    console.log('[Sitemap] 缂撳瓨鍐欏叆澶辫触: ' + e.message);
  }

  return cache;
}

function findArticleUrl(article, cache) {
  const urlMap = cache.urlMap;

  // 鏂规硶1: slug 绮剧‘鍖归厤锛堜笁绉嶅彉浣擄級
  const slugVariants = [article.slug, article.slug.replace(/_/g, '-'), article.slug.replace(/-/g, '_')];
  for (const item of urlMap) {
    if (slugVariants.includes(item.slug)) {
      return item.url;
    }
  }

  // 鏂规硶2: 鏍囬鍏抽敭璇嶉儴鍒嗗尮閰?  const titleWords = article.title
    .replace(/[^a-zA-Z0-9\s-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .map(w => w.toLowerCase());

  for (const item of urlMap) {
    const slugLower = item.slug.toLowerCase();
    const match = titleWords.some(w => slugLower.includes(w) || (w.length > 4 && slugLower.includes(w.split('-')[0])));
    if (match) {
      console.log('[Sitemap] 鏍囬鍖归厤: ' + item.slug + ' <- ' + article.title.substring(0, 40));
      return item.url;
    }
  }

  // 鏂规硶3: 鍥為€€鍒版棫璺緞
  if (article.path && article.path.startsWith('/')) {
    return 'https://snowhoo.net' + article.path;
  }
  return null;
}

// ============== 璇勮鍙戝竷 ==============

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

// ============== 鍒犻櫎 Windows 璁″垝浠诲姟 ==============

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
    console.log('[CommentExecutor] 宸叉竻鐞嗚鍒掍换鍔? Hexo-Bot/' + taskName);
  } catch (e) {
    // ignore
  }
}

// ============== 涓绘祦绋?==============

async function runExecutor() {
  console.log('[CommentExecutor] 寮€濮嬫墽琛岃瘎璁哄彂甯?..');
  console.log('[CommentExecutor] 鎵ц鏃堕棿: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  if (!fs.existsSync(SCHEDULE_FILE)) {
    console.log('[CommentExecutor] 鏈壘鍒拌鍒掓枃浠讹紝璺宠繃鎵ц');
    return;
  }

  const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  if (scheduleData.date !== today) {
    console.log('[CommentExecutor] 璁″垝宸茶繃鏈?' + scheduleData.date + ')锛岃烦杩囨墽琛?);
    return;
  }

  const tasks = scheduleData.schedule;
  console.log('[CommentExecutor] 浠婃棩璁″垝鍏?' + tasks.length + ' 鏉¤瘎璁?);

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
      console.log('[CommentExecutor] 鏈壘鍒板簭鍙蜂负 ' + taskIndex + ' 鐨勮鍒掞紝璺宠繃');
    }
    return;
  }

  // 鑾峰彇 sitemap锛堟湰鍦扮紦瀛樹紭鍏堬級
  let cache = null;
  try {
    cache = await fetchSitemap();
  } catch (err) {
    console.log('[CommentExecutor] Sitemap 鑾峰彇澶辫触锛屼娇鐢ㄦ棫璺緞: ' + err.message);
  }

  for (const task of tasksToRun) {
    const correctUrl = cache ? findArticleUrl(task.article, cache) : null;
    const finalUrl = correctUrl || ('https://snowhoo.net' + task.article.path);

    console.log('[CommentExecutor] [' + task.index + '/' + tasks.length + ']');
    console.log('[CommentExecutor] 鏂囩珷: 銆? + task.article.title + '銆?);
    console.log('[CommentExecutor] 鏃ц矾寰? ' + task.article.path);
    console.log('[CommentExecutor] 瑙ｆ瀽璺緞: ' + finalUrl);
    console.log('[CommentExecutor] 鏄电О: ' + task.nickname + ' | 璇勮: ' + task.comment);

    try {
      const result = await postComment(task.comment, task.nickname, finalUrl);
      console.log('[CommentExecutor] 鎴愬姛 (ID: ' + (result.data ? result.data.objectId : 'N/A') + ')');
      deleteScheduledTask(task.index);
    } catch (err) {
      console.log('[CommentExecutor] 澶辫触: ' + err.message);
    }
  }

  console.log('[CommentExecutor] 鎵ц瀹屾垚');
}

// ============== 鐩存帴杩愯鏃舵墽琛?==============

if (require.main === module) {
  runExecutor()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[CommentExecutor] 寮傚父: ' + err.message);
      process.exit(1);
    });
}

module.exports = { runExecutor, fetchSitemap, findArticleUrl };

