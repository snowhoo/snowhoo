var fs = require('fs');
var path = require('path');
var POSTS_DIR = 'D:/hexo/source/_posts';
var file = '2022-12-16 014022.md';
var raw = fs.readFileSync(path.join(POSTS_DIR, file));

console.log('File length:', raw.length);
console.log('BOM:', raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF);

var content;
if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
  content = raw.slice(3).toString('utf-8');
} else {
  var utf8Str = raw.toString('utf-8');
  var hasCJK = /[\u4e00-\u9fff]{3}/.test(utf8Str);
  // Count replacement characters () as garbage indicator
  var garbageCount = 0;
  for (var i = 0; i < utf8Str.length; i++) {
    if (utf8Str.charCodeAt(i) === 65533) garbageCount++;
  }
  console.log('UTF8 check - hasCJK:', hasCJK, 'garbage:', garbageCount);
  content = hasCJK && garbageCount <= 3 ? utf8Str : raw.toString('gbk');
  console.log('Used encoding:', hasCJK && garbageCount <= 3 ? 'UTF-8' : 'GBK');
}

var fm = {};
var match = content.match(/^---\n([\s\S]*?)\n---/);
if (!match) { console.log('NO FM MATCH'); process.exit(); }
match[1].split('\n').forEach(function(line) {
  var idx = line.indexOf(':');
  if (idx > 0) fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

console.log('Title:', fm.title);
console.log('Date:', fm.date);
console.log('Permalink:', fm.permalink);

var dateStr = fm.date || '';
var parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
var titlePart = file.replace('.md', '').replace(' ', '-');
console.log('titlePart:', titlePart);
var computedPath = '/' + parts[1] + '/' + parts[2] + '/' + parts[3] + '/' + titlePart + '/';
console.log('Computed path:', computedPath);
console.log('Expected by user: /2022/12/16/2022-12-16-014022/');
console.log('Match:', computedPath === '/2022/12/16/2022-12-16-014022/');