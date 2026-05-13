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

const BUTTERFLY = 'D:/hexo/node_modules/hexo-theme-butterfly';
const CSS_DIR = path.join(BUTTERFLY, 'source/css');
const LAYOUT_DIR = path.join(BUTTERFLY, 'layout');

const cssFiles = [];
walkDir(CSS_DIR, cssFiles);
console.log('CSS files:', cssFiles.length);
cssFiles.forEach(f => console.log(f.replace(BUTTERFLY, '')));

const layoutFiles = [];
walkDir(LAYOUT_DIR, layoutFiles);
console.log('\nLayout files:', layoutFiles.length);
layoutFiles.forEach(f => console.log(f.replace(BUTTERFLY, '')));

// Check for any includes in the config
const cfgPath = path.join(BUTTERFLY, '_config.yml');
if (fs.existsSync(cfgPath)) {
  const cfg = fs.readFileSync(cfgPath, 'utf8');
  const lines = cfg.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('top') || l.includes('banner') || l.includes('card')) {
      console.log(`_config.yml:${i + 1}: ${l.trim()}`);
    }
  });
}