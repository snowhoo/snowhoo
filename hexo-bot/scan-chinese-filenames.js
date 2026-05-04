const fs = require('fs');
const path = require('path');

function scanDir(dir, depth) {
  if (depth > 5) return;
  let items;
  try { items = fs.readdirSync(dir); } catch (e) { return; }
  items.forEach(item => {
    const full = path.join(dir, item);
    let stat;
    try { stat = fs.statSync(full); } catch (e) { return; }
    if (stat.isDirectory()) {
      scanDir(full, depth + 1);
    } else {
      if (/[^\x00-\x7F]/.test(item)) {
        const size = Math.round(stat.size / 1024);
        const rel = full.replace(/^[A-Z]:\\hexo\\/, '').replace(/\\/g, '/');
        console.log(rel + ' (' + size + 'KB)');
      }
    }
  });
}

console.log('=== 含中文文件名的文件 ===\n');
scanDir('D:/hexo/source', 0);
