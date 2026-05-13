const fs = require('fs');
const c = fs.readFileSync('D:/hexo/_config.yml', 'utf8');
const lines = c.split('\n');
let inMenu = false;
lines.forEach((l, i) => {
  if (l.match(/^menu:/)) { inMenu = true; console.log((i+1) + ': ' + l); return; }
  if (!inMenu) return;
  console.log((i + 1) + ': ' + l);
  // Exit when we hit a new top-level key (line starts with non-space text + :)
  const trimmed = l.trimStart();
  if (trimmed && trimmed.match(/^[a-z_]+:/) && !l.startsWith(' ') && !l.startsWith('#')) {
    console.log('  -> exit at line', i+1);
    inMenu = false;
  }
});