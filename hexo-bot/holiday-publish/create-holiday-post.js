const fs = require('fs');
const path = require('path');

const holidayName = process.argv[2];
if (!holidayName) {
  console.error('用法: node create-holiday-post.js <节日名称>');
  process.exit(1);
}

const holidaysFile = path.join(__dirname, 'holidays.json');
const holidays = JSON.parse(fs.readFileSync(holidaysFile, 'utf-8'));
const holiday = holidays.holidays.find(h => h.name === holidayName);

if (!holiday) {
  console.error(`未找到节日: ${holidayName}`);
  process.exit(1);
}

const { name, date, pinyin, description, color, content } = holiday;

// 检查封面图是否存在
const coverDir = path.join('D:', 'hexo', 'source', 'images', 'holidays');
const coverFile = `holiday-${pinyin}-cover.webp`;
const coverPath = path.join(coverDir, coverFile);
const hasCover = fs.existsSync(coverPath);

const coverBlock = hasCover
  ? `\n![节日封面](/images/holidays/${coverFile})\n`
  : '';

const mdContent = `---
title: ${name}｜${description}
date: ${date} 08:00:00
tags:
  - 节日
  - ${name}
  - 传统文化
categories:
  - 节日
description: ${description} — ${date}
cover: /images/holidays/${coverFile}
sticky: 0
---

> 📅 ${date} · ${name} · ${description}
${coverBlock}
${content}
`;

const postDir = path.join('D:', 'hexo', 'source', '_posts');
const fileName = `${date}-${pinyin}-${name}.md`;
const filePath = path.join(postDir, fileName);

fs.writeFileSync(filePath, mdContent, 'utf-8');
console.log(`✅ 文章已创建: ${fileName}`);
console.log(`   路径: ${filePath}`);
console.log(`   封面: ${hasCover ? '✅ 已存在' : '❌ 缺失'}`);
