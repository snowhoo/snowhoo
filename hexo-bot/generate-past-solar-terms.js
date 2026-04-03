/**
 * generate-past-solar-terms.js
 * 补发生成的 2026 年已过节气文章
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
const YEAR = 2026;

// 节气序号映射（与 generate-solar-term-svgs.js 保持一致）
const TERM_INDEX = {};
SOLAR_TERMS.forEach((t, i) => { TERM_INDEX[t.name] = i + 1; });

// 今年已过的节气（当前3月29日，之前的节气）
const PAST_TERMS = SOLAR_TERMS.filter(t => {
  const termDate = new Date(YEAR, t.month - 1, t.day);
  const today = new Date(2026, 2, 29); // 3月29日
  return termDate <= today;
});

console.log('将补发', PAST_TERMS.length, '个节气文章:');
PAST_TERMS.forEach(t => console.log(' -', t.name, t.month + '/' + t.day));

function pad(n) { return String(n).padStart(2, '0'); }

function savePost(term) {
  const idx = TERM_INDEX[term.name];
  const baseSvg = 'solar-term-' + String(idx).padStart(2, '0');
  const v2Svg = baseSvg + '_v2.svg';
  const svgFile = fs.existsSync(path.join(IMG_DIR, v2Svg)) ? v2Svg : baseSvg + '.svg';
  const slug = `${YEAR}${pad(term.month)}${pad(term.day)}_solar_term`;
  const filepath = path.join(POSTS_DIR, `${slug}.md`);

  if (fs.existsSync(filepath)) {
    console.log('[overwrite]', slug);
  } else {
    console.log('[new]', slug);
  }

  const termDateStr = `${YEAR}-${pad(term.month)}-${pad(term.day)} 08:00:00`;

  // 生成内容
  const lunarDate = formatLunarDate(YEAR, term.month, term.day);
  let body = `> 来源：互联网 | 农历${lunarDate} | ${term.month}月${term.day}日\n\n`;

  // 年份差异引言
  const yearIntros = [
    `又是一年${term.name}，${YEAR}年的这个时节，你所在的城市是怎样的光景？`,
    `岁月流转，四季更迭。${YEAR}年${term.name}悄然而至，你准备好迎接这个季节了吗？`,
    `${YEAR}年的${term.name}如约而至，愿你在这一节气里，顺应天时，收获满满。`,
    `${term.name}是${YEAR}年的第${idx}个节气，也是季节转换的重要节点。`
  ];
  const yearIntro = yearIntros[(YEAR * idx) % yearIntros.length];
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

  body += `> **${YEAR}年${term.name}** — 四时有序，万物有时。\n\n`;

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
}

PAST_TERMS.forEach(term => savePost(term));
console.log('\n补发完成！共', PAST_TERMS.length, '篇');
