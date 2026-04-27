/**
 * 修复热搜文章格式：逐行处理
 * - 保持 ### 标题不变
 * - 将裸露的描述文本包装在 <p style="..."> 中
 */
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '..', '..', 'source', '_posts');

// 获取所有热榜文章（排除最新生成的）
const files = fs.readdirSync(postsDir)
  .filter(f => f.includes('hotnews'))
  .sort()
  .reverse();

console.log(`待处理文件数: ${files.length}`);

let modified = 0;

for (const file of files) {
  const filePath = path.join(postsDir, file);
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const newLines = [];
  let changed = false;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // 保持 ### 标题不变
    if (line.startsWith('### ')) {
      newLines.push(line);
      i++;
      continue;
    }
    
    // 保持空行不变
    if (line.trim() === '') {
      newLines.push(line);
      i++;
      continue;
    }
    
    // 保持 <p> 或 </p> 或 img 标签不变
    if (line.startsWith('<p') || line.startsWith('</p') || line.startsWith('<img')) {
      newLines.push(line);
      i++;
      continue;
    }
    
    // 保持 frontmatter 和引号行不变
    if (line.startsWith('---') || line.startsWith('>') || line.startsWith('title:') || 
        line.startsWith('date:') || line.startsWith('updated:') || line.startsWith('categories:') ||
        line.startsWith('tags:') || line.startsWith('cover:') || line.startsWith('toc:') ||
        line.trim().startsWith('- ')) {
      newLines.push(line);
      i++;
      continue;
    }
    
    // 其他行（描述文本）- 需要包装在 <p> 中
    if (line.trim() !== '' && !line.startsWith('<')) {
      const trimmed = line.trim();
      // 检查下一行是否是空行（这行的结尾）
      // 如果这行后面紧跟空行或另一个标题，说明这是一个完整的描述
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      const nextNextLine = i + 2 < lines.length ? lines[i + 2] : '';
      
      // 如果下一行是空行，且下下行是标题或文件结束，这是完整描述
      if (nextLine.trim() === '' && (nextNextLine.startsWith('###') || i + 2 >= lines.length)) {
        newLines.push(`<p style="margin:0 0 4px 0;line-height:1.4;">${trimmed}</p>`);
        changed = true;
        i++;
        continue;
      }
    }
    
    // 默认保留原行
    newLines.push(line);
    i++;
  }
  
  // 清理多余空行（3个以上连续空行改为2个）
  let result = newLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // 确保 </p> 后有双换行
  result = result.replace(/<\/p>\n(?!\n)/g, "</p>\n\n");
  
  if (result !== fs.readFileSync(filePath, 'utf8')) {
    fs.writeFileSync(filePath, result, 'utf8');
    modified++;
    console.log(`✓ 已修复: ${file}`);
  }
}

console.log(`\n处理完成, 修改: ${modified} 文件`);
