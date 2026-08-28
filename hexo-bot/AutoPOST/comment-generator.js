/**
 * 评论内容实时生成器（混合模式）
 * ------------------------------------------------------------
 * 设计目标：替代原来写死的 REACTIONS 模板库（每类仅 ~10 句，极易重复）。
 *
 * 生成时机：由 comment-executor.js 在「发评论的那一刻」调用，而非凌晨预生成。
 *
 * 混合策略：
 *   1) 若配置了 LLM（DeepSeek，且提供了 apiKey）→ 抓取文章标题/摘要，
 *      调用大模型实时写一句自然短评 + 昵称，每次都唯一、贴合内容。
 *   2) 若 LLM 未启用 / 缺 key / 调用失败 → 自动降级到本地碎片组合生成器，
 *      每类由「开头+主体+结尾」随机拼接，可组合出上千种不重复组合。
 *
 * 配置（auto-poster.config.json 的 llm 字段，或环境变量 DEEPSEEK_API_KEY）：
 *   llm.enabled     : true/false
 *   llm.provider    : 目前仅 'deepseek'
 *   llm.apiKey      : sk-...（留空则自动走本地；也可用环境变量注入，避免入库）
 *   llm.baseURL     : 'https://api.deepseek.com/v1'
 *   llm.model       : 'deepseek-chat'
 *   llm.timeoutMs   : 8000
 *   llm.fallbackToLocal : true
 */

const fs = require('fs');
const path = require('path');

// ============== LLM 配置 ==============
const LLM_DEFAULTS = {
  enabled: false,
  provider: 'deepseek',
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  timeoutMs: 8000,
  fallbackToLocal: true
};

function loadLlmConfig() {
  const cfg = Object.assign({}, LLM_DEFAULTS);
  try {
    const p = path.join(__dirname, 'auto-poster.config.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (raw && raw.llm && typeof raw.llm === 'object') {
      Object.assign(cfg, raw.llm);
    }
  } catch (e) { /* 配置缺失则用默认 */ }

  // 环境变量优先（避免把密钥写进仓库）
  const envKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (envKey) cfg.apiKey = envKey;

  // 没有 key 时视为未启用，自动降级本地
  cfg.enabled = !!cfg.enabled && !!cfg.apiKey;
  return cfg;
}

// ============== 分类识别（与旧 generateComment 的判定逻辑一致）==============
function deriveCategory(articleUrl) {
  const url = (articleUrl || '').toLowerCase();

  if (/(^|\/)tv(_p)?\.html|播霸|影视|视频|电影|剧|纪录片|综艺|短剧/.test(url)) return 'video';
  if (/(^|\/)app\.html|修真小世界|小世界|修炼/.test(url)) return 'app';
  if (/reader|小红故事|故事|小说|短篇/.test(url)) return 'reader';
  if (/yedu|夜读|晚安|入睡|睡前|今夜|今晚|夜语/.test(url)) return 'nightRead';
  if (/zjsz|照见苏州|苏州|城市|江南/.test(url)) return 'city';
  if (/daliynews|news|新闻|资讯|日报|早报/.test(url)) return 'news';
  if (/[诗|词|曲|赋|颂|歌行|古风]/.test(url)) return 'poetry';
  if (/名言|语录|daily-quote|金句/.test(url) || /——/.test(url)) return 'quote';
  if (/技术|编程|代码|教程|前端|后端|系统|架构|算法|开源|框架/.test(url)) return 'tech';
  if (/情感|心情|随笔|感悟|温柔|感动|想念|爱|悲伤|难过|快乐|幸福|治愈|疗伤/.test(url)) return 'emotion';
  if (/劳动|工作|职场|加班|上班|奋斗|拼搏/.test(url)) return 'work';
  if (/节|假|日/.test(url)) return 'holiday';
  if (/四季|春天|夏日|秋风|冬雪|山川|河流|草木|花开|叶落|风景/.test(url)) return 'nature';
  if (/年|历史|岁月|时光|年代|那些年|那年/.test(url)) return 'history';
  if (/书|读后|读《|·《|读书|阅读/.test(url)) return 'book';
  return 'generic';
}

// ============== 昵称生成（本地，作为 LLM 失败兜底 / 本地模式）==============
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

// ============== 本地碎片组合生成（兜底 / 无 key 时使用）==============
// 每类由「开头 + 主体 + 结尾」三段随机拼接 → 6×6×6 = 216+ 组合，远超旧库 10 句
const LOCAL_BANK = {
  video: {
    open: ['这片子', '这剧', '这部', '这个视频', '这综艺', '这纪录片'],
    core: ['看得人很过瘾', '氛围感直接拉满', '后劲有点大', '节奏拿捏得刚好', '演技太在线了', '画面质感绝了'],
    end: ['，已加收藏', '，回头二刷', '，强烈安利', '，追定了', '，期待下一部', '，宝藏级别']
  },
  app: {
    open: ['这个小世界', '界面', '玩法', '每天', '功能', '内容'],
    core: ['越来越顺手了', '真有意思', '让人停不下来', '越来越丰富了', '挺对胃口的', '默默上头'],
    end: ['，已安利给朋友', '，天天来逛', '，支持一下', '，打卡成功', '，越用越喜欢', '，强烈推荐']
  },
  reader: {
    open: ['这个故事', '主角', '文笔', '情节', '这短短一篇', '追更中，'],
    core: ['太好看了', '写得很动人', '让人心里暖暖的', '一口气读完了', '意犹未尽', '很有画面感'],
    end: ['，催更！', '，期待下一篇', '，已收藏', '，想二刷', '，被圈粉了', '，写得太好了']
  },
  nightRead: {
    open: ['夜读时光', '睡前读到', '每晚', '这段', '声音', '文字'],
    core: ['最安静', '很治愈', '让人安心', '温柔得刚好', '适合入眠', '像老朋友聊天'],
    end: ['，谢谢分享', '，伴我入眠', '，已成了习惯', '，收藏了', '，晚安', '，很喜欢']
  },
  city: {
    open: ['苏州', '江南', '这座城', '街巷', '小桥流水', '照片'],
    core: ['真美', '韵味十足', '让人安心', '烟火气满满', '故事动人', '温柔得不像话'],
    end: ['，想去走走', '，已列入清单', '，看完很治愈', '，收藏了', '，太治愈了', '，心都静了']
  },
  news: {
    open: ['这条', '资讯', '动态', '消息', '报道', '内容'],
    core: ['很及时', '信息量挺大', '值得转发', '说到了点子上', '干货满满', '跟进一下'],
    end: ['，已关注', '，收藏了', '，谢谢播报', '，得空细看', '，标记一下', '，持续关注']
  },
  poetry: {
    open: ['这句', '这意境', '诗词', '读来', '古人的', '韵律'],
    core: ['太美了', '让人沉醉', '唇齿生香', '穿越千年仍动人', '余味悠长', '写尽心事'],
    end: ['，记下来了', '，要背下来', '，反复品读', '，收藏了', '，越读越有味', '，送给自己']
  },
  quote: {
    open: ['这话', '这句', '说得', '道理', '金句', '读罢'],
    core: ['真好', '到心坎里了', '值得细品', '很受用', '让人清醒', '温暖有力'],
    end: ['，收藏了', '，共勉', '，记下了', '，送给你', '，受益匪浅', '，反复读']
  },
  tech: {
    open: ['这篇', '思路', '干货', '内容', '方法', '实操'],
    core: ['学到了', '很实用', '解决了我的问题', '清晰明了', '干货满满', '正需要'],
    end: ['，已关注', '，收藏了', '，谢谢分享', '，准备试试', '，mark一下', '，受教了']
  },
  emotion: {
    open: ['文字', '这段话', '看得', '故事', '情绪', '读完'],
    core: ['很治愈', '被戳中了', '让人共鸣', '暖暖的', '说出了心声', '眼眶有点热'],
    end: ['，谢谢分享', '，收藏了', '，抱抱自己', '，感同身受', '，已存下', '，晚安']
  },
  work: {
    open: ['劳动', '奋斗', '努力的人', '工作', '日常', '此刻'],
    core: ['最光荣', '最幸福', '值得尊敬', '加油', '从不辜负', '闪闪发光'],
    end: ['，致敬', '，共勉', '，冲呀', '，辛苦了', '，支持你', '，继续前行']
  },
  holiday: {
    open: ['节日', '这天', '假日期', '氛围', '此刻', '祝福'],
    core: ['快乐', '同乐', '真热闹', '让人放松', '充满期待', '很治愈'],
    end: ['，同乐', '，收下了', '，谢谢分享', '，开心', '，纪念一下', '，平安喜乐']
  },
  nature: {
    open: ['风景', '四季', '画面', '大自然', '草木', '这方'],
    core: ['好美', '让人平静', '心旷神怡', '如诗如画', '温柔治愈', '生机盎然'],
    end: ['，想去走走', '，收藏了', '，心都化了', '，太治愈了', '，记下了', '，静静欣赏']
  },
  history: {
    open: ['岁月', '时光', '那些年', '往事', '年代', '读史'],
    core: ['匆匆', '如梭', '让人感慨', '沉淀下来', '意味深长', '温柔又苍凉'],
    end: ['，怀念', '，感慨万千', '，收藏了', '，思绪万千', '，记下了', '，久久回味']
  },
  book: {
    open: ['这本书', '读后感', '推荐', '书里', '文字', '这册'],
    core: ['也想读', '写得好', '被种草了', '很受启发', '值得细读', '温暖有力'],
    end: ['，已加清单', '，谢谢推荐', '，收藏了', '，准备读', '，mark一下', '，受益匪浅']
  },
  generic: {
    open: ['默默', '路过', '今天', '随手', '专程', '悄悄'],
    core: ['来支持一下', '来打个卡', '来冒个泡', '来看看', '来捧个场', '来留个言'],
    end: ['，加油', '，关注了', '，赞一个', '，常来', '，挺不错', '，顶']
  }
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateLocal(ctx) {
  const cat = (ctx && ctx.category) || 'generic';
  const bank = LOCAL_BANK[cat] || LOCAL_BANK.generic;
  const comment = pick(bank.open) + pick(bank.core) + pick(bank.end);
  return { nick: generateNickname(), comment };
}

// ============== HTTP 文本抓取（带超时，best-effort）==============
async function fetchText(u, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(u, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HexoBot/1.0)' }
    });
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

// ============== 抓文章上下文（标题/摘要/分类）==============
// task: { url, title?, category?, page? }
async function fetchArticleContext(task) {
  const url = task.url || '';
  const category = task.category || deriveCategory(url);
  let title = task.title || '';
  let content = '';

  try {
    if (/zjsz_p\.html\?a=/.test(url)) {
      // 从 data.js 按 msgid 取真实中文标题
      const m = url.match(/a=([^&]+)/);
      const msgid = m ? decodeURIComponent(m[1]) : '';
      if (msgid) {
        const txt = await fetchText('https://snowhoo.net/js/sevencolor/1/zjsz_data/data.js');
        const dm = txt.match(/var ARTICLE_DATA\s*=\s*(\[[\s\S]*?\])\s*;/);
        if (dm) {
          const data = JSON.parse(dm[1]);
          const art = data.find(a => String(a.msgid) === String(msgid));
          if (art && art.title) title = art.title;
        }
      }
    } else if (/\/20\d{2}\/\d{2}\/\d{2}\//.test(url) || /\.html?$/.test(url)) {
      // 博客文章：抓页面标题 + meta 描述
      const full = 'https://snowhoo.net' + (url.startsWith('/') ? url : '/' + url);
      const html = await fetchText(full);
      const t = html.match(/<title>([^<]*)<\/title>/i);
      if (t) title = t[1].replace(/\s*[_\-|].*$/, '').trim();
      const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
      if (desc) content = desc[1].slice(0, 120);
    }
  } catch (e) {
    // 抓取失败不影响生成，降级用已有 title/category
  }

  return { title, content, category };
}

// ============== 调用 DeepSeek 实时生成 ==============
async function generateWithLLM(ctx) {
  const cfg = loadLlmConfig();
  if (!cfg.enabled || !cfg.apiKey) throw new Error('LLM 未启用或缺少 apiKey');

  const sys = '你是博客评论区里爱凑热闹的普通访客。根据文章信息，写一条像真人随手留的短评'
    + '（不超过25个汉字，只用中文标点，不要表情符号、不要引号、不要 Markdown、不要换行）'
    + '和一个网络昵称（2-6个汉字或字符）。只输出 JSON：{"nick":"...","comment":"..."}，不要任何其他文字。';

  const userParts = [];
  if (ctx.title) userParts.push('文章标题：' + ctx.title);
  userParts.push('文章分类：' + (ctx.category || 'general'));
  if (ctx.content) userParts.push('摘要：' + ctx.content);
  userParts.push('请直接输出 JSON。');

  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: userParts.join('\n') }
    ],
    temperature: 0.95,
    max_tokens: 80,
    response_format: { type: 'json_object' }
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res;
  try {
    res = await fetch(cfg.baseURL + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const j = await res.json();
  const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) throw new Error('LLM 空响应');

  let txt = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(txt);
  if (!parsed.comment) throw new Error('LLM 返回缺少 comment');

  return {
    nick: String(parsed.nick || generateNickname()).slice(0, 12),
    comment: String(parsed.comment).slice(0, 60)
  };
}

// ============== 混合入口 ==============
// task: { url, title?, category?, page? }
async function generateComment(task) {
  const ctx = await fetchArticleContext(task);
  const cfg = loadLlmConfig();

  if (cfg.enabled && cfg.apiKey) {
    try {
      return await generateWithLLM(ctx);
    } catch (e) {
      console.log('[Gen] LLM 生成失败，降级本地组合: ' + e.message);
      if (!cfg.fallbackToLocal) throw e;
      return generateLocal(ctx);
    }
  }
  return generateLocal(ctx);
}

module.exports = {
  loadLlmConfig,
  deriveCategory,
  generateNickname,
  generateLocal,
  fetchArticleContext,
  generateWithLLM,
  generateComment
};
