const fs = require('fs');
const path = require('path');

const postsDir = 'd:\\hexo\\source\\_posts';
const logFile = 'd:\\hexo\\scripts\\cover-update-log.txt';

let processedCount = 0;
let skippedCount = 0;
let errorCount = 0;

const log = [];
log.push(`批量添加 cover 字段执行日志 - ${new Date().toLocaleString('zh-CN')}`);
log.push('='.repeat(60));

// 获取所有 md 文件
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));

files.forEach(fileName => {
    const filePath = path.join(postsDir, fileName);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 检查是否已有 cover 字段
    const coverRegex = /^cover:\s*.+$/im;
    if (coverRegex.test(content)) {
        skippedCount++;
        log.push(`[${new Date().toLocaleTimeString('zh-CN')}] 跳过 (已有 cover): ${fileName}`);
        return;
    }
    
    // 提取 front-matter 结束标记
    const frontMatterEnd = content.indexOf('---', 3);
    if (frontMatterEnd === -1) {
        errorCount++;
        log.push(`[${new Date().toLocaleTimeString('zh-CN')}] 错误 (无 front-matter): ${fileName}`);
        return;
    }
    
    // 提取正文第一张图片 ![alt](src)
    const bodyContent = content.substring(frontMatterEnd + 3);
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/;
    const match = bodyContent.match(imagePattern);
    
    if (match && match[2]) {
        const imagePath = match[2];
        
        // 在 front-matter 末尾添加 cover 字段
        const insertPos = content.lastIndexOf('\n', frontMatterEnd);
        const newContent = content.substring(0, insertPos + 1) + 
                          `cover: ${imagePath}\n` + 
                          content.substring(insertPos + 1);
        
        // 保存文件
        fs.writeFileSync(filePath, newContent, 'utf8');
        processedCount++;
        log.push(`[${new Date().toLocaleTimeString('zh-CN')}] 已处理：${fileName} -> cover: ${imagePath}`);
    } else {
        skippedCount++;
        log.push(`[${new Date().toLocaleTimeString('zh-CN')}] 跳过 (无图片): ${fileName}`);
    }
});

log.push('='.repeat(60));
log.push(`执行完成 - ${new Date().toLocaleString('zh-CN')}`);
log.push(`处理成功：${processedCount} 篇 | 跳过：${skippedCount} 篇 | 错误：${errorCount} 篇`);

// 写入日志
fs.writeFileSync(logFile, log.join('\n'), 'utf8');

console.log('执行完成！');
console.log(`处理成功：${processedCount} 篇`);
console.log(`跳过：${skippedCount} 篇 (已有 cover 或无图片)`);
console.log(`错误：${errorCount} 篇`);
console.log(`日志文件：${logFile}`);
