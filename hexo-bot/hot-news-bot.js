/**
 * hot-news-bot.js
 * 每日热搜晨报/晚报自动生成并发布
 * 直接抓取百度热搜 + 平台搜索补充
 */

const https = require('https');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

// ========== 控制台只输出 tagged 内容 ==========
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  const tag = args[0];
  if (typeof tag === 'string' && /^\[(recv|post|skip|error|news|deploy|done|morning|evening)\]/.test(tag)) {
    originalLog(...args);
  }
};
console.error = (...args) => {
  const tag = args[0];
  if (typeof tag === 'string' && /^\[(error)\]/.test(tag)) {
    originalError(...args);
  }
};

// ========== HTTP 抓取工具 ==========
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? require('https') : require('http');
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...headers
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ========== 直接抓取百度热搜（标题+描述+链接）==========
async function fetchBaiduHot() {
  console.log('[news] 抓取百度热搜...');
  try {
    const html = await httpGet('https://top.baidu.com/board?tab=realtime');
    const match = html.match(/<!--s-data:(\{.*?\})-->/s);
    if (!match) { console.error('[error] 百度热搜数据解析失败'); return []; }
    const json = JSON.parse(match[1]);
    const cards = json?.data?.cards || [];
    for (const card of cards) {
      if (card.component === 'hotList' && Array.isArray(card.content)) {
        // 过滤置顶条目（isTop 字段才是真正的置顶标记）
        const items = card.content.filter(item => {
          const isPinned = item.isTop || item.pin || item.isPinned;
          if (isPinned) console.log('[news] 跳过置顶: ' + (item.query || item.word));
          return !isPinned;
        });
        return items.map(item => ({
          title: item.query || item.word || '',
          desc: item.desc || '',
          url: item.rawUrl || item.url || `https://www.baidu.com/s?wd=${encodeURIComponent(item.query || item.word)}`,
          source: '百度热搜',
          img: item.img || ''
        }));
      }
    }
  } catch (e) {
    console.error('[error] 百度热搜抓取失败:', e.message);
  }
  return [];
}

// ========== 补充抓取微博热搜（RSS + 搜索）==========
async function fetchWeiboHot() {
  console.log('[news] 抓取微博热搜...');
  try {
    // 微博没有公开RSS，但可以通过搜索获取热搜话题
    const queryFile = path.join(os.tmpdir(), `wb_query_${Date.now()}.txt`);
    fs.writeFileSync(queryFile, '微博热搜 今日 最新 2026', 'utf8');
    const skillsRoot = process.env.SKILLS_ROOT || 'C:\\Users\\Administrator\\AppData\\Roaming\\BoClaw\\SKILLs';
    const script = path.join(skillsRoot, 'web-search', 'scripts', 'search.sh').replace(/\\/g, '/');
    const cmd = `bash "${script}" @${queryFile} 8`;
    const raw = execSync(cmd, { encoding: 'utf8', timeout: 30000, env: { ...process.env, SKILLS_ROOT: skillsRoot } });
    fs.unlinkSync(queryFile);
    return parseSearchResults(raw);
  } catch (e) {
    try { fs.unlinkSync(path.join(os.tmpdir(), `wb_query_${Date.now()}.txt`)); } catch (_) {}
    return [];
  }
}

// ========== 补充抓取知乎热榜 ==========
async function fetchZhihuHot() {
  try {
    const html = await httpGet('https://www.zhihu.com/hot');
    const items = [];
    // 知乎热榜在页面JSON中
    const match = html.match(/id="js-initialData"[^>]*>({"props.*?})<\/script>/s);
    if (match) {
      const json = JSON.parse(match[1]);
      const hotList = json?.props?.pageProps?.initialState?.entityCache?.['people:global']?.data || [];
      const items2 = json?.props?.pageProps?.hotList || [];
      for (const item of [...hotList, ...items2].slice(0, 10)) {
        if (item.target?.title) {
          items.push({
            title: item.target.title,
            desc: item.target.excerpt || item.target.description || '',
            url: 'https://www.zhihu.com/question/' + (item.target.id || ''),
            source: '知乎热榜'
          });
        }
      }
    }
    return items;
  } catch (e) {
    return [];
  }
}

// ========== 搜索补充头条等其他平台 ==========
function execSearch(query, maxResults) {
  const queryFile = path.join(os.tmpdir(), `news_q_${Date.now()}.txt`);
  fs.writeFileSync(queryFile, query, 'utf8');
  const skillsRoot = process.env.SKILLS_ROOT || 'C:\\Users\\Administrator\\AppData\\Roaming\\BoClaw\\SKILLs';
  const script = path.join(skillsRoot, 'web-search', 'scripts', 'search.sh').replace(/\\/g, '/');
  try {
    const cmd = `bash "${script}" @${queryFile} ${maxResults}`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 45000, env: { ...process.env, SKILLS_ROOT: skillsRoot } });
    fs.unlinkSync(queryFile);
    return output;
  } catch (e) {
    try { fs.unlinkSync(queryFile); } catch (_) {}
    return e.stdout || '';
  }
}

function parseSearchResults(markdown) {
  const results = [];
  const titles = [...markdown.matchAll(/^##\s+(.+)$/gm)].map(m => m[1]);
  const urls = [...markdown.matchAll(/\*\*URL:\*\*\s*(https?:\/\/[^\s]+)/g)].map(m => m[1]);
  const snippets = [...markdown.matchAll(/(?:\*\*URL:\*\*[^\n]+\n\n)([^\n#][^\n]{10,})/g)].map(m => m[1].trim().slice(0, 150));
  // 过滤掉聚合网站
  const excludeDomains = ['hot.','tophub','mrxhl','faburi','bilione','wan.la','jintiankansha','aidistock'];
  for (let i = 0; i < titles.length; i++) {
    const url = urls[i] || '';
    if (excludeDomains.some(d => url.includes(d))) continue;
    const title = titles[i];
    if (title && title.length > 4 && title.length < 80) {
      results.push({ title, url, snippet: snippets[i] || '', source: '' });
    }
  }
  return results;
}

// ========== 工具函数 ==========
function slugify(str) {
  return str.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 20);
}

// ========== 采集热搜主流程 ==========
async function fetchHotNews(type) {
  console.log('[news] 开始采集热搜...');
  const allNews = [];
  const seenTitles = new Set();

  // 1. 直接抓取百度热搜（最优数据：标题+描述+链接）
  const baiduHot = await fetchBaiduHot();
  for (const item of baiduHot) {
    const key = item.title.replace(/\s+/g, '').slice(0, 15);
    if (key.length > 4 && !seenTitles.has(key)) {
      seenTitles.add(key);
      allNews.push(item);
    }
  }
  console.log(`[news] 百度热搜获取 ${baiduHot.length} 条（已过滤置顶）`);

  // 2. 下载有图片的热搜图片
  const imgDir = path.join('D:/hexo/source/images/hotnews');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
  const now = new Date();
  const datePrefix = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  let imgCount = 0;
  for (let i = 0; i < allNews.length; i++) {
    const item = allNews[i];
    if (item.img) {
      const filename = `${datePrefix}_${type === '晨报' ? 'morning' : 'evening'}_${String(i+1).padStart(2,'0')}.webp`;
      const filepath = path.join(imgDir, filename);
      try {
        const saved = await httpDownload(item.img, filepath);
        if (saved) {
          item.localImg = `/images/hotnews/${filename}`;
          imgCount++;
        }
      } catch (_) {}
      // 每张间隔 300ms，避免过快
      await new Promise(r => setTimeout(r, 300));
    }
  }
  console.log(`[news] 下载图片 ${imgCount} 张`);

  console.log(`[news] 共采集 ${allNews.length} 条热搜`);
  return allNews;
}

// ========== 下载热搜图片（压缩后保存） ==========
async function httpDownload(url, filepath) {
  if (!url) return null;
  const tmpPath = filepath + '.tmp';
  try {
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpPath);
      https.get(url, (res) => {
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        } else { file.close(); fs.unlinkSync(tmpPath); reject(new Error('status ' + res.statusCode)); }
      }).on('error', (err) => { try { file.close(); fs.unlinkSync(tmpPath); } catch (_) {} reject(err); });
    });

    // 压缩：统一转为 WebP，最大宽度 800px，质量 80
    const ext = filepath.endsWith('.jpg') ? '.jpg' : '.webp';
    const finalPath = filepath.replace(/\.(png|jpg|jpeg)$/, '.webp');
    const stat = fs.statSync(tmpPath);
    if (stat.size > 50 * 1024) { // 只压缩 > 50KB 的图片
      await sharp(tmpPath)
        .resize(800, null, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(finalPath);
      const origSize = stat.size;
      const newSize = fs.statSync(finalPath).size;
      console.log(`[news] 图片压缩: ${Math.round(origSize/1024)}KB → ${Math.round(newSize/1024)}KB (节省${Math.round((1-newSize/origSize)*100)}%)`);
    } else {
      // 小图直接转 WebP 不 resize
      await sharp(tmpPath).webp({ quality: 80 }).toFile(finalPath);
    }
    fs.unlinkSync(tmpPath);
    // 如果最终路径变了（.webp），更新引用
    if (finalPath !== filepath) {
      fs.unlinkSync(filepath); // 删除原始未压缩文件
    }
    return finalPath;
  } catch (_) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    return null;
  }
}

// ========== 生成文章内容 ==========
function generatePostContent(newsItems, type) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日`;
  const dateFile = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const title = `${dateStr} 小红故事热搜${type}`;

  let body = `> 来源：互联网 | 采集时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`;

  newsItems.forEach((item, i) => {
    const firstChar = item.title.charAt(0);
    const restTitle = item.title.slice(1);
    body += `### <strong>${firstChar}</strong>${restTitle}\n`;
    if (item.desc) {
      body += `${item.desc}\n`;
    } else if (item.snippet) {
      body += `${item.snippet}\n`;
    }
    // 有图片则插入
    if (item.localImg) {
      body += `\n![](${item.localImg})\n`;
    }
    body += `\n`;
  });

  const frontmatter = {
    title,
    date: now,
    updated: now,
    categories: ['新闻热搜'],
    tags: ['热搜', type === '晨报' ? '今日要闻' : '晚间速递'],
    cover: type === '晨报' ? '/images/hotnews-morning.svg' : '/images/hotnews-evening.svg',
    toc: true,
  };

  const fm = `---\n${Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map(x => `  - ${x}`).join('\n')}`;
    if (v === false || v === true) return `${k}: ${v}`;
    if (v instanceof Date) return `${k}: ${v.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')}`;
    return `${k}: ${v}`;
  }).join('\n')}\n---\n\n`;

  return { fm, body, title, dateFile };
}

// ========== 写 Hexo 文章文件 ==========
function writeHexoPost(title, body, dateFile, type) {
  const postsDir = 'D:/hexo/source/_posts';
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });
  const filename = `${dateFile}_hotnews_${type === '晨报' ? 'morning' : 'evening'}.md`;
  const filepath = path.join(postsDir, filename);
  if (fs.existsSync(filepath)) {
    console.log(`[skip] ${filename} 已存在，跳过`);
    return null;
  }
  fs.writeFileSync(filepath, body, 'utf8');
  console.log(`[post] 已创建: ${filename}`);
  return filepath;
}

function isAlreadyPublished(dateFile, type) {
  const postsDir = 'D:/hexo/source/_posts';
  if (!fs.existsSync(postsDir)) return false;
  const marker = type === '晨报' ? 'hotnews_morning' : 'hotnews_evening';
  const files = fs.readdirSync(postsDir);
  return files.some(f => f.startsWith(dateFile) && f.includes(marker));
}

// ========== 执行 hexo generate + deploy（先备份） ==========
function deploy(type) {
  console.log('[deploy] 开始生成并部署...');
  const hexoDir = 'D:/hexo';
  return new Promise((resolve) => {
    // Step 1: Git 备份
    const gitAdd = spawn('cmd', ['/c', 'git add source/_posts/ source/images/hotnews/'], {
      cwd: hexoDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let gitOut = '';
    gitAdd.stdout.on('data', d => { gitOut += d; });
    gitAdd.stderr.on('data', d => { gitOut += d; });
    gitAdd.on('close', () => {
      const commitMsg = type === '晨报' ? 'post: 热搜晨报推送' : 'post: 热搜晚报推送';
      const gitCommit = spawn('cmd', ['/c', `git commit -m "${commitMsg}"`], {
        cwd: hexoDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
      let commitOut = '';
      gitCommit.stdout.on('data', d => { commitOut += d; });
      gitCommit.stderr.on('data', d => { commitOut += d; });
      gitCommit.on('close', () => {
        if (commitOut.includes('nothing to commit')) {
          console.log('[backup] ⚠️ 无新内容需要提交');
        } else {
          console.log('[backup] ✅ 已提交到 source 分支');
        }

        const gitPush = spawn('cmd', ['/c', 'git push origin source'], {
          cwd: hexoDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        });
        let pushOut = '';
        gitPush.stdout.on('data', d => { pushOut += d; });
        gitPush.stderr.on('data', d => { pushOut += d; });
        gitPush.on('close', () => {
          console.log('[backup] ✅ 已推送到远程 source 分支');

          // Step 2: Hexo generate
          const gen = spawn('cmd', ['/c', 'hexo generate'], {
            cwd: hexoDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
          });
          let genOut = '';
          gen.stdout.on('data', d => { genOut += d; });
          gen.stderr.on('data', d => { genOut += d; });
          gen.on('close', (code) => {
            if (genOut.includes('Generated') || code === 0) {
              console.log('[deploy] 生成完成，开始推送...');
              // Step 3: Hexo deploy
              const dep = spawn('cmd', ['/c', 'hexo deploy'], {
                cwd: hexoDir,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
              });
              let depOut = '';
              dep.stdout.on('data', d => { depOut += d; });
              dep.stderr.on('data', d => { depOut += d; });
              dep.on('close', (dCode) => {
                if (depOut.includes('Deploy done') || dCode === 0) {
                  console.log('[done] 热搜文章发布成功！');
                } else {
                  console.error('[error] 部署失败:', depOut.slice(-200));
                }
                resolve();
              });
            } else {
              console.error('[error] hexo generate 失败');
              resolve();
            }
          });
        });
      });
    });
  });
}

// ========== 主程序 ==========
async function main() {
  const hour = new Date().getHours();
  const type = hour >= 6 && hour < 18 ? '晨报' : '晚报';
  console.log(`[${type === '晨报' ? 'morning' : 'evening'}] 当前时间 ${hour}:00，生成${type}`);

  const now = new Date();
  const dateFile = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  if (isAlreadyPublished(dateFile, type)) {
    console.log(`[skip] ${dateFile} ${type} 已发布过，跳过`);
    return;
  }

  const news = await fetchHotNews(type);
  if (news.length === 0) {
    console.error('[error] 未能获取到热搜数据');
    return;
  }

  const { fm, body, title, dateFile: df } = generatePostContent(news, type);
  const filepath = writeHexoPost(title, fm + body, df, type);
  if (filepath) {
    await deploy(type);
  }
}

main().catch(e => console.error('[error]', e.message));
