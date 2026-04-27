/**
 * 修复热搜文章格式：将纯文本描述转换为带样式的 p 标签
 * 格式：### 标题 -> img -> <p style="...">描述</p>
 */
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '..', '..', 'source', '_posts');

// 获取所有热榜文章（排除最新生成的）
const files = fs.readdirSync(postsDir)
  .filter(f => f.includes('hotnews'))
  .sort()
  .reverse(); // 从新到旧

// 排除最新生成的（20260426）
const toProcess = files.filter(f => !f.includes('20260426'));

console.log(`待处理文件数: ${toProcess.length}`);
console.log(`文件列表: ${toProcess.slice(0, 5).join(', ')}...`);

let processed = 0;
let modified = 0;

for (const file of toProcess) {
  const filePath = path.join(postsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // 匹配模式：### 标题\n<img...>\n描述文字（不是空行，不是 <p 标签）
// 描述文字后面紧跟空行 + 下一个 ### 或文件结束
const regex = /(<img[^>]*class="hotnews-img"[^>]*>\n)([^\n<][^\n]*?)(\n\n+### |\n\n+$)/g;

  content = content.replace(regex, (match, imgTag, desc, following) => {
    // 清理描述文本中的多余空白，但保留换行（如果有的话）
    const cleanDesc = desc.trim();
    // 如果描述只有一行，不需要额外换行
    return `${imgTag}<p style="margin:0 0 4px 0;line-height:1.4;">${cleanDesc}</p>\n\n${following.startsWith('###') ? '' : ''}`;
  });

  if (content !== original) {
    // 进一步清理：移除多余的空行，确保格式一致
    // 移除三个或更多连续空行
    content = content.replace(/\n{3,}/g, '\n\n');
    // 确保 p 标签后紧跟两个换行（除非是文件末尾）
    content = content.replace(/<\/p>\n{1}(?!\n)/g, "</p>\n\n");

    fs.writeFileSync(filePath, content, 'utf8');
    modified++;
    console.log(`✓ 已修复: ${file}`);
  }
  processed++;
}

console.log(`\n处理完成: ${processed} 文件, 修改: ${modified} 文件`);
