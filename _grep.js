const fs = require('fs');
const path = require('path');
const glob = require('glob');

const ROOT = 'D:/hexo/hexo-bot/themes/butterfly/source';

// Find all CSS files
const cssFiles = glob.sync('css/**/*.css', { cwd: ROOT });

// Search for relevant keywords
const keywords = ['topCard', 'banner', 'lucky-tag', 'swiper', 'news-card', 'top-banner', 'carousel', '流动字幕'];

let results = [];
for (const file of cssFiles) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const kw of keywords) {
      if (line.includes(kw)) {
        results.push(`${file}:${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

results.forEach(r => console.log(r));