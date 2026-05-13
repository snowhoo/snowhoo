const fs = require('fs');
const path = require('path');

const BASE = 'D:/hexo/hexo-bot';

try {
  const entries = fs.readdirSync(BASE, { withFileTypes: true });
  console.log('Entries in hexo-bot:');
  entries.forEach(e => console.log((e.isDirectory() ? '[DIR] ' : '[FILE] ') + e.name));
} catch(e) {
  console.log('Error:', e.message);
}

try {
  const source = fs.readdirSync('D:/hexo/source', { withFileTypes: true });
  console.log('\nEntries in source:');
  source.forEach(e => console.log((e.isDirectory() ? '[DIR] ' : '[FILE] ') + e.name));
} catch(e) {
  console.log('Error source:', e.message);
}