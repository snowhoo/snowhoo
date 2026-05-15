const fs = require('fs');
const html = fs.readFileSync('D:/hexo/source/video/index.html', 'utf8');
const idx = html.lastIndexOf('<script>');
const end = html.lastIndexOf('</script>');
const code = html.substring(idx + 8, end);

// Check balanced braces by analyzing char by char
let parens = [], braces = [], brackets = [];
let inStr = false, strChar = null;
for (let i = 0; i < code.length; i++) {
  const c = code[i], p = i > 0 ? code[i-1] : '';
  
  if (inStr) {
    if (c === strChar && p !== '\\') inStr = false;
    continue;
  }
  if (c === "'" || c === '"') { inStr = true; strChar = c; continue; }
  
  if (c === '(') parens.push(i);
  if (c === ')') { if (parens.length === 0) console.log('Extra ) at char ' + i); else parens.pop(); }
  if (c === '{') braces.push(i);
  if (c === '}') { if (braces.length === 0) console.log('Extra } at char ' + i); else braces.pop(); }
}

if (parens.length > 0) console.log('Unclosed (: ' + parens.length + ' at around line ' + code.substring(0, parens[0]).split('\n').length);
if (braces.length > 0) console.log('Unclosed {: ' + braces.length + ' at around line ' + code.substring(0, braces[0]).split('\n').length);
if (parens.length === 0 && braces.length === 0) console.log('All balanced!');

// Show unclosed braces locations
braces.forEach(pos => {
  const line = code.substring(0, pos).split('\n').length;
  console.log('  Unclosed { at line ' + line + ': ' + code.substring(pos, pos+50));
});
parens.forEach(pos => {
  const line = code.substring(0, pos).split('\n').length;
  console.log('  Unclosed ( at line ' + line + ': ' + code.substring(pos, pos+50));
});
