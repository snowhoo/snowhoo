const express = require('express');
const axios = require('axios');
const cors = require('cors');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

const app = express();
const PORT = 8989;
const BQ_BASE = 'https://www.biquge500.com';

// 缓存：key: bookId，value: { chapters: [], ...bookMeta }
const chapterCache = {};

app.use(cors());
app.use(express.json());

// ==================== 工具函数 ====================

// GBK URL 编码
function gbkEncode(str) {
  return iconv.encode(str, 'gbk');
}

// 获取 GBK 编码的搜索关键字（URL safe）
function gbkUrlEncode(str) {
  const buf = gbkEncode(str);
  return Array.from(buf).map(b => '%' + b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

// 带 GBK 编码的 GET 请求
async function fetchPage(url, referer) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': referer || BQ_BASE,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  const buf = Buffer.from(response.data);
  let str;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    str = iconv.decode(buf.slice(3), 'utf-8');
  } else {
    str = iconv.decode(buf, 'gbk');
  }
  return str;
}

// 检查页面是否是有效的书籍页面
function isValidBookPage($) {
  const ogBookName = $('meta[property="og:novel:book_name"]').attr('content');
  const h1 = $('#info h1').text().trim();
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  // og:description 包含中文且长度超过20则认为有效
  const hasChineseDesc = ogDesc.length > 20;
  return !!(ogBookName || h1 || hasChineseDesc);
}

// 从已知的书籍 URL 解析书籍信息（用于 catId=0 等特殊页面）
function parseBookPageFromUrl(html, bookUrl) {
  const $ = cheerio.load(html);
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImg = $('meta[property="og:image"]').attr('content') || '';
  const ogUrl = $('meta[property="og:url"]').attr('content') || bookUrl || '';

  // 从 og:description 提取书名（格式：《书名》还不错...）
  const titleMatch = ogDesc.match(/《([^》]+)》/);
  const title = titleMatch ? titleMatch[1] : '';

  // 从 URL 提取 bookId
  const urlMatch = ogUrl.match(/\/Book\/\d+\/(\d+)\//);
  const bookId = urlMatch ? urlMatch[2] : '';

  // 解析章节列表
  const chapters = [];
  $('#list dl dd').each((i, el) => {
    const $a = $(el).find('a');
    const link = $a.attr('href');
    const chapterTitle = $a.text().trim();
    if (link && chapterTitle) {
      const chapterId = link.match(/\/(\d+)\.html$/)?.[1] || `ch_${i}`;
      chapters.push({
        id: `${bookId}_${chapterId}`,
        title: chapterTitle,
        link: resolveUrl(link),
        bookId,
      });
    }
  });

  return {
    _id: bookId,
    title,
    author: '',
    cover: ogImg,
    cat: '',
    wordCount: '',
    updated: '',
    longIntro: ogDesc,
    latestChapter: '',
    chapters,
  };
}

// 确保 URL 是完整的
function resolveUrl(link) {
  if (!link) return null;
  if (link.startsWith('http')) return link;
  return BQ_BASE + link;
}

// 解析书籍详情页
function parseBookPage(html, bookUrl) {
  const $ = cheerio.load(html);

  // 优先用传入的 URL，否则从 og:url 获取
  const resolvedUrl = bookUrl || $('meta[property="og:url"]').attr('content') || '';

  const info = $('#info');
  const h1Title = info.find('h1').text().trim();
  // 尝试从 og:description 提取书名（《书名》...）
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const titleFromDesc = (ogDesc.match(/《([^》]+)》/) || [])[1] || '';
  const title = h1Title || titleFromDesc || '';
  const authorRaw = info.find('p').eq(0).text().trim();
  const author = authorRaw.replace(/^作[\s\xa0]+者[\s\xa0]*：?/, '').trim() || '';
  const updated = info.find('p').eq(2).text().replace('最后更新：', '').trim();
  const latestChapter = info.find('p').eq(3).find('a').text().trim();

  // 简介：优先用 #intro p 标签，去重后拼接；fallback 到 og:description
  const introParagraphs = [];
  const seenTexts = new Set();
  let longIntro = '';
  $('#intro p').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && !seenTexts.has(text)) {
      seenTexts.add(text);
      introParagraphs.push(text);
    }
  });
  if (introParagraphs.length > 0) {
    longIntro = introParagraphs.join(' ');
  } else if (ogDesc) {
    // 用 og:description 替代，清理 HTML 实体
    longIntro = ogDesc.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  // 封面
  const cover = $('meta[property="og:image"]').attr('content') || '';

  // 分类
  const cat = $('meta[property="og:novel:category"]').attr('content') || '';

  // 从 URL 中提取 bookId（格式：/Book/<catid>/<bookid>/）
  const urlMatch = resolvedUrl.match(/\/Book\/(\d+)\/(\d+)\//);
  const bookId = urlMatch ? urlMatch[2] : '';

  // 解析章节列表
  const chapters = [];
  $('#list dl dd').each((i, el) => {
    const $a = $(el).find('a');
    const link = $a.attr('href');
    const chapterTitle = $a.text().trim();
    if (link && chapterTitle) {
      const chapterId = link.match(/\/(\d+)\.html$/)?.[1] || `ch_${i}`;
      chapters.push({
        id: `${bookId}_${chapterId}`,
        title: chapterTitle,
        link: resolveUrl(link),
        bookId,
      });
    }
  });

  return {
    _id: bookId,
    title,
    author,
    cover,
    cat,
    wordCount: '',
    updated,
    longIntro,
    latestChapter,
    chapters,
  };
}

// 解析章节内容页
function parseChapterPage(html) {
  const $ = cheerio.load(html);
  const title = $('#maininfo h1').text().trim()
    || $('.bookname h1').text().trim()
    || $('meta[property="og:novel:read_url"]').attr('content') || '';

  // 内容容器
  let content = '';
  for (const sel of ['#content', '.content_read #content', '.book_content']) {
    const el = $(sel);
    if (el.length) { content = el.html() || ''; break; }
  }

  // 清理内容
  content = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<font[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, content };
}

// ==================== 路由 ====================

// 搜索书籍
app.get('/api/books/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ books: [] });

  try {
    const encoded = gbkUrlEncode(query);
    const searchUrl = `${BQ_BASE}/modules/article/search.php?searchkey=${encoded}`;
    const html = await fetchPage(searchUrl);
    const $ = cheerio.load(html);
    const results = [];

    // 解析搜索结果列表
    $('#content table.grid tr').each((i, row) => {
      if (i === 0) return;
      const $tds = $(row).find('td');
      if ($tds.length < 4) return;

      const $link = $tds.eq(0).find('a');
      const title = $link.text().trim();
      const bookUrl = $link.attr('href');
      if (!title || !bookUrl) return;

      const author = $tds.eq(2).text().trim();
      const updateTime = $tds.eq(4).text().trim();
      const status = $tds.eq(5).text().trim();
      const urlMatch = bookUrl.match(/\/Book\/\d+\/(\d+)\//);
      const bookId = urlMatch ? urlMatch[1] : '';

      results.push({
        _id: bookId,
        title,
        author,
        updated: updateTime,
        cat: status === '完本' ? '完结' : '连载',
        cover: '',
        wordCount: '',
        longIntro: '',
        bookUrl: resolveUrl(bookUrl),
      });
    });

    // 单结果（搜索直接跳转到详情页）
    if (results.length === 0 && isValidBookPage($)) {
      const bookData = parseBookPage(html, '');
      if (bookData.title) {
        // 搜索结果不包含章节，避免返回过大的数据
        const { chapters, ...bookMeta } = bookData;
        results.push(bookMeta);
      }
    }

    res.json({ books: results });
  } catch (e) {
    console.error('Search error:', e.message);
    res.json({ books: [] });
  }
});

// 书籍详情
app.get('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: '缺少书籍ID' });

  try {
    if (chapterCache[id]) {
      const c = chapterCache[id];
      return res.json({
        _id: id,
        title: c.title || id,
        author: c.author || '',
        cover: c.cover || '',
        cat: c.cat || '',
        wordCount: '',
        updated: c.updated || '',
        longIntro: c.longIntro || '',
      });
    }

    // 尝试多个分类路径（也包括 catId=0）
    const possibleUrls = [
      `${BQ_BASE}/Book/1/${id}/`,
      `${BQ_BASE}/Book/2/${id}/`,
      `${BQ_BASE}/Book/3/${id}/`,
      `${BQ_BASE}/Book/4/${id}/`,
      `${BQ_BASE}/Book/5/${id}/`,
      `${BQ_BASE}/Book/6/${id}/`,
      `${BQ_BASE}/Book/7/${id}/`,
      `${BQ_BASE}/Book/0/${id}/`,
      `${BQ_BASE}/Book/21/${id}/`,
      `${BQ_BASE}/Book/22/${id}/`,
      `${BQ_BASE}/Book/23/${id}/`,
      `${BQ_BASE}/Book/24/${id}/`,
      `${BQ_BASE}/Book/25/${id}/`,
      `${BQ_BASE}/Book/26/${id}/`,
      `${BQ_BASE}/Book/27/${id}/`,
    ];

    let bookData = null;
    for (const url of possibleUrls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);
        if (isValidBookPage($)) {
          bookData = parseBookPage(html, url);
          if (bookData.title) break;
        }
      } catch { continue; }
    }

    if (bookData && bookData.title) {
      res.json(bookData);
    } else {
      res.status(404).json({ message: '书籍不存在' });
    }
  } catch (e) {
    console.error('Book detail error:', e.message);
    res.status(500).json({ message: '获取书籍详情失败' });
  }
});

// 书籍章节列表
app.get('/api/books/:id/chapters', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: '缺少书籍ID' });

  try {
    if (chapterCache[id] && chapterCache[id].chapters.length > 0) {
      return res.json({ chapters: chapterCache[id].chapters });
    }

    const possibleUrls = [
      `${BQ_BASE}/Book/1/${id}/`,
      `${BQ_BASE}/Book/2/${id}/`,
      `${BQ_BASE}/Book/3/${id}/`,
      `${BQ_BASE}/Book/4/${id}/`,
      `${BQ_BASE}/Book/5/${id}/`,
      `${BQ_BASE}/Book/6/${id}/`,
      `${BQ_BASE}/Book/7/${id}/`,
      `${BQ_BASE}/Book/0/${id}/`,
      `${BQ_BASE}/Book/21/${id}/`,
      `${BQ_BASE}/Book/22/${id}/`,
      `${BQ_BASE}/Book/23/${id}/`,
      `${BQ_BASE}/Book/24/${id}/`,
      `${BQ_BASE}/Book/25/${id}/`,
      `${BQ_BASE}/Book/26/${id}/`,
      `${BQ_BASE}/Book/27/${id}/`,
    ];

    let foundChapters = [];
    let bookMeta = {};

    for (const url of possibleUrls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);
        if (isValidBookPage($)) {
          const bookData = parseBookPage(html, url);
          if (bookData.title && bookData.chapters.length > 0) {
            foundChapters = bookData.chapters;
            const { chapters: _, ...meta } = bookData;
            bookMeta = meta;
            break;
          }
        }
      } catch { continue; }
    }

    if (foundChapters.length > 0) {
      chapterCache[id] = { chapters: foundChapters, ...bookMeta };
      res.json({ chapters: foundChapters });
    } else {
      res.json({ chapters: [] });
    }
  } catch (e) {
    console.error('Chapters error:', e.message);
    res.json({ chapters: [] });
  }
});

// 章节内容
app.get('/api/chapter/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  const { bookId } = req.query;

  if (!chapterId) return res.status(400).json({ message: '缺少章节ID' });

  try {
    // 解析 chapterId（格式：bookId_chapterNum 或直接是 chapterNum）
    let chapterNum = chapterId;
    let actualBookId = bookId || '';

    if (chapterId.includes('_')) {
      const parts = chapterId.split('_');
      actualBookId = parts[0];
      chapterNum = parts[1];
    }

    let chapterUrl = null;

    // 优先从缓存获取
    if (actualBookId && chapterCache[actualBookId]) {
      const cached = chapterCache[actualBookId].chapters.find(
        ch => ch.id === chapterId || ch.id === `${actualBookId}_${chapterNum}`
      );
      if (cached) chapterUrl = cached.link;
    }

    // 缓存没有则尝试构造 URL
    if (!chapterUrl && actualBookId) {
      for (const catId of [0, 1, 2, 3, 4, 5, 6, 7, 21, 22, 23, 24, 25, 26, 27]) {
        try {
          const testUrl = `${BQ_BASE}/Book/${catId}/${actualBookId}/${chapterNum}.html`;
          const html = await fetchPage(testUrl);
          const $ = cheerio.load(html);
          if ($('meta[property="og:novel:read_url"]').attr('content')) {
            chapterUrl = testUrl;
            break;
          }
        } catch { continue; }
      }
    }

    if (!chapterUrl) {
      return res.status(404).json({ message: '章节不存在' });
    }

    const html = await fetchPage(chapterUrl);
    const { title, content } = parseChapterPage(html);
    res.json({ title, content });
  } catch (e) {
    console.error('Chapter error:', e.message);
    res.status(500).json({ message: '获取章节内容失败' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'biquge500-scraper' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Books proxy running at http://0.0.0.0:${PORT} (biquge500 scraper mode)`);
});
