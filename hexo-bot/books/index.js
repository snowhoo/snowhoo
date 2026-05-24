const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 8989;

const ZHAISHU_BASE = 'https://api.zhuishushenqi.com';

// 图片 CDN 路径转换
const IMG_PROXY = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `https://statics.zhuishushenqi.com${path}`;
};

app.use(cors());
app.use(express.json());

// 搜索书籍
app.get('/api/books/search', async (req, res) => {
  try {
    const { query } = req.query;
    const result = await axios.get(`${ZHAISHU_BASE}/book/fuzzy-search`, {
      params: { query },
      timeout: 10000,
    });
    const books = (result.data.books || []).map(b => ({
      _id: b._id,
      title: b.title,
      author: b.author,
      cover: IMG_PROXY(b.cover),
      cat: b.cat,
      wordCount: b.wordCount,
      updated: b.updated,
      longIntro: b.longIntro,
    }));
    res.json({ books });
  } catch (err) {
    res.status(500).json({ message: '搜索失败', error: err.message });
  }
});

// 书籍详情
app.get('/api/books/:id', async (req, res) => {
  try {
    const result = await axios.get(`${ZHAISHU_BASE}/book/${req.params.id}`, {
      timeout: 10000,
    });
    const b = result.data;
    res.json({
      _id: b._id,
      title: b.title,
      author: b.author,
      cover: IMG_PROXY(b.cover),
      cat: b.cat,
      wordCount: b.wordCount,
      updated: b.updated,
      longIntro: b.longIntro,
    });
  } catch (err) {
    res.status(500).json({ message: '获取书籍详情失败', error: err.message });
  }
});

// 书籍章节列表
app.get('/api/books/:id/chapters', async (req, res) => {
  try {
    const result = await axios.get(`${ZHAISHU_BASE}/mix-atoc/${req.params.id}`, {
      timeout: 10000,
    });
    const chapters = (result.data.chapters || []).map(ch => ({
      id: ch.id,
      title: ch.title,
      link: ch.link,
    }));
    res.json({ chapters });
  } catch (err) {
    res.status(500).json({ message: '获取章节列表失败', error: err.message });
  }
});

// 章节内容
app.get('/api/chapter/:id', async (req, res) => {
  try {
    const result = await axios.get(`${ZHAISHU_BASE}/chapter/${req.params.id}`, {
      timeout: 10000,
    });
    const ch = result.data.chapter || {};
    res.json({
      id: ch.id,
      title: ch.title,
      content: ch.cpContent || ch.content || '',
    });
  } catch (err) {
    res.status(500).json({ message: '获取章节内容失败', error: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Books proxy running at http://localhost:${PORT}`);
});
