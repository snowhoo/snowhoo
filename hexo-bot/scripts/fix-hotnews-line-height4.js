/**
 * 修复热搜文章格式：简单替换
 * 将裸露的描述文本包装在 <p style="..."> 中
 */
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '..', '..', 'source', '_posts');

const files = fs.readdirSync(postsDir)
  .filter(f => f.includes('hotnews'))
  .sort()
  .reverse();

console.log(`待处理: ${files.length} 文件`);

let modified = 0;

for (const file of files) {
  const filePath = path.join(postsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const newLines = [];
  
  for (const line of lines) {
    // 跳过需要保留的行
    if (
      line.trim() === '' ||
      line.startsWith('---') ||
      line.startsWith('>') ||
      line.startsWith('title:') ||
      line.startsWith('date:') ||
      line.startsWith('updated:') ||
      line.startsWith('categories:') ||
      line.startsWith('tags:') ||
      line.startsWith('cover:') ||
      line.startsWith('toc:') ||
      line.trim().startsWith('- ') ||
      line.startsWith('###') ||
      line.startsWith('<p') ||
      line.startsWith('</p') ||
      line.startsWith('<img')
    ) {
      newLines.push(line);
    } else {
      // 包装描述文本
      const trimmed = line.trim();
      if (trimmed) {
        newLines.push(`<p style="margin:0 0 4px 0;line-height:1.4;">${trimmed}</p>`);
      } else {
        newLines.push(line);
      }
    }
  }
  
  const result = newLines.join('\n');
  
  if (result !== content) {
    fs.writeFileSync(filePath, result, 'utf8');
    modified++;
    console.log(`✓ ${file}`);
  }
}

console.log(`\n完成，修改 ${modified} 文件`);
