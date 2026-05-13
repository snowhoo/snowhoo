const fs = require('fs');
const path = require('path');

const configs = [
  'D:/hexo/_config.yml',
  'D:/hexo/_config.butterfly.yml',
  'D:/hexo/themes/butterfly/_config.yml'
];

configs.forEach(fp => {
  console.log(fp + ': ' + fs.existsSync(fp));
});

const entries = fs.readdirSync('D:/hexo', { withFileTypes: true });
entries.forEach(e => {
  if (e.name.startsWith('_config')) console.log('Found:', e.name);
});