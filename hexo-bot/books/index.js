const express = require('express');
const axios = require('axios');
const cors = require('cors');
const iconv = require('iconv-lite');
const cheerio = require('cheerio');

const app = express();
const PORT = 8989;
const BQ_BASE = 'https://www.biquge500.com';

// 用 Map 缓存书的章节列表，key: bookId，value: { chapters: [], bookUrl }
const chapterCache = {};

app.use(cors());
app.use(express.json());

// ==================== 工具函数 ====================

// GBK URL 编码
function gbkEncode(str) {
  // 使用 iconv-lite 正确将 UTF-8 转换为 GBK 字节的 Buffer
  return iconv.encode(str, 'gbk');
}

// 获取 GBK 编码的搜索关键字（URL safe）
function gbkUrlEncode(str) {
  const buf = gbkEncode(str);
  // 将 GBK 字节转换为 percent 编码
  return Array.from(buf).map(b => '%' + b.toString(16).padStart(2, '0').toUpperCase()).join('');
}

// 带 GBK 编码的 GET 请求
async function fetchPage(url, referer = BQ_BASE) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': referer,
      'Accept': 'text/html,application/xhtml+xml',
    },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  // biquge500 使用 GBK 编码
  const buf = Buffer.from(response.data);
  // 检测 BOM
  let str;
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    str = iconv.decode(buf.slice(3), 'utf-8');
  } else {
    str = iconv.decode(buf, 'gbk');
  }
  return str;
}

// 解析书籍详情页
function parseBookPage(html, bookUrl) {
  const $ = cheerio.load(html);

  // 优先用传入的 URL，否则从 og:url 获取
  let resolvedUrl = bookUrl || $('meta[property="og:url"]').attr('content') || '';

  const info = $('#info');
  const title = info.find('h1').text().trim();
  // 匹配 "作者：xxx" 或 "作    者：xxx" 等各种空格变体
  const authorRaw = info.find('p').eq(0).text().trim();
  const author = authorRaw.replace(/^作[\s\xa0]+者[\s\xa0]*：?/, '').trim() || '';
  const updated = info.find('p').eq(2).text().replace('最后更新：', '').trim();
  const latestChapter = info.find('p').eq(3).find('a').text().trim();

  // 简介：提取 <p> 标签内容，去重后拼接
  const introParagraphs = [];
  const seenTexts = new Set();
  $('#intro p').each((i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && !seenTexts.has(text)) {
      seenTexts.add(text);
      introParagraphs.push(text);
    }
  });
  const introDeduped = introParagraphs.join(' ');

  // 封面：优先用 og:image，其次用 .image img
  const cover = $('meta[property="og:image"]').attr('content') || $('.image img').attr('src') || '';

  // 分类
  const cat = $('meta[property="og:novel:category"]').attr('content') || '';

  // 字数（页面没有直接显示，从 meta 拿不到，从简介估算或留空）
  const wordCount = '';

  // 从 URL 中提取 bookId（格式：/Book/<catid>/<bookid>/）
  const urlMatch = resolvedUrl.match(/\/Book\/(\d+)\/(\d+)\//);
  const catId = urlMatch ? urlMatch[1] : '';
  const bookId = urlMatch ? urlMatch[2] : '';

  // 解析章节列表
  const chapters = [];
  $('#list dl dd').each((i, el) => {
    const $a = $(el).find('a');
    const link = $a.attr('href');
    const chapterTitle = $a.text().trim();
    if (link && chapterTitle) {
      // 章节 ID 是 URL 中的数字部分，如 /Book/2/2867/1558650.html → 1558650
      const chapterId = link.match(/\/(\d+)\.html$/)?.[1] || `ch_${i}`;
      chapters.push({
        id: `${bookId}_${chapterId}`,
        title: chapterTitle,
        link,
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
    wordCount,
    updated,
    longIntro: introDeduped,
    latestChapter,
    chapters,
  };
}

// 解析章节内容页
function parseChapterPage(html) {
  const $ = cheerio.load(html);
  const title = $('#main info h1').text().trim() || $('.bookname h1').text().trim() || '';

  // 尝试多个可能的内容容器
  let content = '';
  const contentSelectors = ['#content', '.content_read #content', '.book_content', '#chapterContent'];
  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length) {
      content = el.html() || '';
      break;
    }
  }

  // 清理内容
  content = content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, (m) => {
      // 保留段落内的换行
      if (m === '<br>' || m === '<br/>' || m === '<br />' || m === '\n') return '\n';
      if (m.startsWith('<img')) return '';
      if (m.startsWith('<font')) return '';
      return '';
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
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

    $('#content table.grid tr').each((i, row) => {
      if (i === 0) return; // 跳过表头
      const $row = $(row);
      const $tds = $row.find('td');
      if ($tds.length < 4) return;

      const $link = $tds.eq(0).find('a');
      const title = $link.text().trim();
      const bookUrl = $link.attr('href');

      // 有些搜索页会直接跳转到书籍详情页（单结果时），而不是显示列表
      if (!bookUrl) return;

      const author = $tds.eq(2).text().trim();
      const updateTime = $tds.eq(4).text().trim();
      const status = $tds.eq(5).text().trim();

      if (!title) return;

      // 提取 bookId
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
        bookUrl, // 爬取详情时用
      });
    });

    // 如果只有一个结果或者搜索直接跳转到详情页
    if (results.length === 0 && $('meta[property="og:novel:book_name"]').length) {
      const directBook = parseBookPage(html, '');
      if (directBook.title) {
        results.push(directBook);
      }
    }

    res.json({ books: results });
  } catch (e) {
    console.error('Search error:', e.message);
    res.json({ books: [], error: e.message });
  }
});

// 书籍详情
app.get('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ message: '缺少书籍ID' });

  try {
    // 先查缓存
    if (chapterCache[id]) {
      const cached = chapterCache[id];
      return res.json({
        _id: id,
        title: cached.title || id,
        author: cached.author || '',
        cover: cached.cover || '',
        cat: cached.cat || '',
        wordCount: '',
        updated: cached.updated || '',
        longIntro: cached.longIntro || '',
      });
    }

    // 从任意已知的分类页构造 URL（尝试常见结构）
    // biquge500 的书籍页格式: /Book/<catId>/<bookId>/
    const possibleUrls = [
      `${BQ_BASE}/Book/1/${id}/`,
      `${BQ_BASE}/Book/2/${id}/`,
      `${BQ_BASE}/Book/3/${id}/`,
      `${BQ_BASE}/Book/4/${id}/`,
      `${BQ_BASE}/Book/5/${id}/`,
      `${BQ_BASE}/Book/6/${id}/`,
      `${BQ_BASE}/Book/7/${id}/`,
      `${BQ_BASE}/Book/21/${id}/`,
    ];

    let bookData = null;
    for (const url of possibleUrls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);
        const ogTitle = $('meta[property="og:novel:book_name"]').attr('content');
        if (ogTitle) {
          bookData = parseBookPage(html, url);
          if (bookData.title) break;
        }
      } catch {
        continue;
      }
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
      `${BQ_BASE}/Book/21/${id}/`,
    ];

    let foundChapters = [];
    let bookMeta = {};

    for (const url of possibleUrls) {
      try {
        const html = await fetchPage(url);
        const $ = cheerio.load(html);
        const ogTitle = $('meta[property="og:novel:book_name"]').attr('content');
        console.log(`[chapters] trying ${url} -> ogTitle: ${ogTitle || 'none'}, dd: ${$('#list dl dd').length}`);
        if (ogTitle) {
          const bookData = parseBookPage(html, url);
          console.log(`[chapters] parseBookPage: title="${bookData.title}", chapters=${bookData.chapters?.length}`);
          if (bookData.title) {
            foundChapters = bookData.chapters || [];
            bookMeta = bookData;
            break;
          }
        }
      } catch {
        continue;
      }
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
    // chapterId 格式是 `${bookId}_${chapterNum}`，需要拆分
    let chapterNum = chapterId;
    let actualBookId = bookId;

    if (chapterId.includes('_')) {
      const parts = chapterId.split('_');
      actualBookId = parts[0];
      chapterNum = parts[1];
    }

    // 尝试从缓存中获取真实 URL
    let realChapterUrl = null;

    if (actualBookId && chapterCache[actualBookId]) {
      const cached = chapterCache[actualBookId].chapters.find(
        ch => ch.id === chapterId || ch.id === `${actualBookId}_${chapterNum}`
      );
      if (cached) {
        realChapterUrl = cached.link;
      }
    }

    // 如果缓存没有，尝试构造 URL
    if (!realChapterUrl && actualBookId) {
      // 尝试常见的分类
      const possibleUrls = [
        `${BQ_BASE}/Book/1/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/2/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/3/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/4/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/5/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/6/${actualBookId}/${chapterNum}.html`,
        `${BQ_BASE}/Book/7/${actualBookId}/${chapterNum}.html`,
      ];

      for (const url of possibleUrls) {
        try {
          const html = await fetchPage(url);
          const $ = cheerio.load(html);
          const title = $('meta[property="og:novel:read_url"]').attr('content');
          if (title) {
            realChapterUrl = url;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!realChapterUrl) {
      return res.status(404).json({ message: '章节不存在' });
    }

    const html = await fetchPage(realChapterUrl);
    const { title, content } = parseChapterPage(html);

    res.json({ title, content });
  } catch (e) {
    console.error('Chapter content error:', e.message);
    res.status(500).json({ message: '获取章节内容失败' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'biquge-scraper', proxy: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Books proxy running at http://0.0.0.0:${PORT} (biquge500 scraper mode)`);
});
