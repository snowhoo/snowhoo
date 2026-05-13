const fs = require('fs');
const path = require('path');

function walkDir(dir, files) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) {
        walkDir(fp, files);
      } else if (e.isFile()) {
        files.push(fp);
      }
    }
  } catch(e) {}
}

function grepFiles(files, keywords) {
  const results = [];
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const kw of keywords) {
        if (lines[i].includes(kw)) {
          results.push({ file: fp.replace('D:/hexo/hexo-bot/', ''), line: i + 1, text: lines[i].trim() });
        }
      }
    }
  }
  return results;
}

const HEXO = 'D:/hexo/hexo-bot';

// Collect all source files
const allFiles = [];
walkDir(path.join(HEXO, 'source'), allFiles);
walkDir(path.join(HEXO, 'scripts'), allFiles);

// Search for news card / top card related
const keywords = ['新闻', '卡片', 'banner', 'topCard', 'top-banner', 'top-card', 'swiper', 'carousel', 'lucky-tag', 'topBanner', 'newsCard', '流动字幕'];
const results = grepFiles(allFiles, keywords);

console.log('Found', results.length, 'matches:');
results.forEach(r => {
  console.log(`${r.file}:${r.line}: ${r.text.slice(0, 120)}`);
});