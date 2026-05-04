/**
 * 修复热搜文章格式：将纯文本描述转换为带样式的 p 标签
 * 保持 ### 标题前缀不变
 */
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '..', '..', 'source', '_posts');

// 获取所有热榜文章
const files = fs.readdirSync(postsDir)
  .filter(f => f.includes('hotnews'))
  .sort()
  .reverse();

console.log(`待处理文件数: ${files.length}`);

let processed = 0;
let modified = 0;

for (const file of files) {
  const filePath = path.join(postsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // 匹配模式：### 标题行\n<img...>\n描述文本（描述不是空行，不是 <p，不是 ###）
  // 然后后面跟双换行和下一个 ###
  const regex = /(### [^\n]+\n<img[^>]*>\n)([^\n<][^\n]*?)(\n\n+### |\n\n+$)/g;

  content = content.replace(regex, (match, header, desc, following) => {
    const cleanDesc = desc.trim();
    return `${header}<p style="margin:0 0 4px 0;line-height:1.4;">${cleanDesc}</p>\n\n`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    modified++;
    console.log(`✓ 已修复: ${file}`);
  }
  processed++;
}

console.log(`\n处理完成: ${processed} 文件, 修改: ${modified} 文件`);
