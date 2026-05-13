const fs = require('fs');
const cfg = fs.readFileSync('D:/hexo/hexo-bot/_config.yml', 'utf8');
const lines = cfg.split('\n');
let inMenu = false;
lines.forEach((l, i) => {
  if (l.match(/^menu:/)) inMenu = true;
  if (inMenu) console.log((i + 1) + ': ' + l);
  // Exit menu block on next top-level key
  if (inMenu && l.match(/^[a-z_]+:/) && !l.startsWith(' ') && l.trim()) inMenu = false;
});