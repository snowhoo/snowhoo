const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 8989;
const EGG_BASE = 'http://localhost:8080';
const chapterCache = {};

app.use(cors());
app.use(express.json());

// 搜索书籍
app.get('/api/books/search', async (req, res) => {
  try {
    const { query } = req.query;
    const result = await axios.get(`${EGG_BASE}/search`, {
      params: { query },
      timeout: 15000,
    });
    const books = (result.data.books || []).map(b => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      cover: b.cover || '',
      cat: b.cat,
      wordCount: b.wordCount,
      updated: b.updated,
      longIntro: b.shortIntro || b.longIntro,
    }));
    res.json({ books });
  } catch (err) {
    res.status(500).json({ message: '搜索失败', error: err.message });
  }
});

// 书籍详情
app.get('/api/books/:id', async (req, res) => {
  try {
    const result = await axios.get(`${EGG_BASE}/book/${req.params.id}`, {
      timeout: 15000,
    });
    const b = result.data;
    res.json({
      _id: b._id,
      title: b.title,
      author: b.author,
      cover: b.cover || '',
      cat: b.cat,
      wordCount: b.wordCount,
      updated: b.updated,
      longIntro: b.longIntro || b.shortIntro,
    });
  } catch (err) {
    res.status(500).json({ message: '获取书籍详情失败', error: err.message });
  }
});

// 书籍章节列表
app.get('/api/books/:id/chapters', async (req, res) => {
  try {
    const bookId = req.params.id;
    const result = await axios.get(`${EGG_BASE}/book/${bookId}/chapters`, {
      timeout: 15000,
    });
    const chapters = (result.data.chapters || []).map(ch => ({
      id: ch.id,
      title: ch.title,
      link: ch.link,
    }));
    chapterCache[bookId] = chapters;
    res.json({ chapters });
  } catch (err) {
    res.status(500).json({ message: '获取章节列表失败', error: err.message });
  }
});

// 章节内容
app.get('/api/chapter/:chapterId', async (req, res) => {
  try {
    const { chapterId } = req.params;
    let { bookId } = req.query;

    if (!bookId) {
      for (const [bid, chapters] of Object.entries(chapterCache)) {
        if (chapters.find(c => String(c.id) === String(chapterId))) {
          bookId = bid;
          break;
        }
      }
    }

    if (!bookId) {
      return res.status(404).json({ message: '请先加载目录' });
    }

    const result = await axios.get(`${EGG_BASE}/book/${bookId}/chapters/${chapterId}`, {
      timeout: 15000,
    });
    res.json({ content: result.data.content || '', title: result.data.title });
  } catch (err) {
    res.status(500).json({ message: '获取章节内容失败', error: err.message });
  }
});

// 书籍列表（按分类/排序）
app.get('/api/books', async (req, res) => {
  try {
    const { start = 0, limit = 20, type = 'new' } = req.query;
    const result = await axios.get(`${EGG_BASE}/books`, {
      params: { start, limit, type },
      timeout: 15000,
    });
    const books = (result.data.books || []).map(b => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      cover: b.cover || '',
      cat: b.cat,
      wordCount: b.wordCount,
      updated: b.updated,
      longIntro: b.shortIntro || b.longIntro,
    }));
    res.json({ ...result.data, books });
  } catch (err) {
    res.status(500).json({ message: '获取书籍列表失败', error: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', proxy: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Books proxy (Express) running at http://0.0.0.0:${PORT}`);
  console.log(`Forwarding to Egg.js API at http://localhost:8080`);
});
