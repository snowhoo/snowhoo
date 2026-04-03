/**
 * generate-2025-solar-terms.js
 * 生成 2025 年全部 24 个节气文章
 */

const fs = require('fs');
const path = require('path');
const { SOLAR_TERMS } = require('./solar-terms-data');
const { solar2lunar } = require('solar2lunar');

const LUNAR_MONTHS = ['', '正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','腊月'];
const LUNAR_DAYS   = ['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
                      '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
                      '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

function formatLunarDate(year, month, day) {
  const r = solar2lunar(year, month, day);
  const monthName = LUNAR_MONTHS[r.lMonth] || (r.lMonth > 0 ? r.lMonth + '月' : '闰' + LUNAR_MONTHS[Math.abs(r.lMonth)] || Math.abs(r.lMonth) + '月');
  const dayName = LUNAR_DAYS[r.lDay] || r.lDay + '日';
  return `${r.lYear}年${monthName}${dayName}`;
}

const HEXO_PATH = 'D:/hexo';
const POSTS_DIR = path.join(HEXO_PATH, 'source', '_posts');
const IMG_DIR = path.join(HEXO_PATH, 'source', 'images', 'solar-terms');
const TARGET_YEAR = 2025;

const TERM_INDEX = {};
SOLAR_TERMS.forEach((t, i) => { TERM_INDEX[t.name] = i + 1; });

// 2025年24节气日期（含跨年的小寒、大寒在2025年1月）
const TERM_DATES = [
  [1, 5],   // 小寒
  [1, 20],  // 大寒
  [2, 3],   // 立春
  [2, 18],  // 雨水
  [3, 5],   // 惊蛰
  [3, 20],  // 春分
  [4, 4],   // 清明
  [4, 19],  // 谷雨
  [5, 5],   // 立夏
  [5, 20],  // 小满
  [6, 5],   // 芒种
  [6, 21],  // 夏至
  [7, 6],   // 小暑
  [7, 22],  // 大暑
  [8, 7],   // 立秋
  [8, 23],  // 处暑
  [9, 7],   // 白露
  [9, 23],  // 秋分
  [10, 8],  // 寒露
  [10, 23], // 霜降
  [11, 7],  // 立冬
  [11, 22], // 小雪
  [12, 7],  // 大雪
  [12, 21], // 冬至
];

console.log(`将生成 ${TARGET_YEAR} 年全部 24 个节气文章`);
TERM_DATES.forEach(([m, d]) => {
  const term = SOLAR_TERMS.find(t => t.month === m && t.day === d);
  const lunarDate = formatLunarDate(TARGET_YEAR, m, d);
  console.log(` - ${term ? term.name : '???'} ${m}月${d}日 → ${lunarDate}`);
});

function pad(n) { return String(n).padStart(2, '0'); }

function savePost(month, day) {
  const term = SOLAR_TERMS.find(t => t.month === month && t.day === day);
  if (!term) return;

  const idx = TERM_INDEX[term.name];
  const baseSvg = 'solar-term-' + String(idx).padStart(2, '0');
  const v2Svg = baseSvg + '_v2.svg';
  const svgFile = fs.existsSync(path.join(IMG_DIR, v2Svg)) ? v2Svg : baseSvg + '.svg';
  const slug = `${TARGET_YEAR}${pad(month)}${pad(day)}_solar_term`;
  const filepath = path.join(POSTS_DIR, `${slug}.md`);

  if (fs.existsSync(filepath)) {
    console.log('[overwrite]', slug);
  } else {
    console.log('[new]', slug);
  }

  const termDateStr = `${TARGET_YEAR}-${pad(month)}-${pad(day)} 08:00:00`;
  const lunarDate = formatLunarDate(TARGET_YEAR, month, day);

  let body = `> 来源：互联网 | 农历${lunarDate} | ${month}月${day}日\n\n`;

  const yearIntros = [
    `又是一年${term.name}，${TARGET_YEAR}年的这个时节，你所在的城市是怎样的光景？`,
    `岁月流转，四季更迭。${TARGET_YEAR}年${term.name}悄然而至，你准备好迎接这个季节了吗？`,
    `${TARGET_YEAR}年的${term.name}如约而至，愿你在这一节气里，顺应天时，收获满满。`,
    `${term.name}是${TARGET_YEAR}年的第${idx}个节气，也是季节转换的重要节点。`
  ];
  const yearIntro = yearIntros[(TARGET_YEAR * idx) % yearIntros.length];
  body += yearIntro + '\n\n';

  body += `## ${term.name} · ${term.pinyin}\n\n`;
  body += `${term.desc}\n\n`;

  // 插入正文封面图
  body += `![](/images/solar-terms/${svgFile})\n\n`;

  body += `## 传统习俗\n\n`;
  term.customs.forEach(c => { body += `- ${c}\n`; });
  body += '\n';

  body += `## 节气诗词\n\n`;
  body += `> **${term.poem}**\n\n`;

  body += `> **${TARGET_YEAR}年${term.name}** — 四时有序，万物有时。\n\n`;

  body += `## 时令关键词\n\n`;
  body += term.keywords.map(k => `#${k}`).join('  ') + '\n\n';

  const frontMatter = [
    '---',
    `title: ${term.name} · ${lunarDate.slice(5)}`,
    `date: ${termDateStr}`,
    `updated: ${termDateStr}`,
    'categories:',
    '  - 二十四节气',
    'tags:',
    '  - 节气',
    `  - ${term.name}`,
    `cover: /images/solar-terms/${svgFile}`,
    'toc: true',
    '---',
    ''
  ].join('\n');

  fs.writeFileSync(filepath, '\ufeff' + frontMatter + body, 'utf8');
  console.log('[ok] written:', slug, 'cover:', svgFile);
}

TERM_DATES.forEach(([m, d]) => savePost(m, d));
console.log('\n生成完成！');
