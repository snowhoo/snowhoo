const fs = require('fs');
const c = fs.readFileSync('D:/hexo/source/_posts/20260426_hotnews_morning.md', 'utf8');
// 检查换行符类型
const hasCRLF = c.includes('\r\n');
const crlfCount = (c.match(/\r\n/g) || []).length;
const lfCount = (c.match(/\n/g) || []).length;
console.log('has CRLF:', hasCRLF, 'CRLF count:', crlfCount, 'LF count:', lfCount);
// 看第一个 ### 附近的原始字符
const i = c.indexOf('### <strong>');
if (i > 0) {
  console.log('before first ###:', JSON.stringify(c.slice(i - 10, i + 80)));
}
