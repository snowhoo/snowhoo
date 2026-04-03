const fs = require('fs');
const path = require('path');

const hotnewsDir = 'D:/hexo/source/images/hotnews';
const postFile = 'D:/hexo/source/_posts/20260329_hotnews_evening.md';

let content = fs.readFileSync(postFile, 'utf8');

// 获取所有带中文旧名和纯序号新名的映射
const files = fs.readdirSync(hotnewsDir).filter(f => f.endsWith('.webp'));

const mapping = {}; // oldName -> newName
files.forEach(f => {
  const m = f.match(/^(\d{8}_\d{2}_)(.+)\.webp$/);
  if (!m) return; // 已经是纯序号，跳过
  const serial = m[1];  // e.g. '20260329_02_'
  const newName = serial.slice(0, -1) + '.webp'; // '20260329_02.webp'
  mapping[f] = newName;
});

// 1. 重命名磁盘文件
Object.entries(mapping).forEach(([oldName, newName]) => {
  const oldPath = path.join(hotnewsDir, oldName);
  const newPath = path.join(hotnewsDir, newName);
  if (fs.existsSync(oldPath) && oldPath !== newPath) {
    fs.renameSync(oldPath, newPath);
    console.log('rename:', oldName, '->', newName);
  }
});

// 2. 更新文章引用
let updated = 0;
Object.entries(mapping).forEach(([oldName, newName]) => {
  const oldRef = '/images/hotnews/' + oldName;
  const newRef = '/images/hotnews/' + newName;
  if (content.includes(oldRef)) {
    content = content.split(oldRef).join(newRef);
    updated++;
  }
});

fs.writeFileSync(postFile, content, 'utf8');
console.log('\n更新引用:', updated, '处');

// 最终验证
const refs = content.match(/!\[\]\([^)]+\)/g) || [];
const diskFiles = fs.readdirSync(hotnewsDir).filter(f => f.match(/^\d{8}_\d{2}\.webp$/));
console.log('引用图片:', refs.length, '张 | 磁盘文件:', diskFiles.length, '张');
console.log('首张:', refs[0]);
console.log('末张:', refs[refs.length - 1]);
