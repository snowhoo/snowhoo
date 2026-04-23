const hexo = require('hexo');
const path = require('path');

const siteDir = 'D:/hexo';
const h = new hexo(siteDir, {});

h.init().then(() => {
  return h.call('clean');
}).then(() => {
  console.log('Clean done');
  return h.call('generate');
}).then(() => {
  console.log('Generate done');
  return h.call('deploy');
}).then(() => {
  console.log('Deploy done');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});