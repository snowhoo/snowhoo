const fs = require('fs');
const path = require('path');

const BASE = 'D:/hexo/source/news';
let files = [];

function w(d) {
  try {
    const e = fs.readdirSync(d, { withFileTypes: true });
    for (const x of e) {
      const fp = path.join(d, x.name);
      if (x.isDirectory()) w(fp);
      else if (x.isFile()) files.push(fp);
    }
  } catch(e) {}
}

w(BASE);

console.log('Files in news/ (total):', files.length);
files.forEach(f => {
  const rel = f.replace('D:/hexo/', '');
  const stat = fs.statSync(f);
  console.log(`${rel} | ${stat.size} bytes`);
});