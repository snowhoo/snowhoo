const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 8989;
const ZSS_BASE = 'http://api.zhuishushenqi.com';

app.use(cors());
app.use(express.json());

const chapterCache = {};

// ==================== Mock 数据 ====================
const MOCK_BOOKS = [
  {
    _id: '50865988d7a545903b000009',
    title: '斗破苍穹',
    author: '天蚕土豆',
    cover: 'https://img22.aixdzs.com/bd/27/bd27ef64cdf85b491ca907ec189e0fea.jpg',
    cat: '玄幻',
    wordCount: '5320000',
    updated: '2020-01-16T09:13:45+00:00',
    longIntro: '这里是属于斗气的世界，没有花俏艳丽的魔法，有的，仅仅是繁衍到巅峰的斗气！新书等级制度：斗者，斗师，大斗师，斗灵，斗王，斗皇，斗宗，斗尊，斗圣，斗帝。',
  },
  {
    _id: '52789b8a6c98d21a40000001',
    title: '大主宰',
    author: '天蚕土豆',
    cover: 'https://img22.aixdzs.com/bd/15/3f153f3e4c6e5b8f6a5e2c1b9d4e3f2a.jpg',
    cat: '玄幻',
    wordCount: '4980000',
    updated: '2019-08-20T10:30:00+00:00',
    longIntro: '大千世界，位面交汇，万族林立，群雄荟萃，一位位来自下位面的天之至尊，在这无尽世界，演绎着令人向往的传奇，追求着那主宰之路。',
  },
  {
    _id: '5397d1a5b0d1c91a02000003',
    title: '完美世界',
    author: '辰东',
    cover: 'https://img22.aixdzs.com/bd/08/1a081a4b3c5e6d7f9a2b3c4d5e6f7a8b.jpg',
    cat: '玄幻',
    wordCount: '6120000',
    updated: '2021-03-15T14:22:00+00:00',
    longIntro: '一粒尘可填海，一根草斩尽日月星辰，弹指间天翻地覆。群雄并起，万族林立，诸圣争霸，乱天动地。问苍茫大地，谁主沉浮？',
  },
  {
    _id: '57b5b78c6c98d21a4000000b',
    title: '凡人修仙传',
    author: '忘语',
    cover: 'https://img22.aixdzs.com/bd/22/2f222f3a4c5e6d7f8a1b2c3d4e5f6a7b.jpg',
    cat: '仙侠',
    wordCount: '7450000',
    updated: '2021-12-01T08:00:00+00:00',
    longIntro: '一个普通的山村穷小子，偶然之下，跨入到一个江湖小门派，成了一名记名弟子。他以坚韧的心性，一步步走向巅峰。',
  },
];

const MOCK_CHAPTERS = (bookId) => {
  const count = bookId === '50865988d7a545903b000009' ? 30 : 20;
  return Array.from({ length: count }, (_, i) => ({
    id: `${bookId}_${i + 1}`,
    title: `第${i + 1}章 ${getChapterTitle(i + 1)}`,
    link: `/book/${bookId}/chapters/${i + 1}`,
  }));
};

function getChapterTitle(n) {
  const titles = [
    '陨落的天才', '斗气大陆', '神秘老者', '筑基功法', '家族测试',
    '初露锋芒', '坊市奇遇', '青莲地心火', '炼药师公会', '修炼突破',
    '沙漠之行', '美杜莎女王', '异火融合', '帝都之行', '皇家学院',
    '强敌环伺', '绝地逢生', '惊天一战', '名扬天下', '武帝之秘',
    '域外邪族', '位面征战', '最终决战', '超脱轮回', '重塑天地',
    '回归故里', '故人重逢', '新的征程', '传说终章', '永恒传说',
  ];
  return titles[(n - 1) % titles.length];
}

const MOCK_CONTENT = (chapterId) => {
  const num = parseInt(chapterId.split('_')[1] || '1');
  return `【第${num}章 ${getChapterTitle(num)}】

这里是属于斗气的世界，没有花俏艳丽的魔法，有的，仅仅是繁衍到巅峰的斗气！

夕阳西下，萧家后山，少年萧炎双臂环抱膝盖，呆呆的望着天边那轮血红的夕阳。

"斗之力，三段！"

萧炎低声喃喃着，眼中闪过一抹苦涩。

三段斗之力，这是萧家对修炼斗气者的最基本判定，这个世界上，不论是谁都知道斗气的强大，而在这个世界上，斗气，便是一切的主宰。

萧炎的拳头缓缓紧握，关节处因为用力而泛白。

"我萧炎，三年前可是公认的修炼天才，十五岁便已经是九段斗之气，这样的成绩，放在整个乌坦城，都是数一数二的存在。"

"可三年前那场测试..."少年眼中闪过一抹痛楚，"为什么，为什么我的斗气会突然倒退？"

三年的废物生涯，让得少年原本飞扬跳脱的性子也是渐渐变得沉默了下来。

远处的夕阳缓缓落下，将少年的身影拉得很长很长，孤独而落寞。

"等着吧，乌坦城的年轻一辈，我萧炎一定会再次站起来的！"

少年站起身，拍了拍衣袍上的尘土，眼中重新燃起了坚定的火焰。`;
};

// ==================== 路由 ====================

// 搜索书籍
app.get('/api/books/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json({ books: [] });

  // 优先尝试追书神器真实API
  try {
    // 尝试用书籍ID直接查询（追书神器部分书籍可用）
    const byId = MOCK_BOOKS.find(b => b._id === query);
    if (byId) {
      return res.json({ books: [byId] });
    }
    // 模糊搜索（用mock数据模拟）
    const q = query.toLowerCase();
    const results = MOCK_BOOKS.filter(b =>
      b.title.includes(query) ||
      b.author.includes(query) ||
      b.cat.includes(query)
    );
    return res.json({ books: results });
  } catch {
    // fallback to mock
    const q = query.toLowerCase();
    const results = MOCK_BOOKS.filter(b =>
      b.title.includes(query) || b.author.includes(query)
    );
    res.json({ books: results });
  }
});

// 书籍详情
app.get('/api/books/:id', async (req, res) => {
  const { id } = req.params;
  // 优先用真实API
  try {
    const result = await axios.get(`${ZSS_BASE}/book/${id}`, { timeout: 8000 });
    const b = result.data;
    if (b && b._id) {
      let cover = b.cover || '';
      if (cover.startsWith('/agent/')) {
        cover = decodeURIComponent(cover.replace('/agent/', ''));
      }
      return res.json({
        _id: b._id,
        title: b.title,
        author: b.author,
        cover,
        cat: b.cat || b.majorCate || '',
        wordCount: b.wordCount || '0',
        updated: b.updated,
        longIntro: b.longIntro || b.shortIntro || '',
      });
    }
  } catch { /* fallback */ }

  // Mock
  const book = MOCK_BOOKS.find(b => b._id === id);
  if (book) return res.json(book);
  res.status(404).json({ message: '书籍不存在' });
});

// 书籍章节列表
app.get('/api/books/:id/chapters', async (req, res) => {
  const { id } = req.params;
  const chapters = MOCK_CHAPTERS(id);
  chapterCache[id] = chapters;
  res.json({ chapters });
});

// 章节内容
app.get('/api/chapter/:chapterId', async (req, res) => {
  const { chapterId } = req.params;
  const content = MOCK_CONTENT(chapterId);
  res.json({ content, title: '' });
});

// 书籍列表（mock）
app.get('/api/books', (req, res) => {
  res.json({ books: MOCK_BOOKS, total: MOCK_BOOKS.length, ok: true });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'mock', proxy: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Books proxy running at http://0.0.0.0:${PORT} (mock mode)`);
});
