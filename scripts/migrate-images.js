const fs = require('fs');
const path = require('path');

const postsDir = 'd:\\hexo\\source\\_posts';
const targetDir = 'd:\\hexo\\source\\images\\posts';
const logFile = 'd:\\hexo\\scripts\\migrate-images-log.txt';

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`创建目录：${targetDir}`);
}

const log = [];
const stats = {
    totalImages: 0,
    migrated: 0,
    updated: 0,
    errors: 0,
    skipped: 0
};

log.push(`图片迁移执行日志 - ${new Date().toLocaleString('zh-CN')}`);
log.push('='.repeat(60));
log.push(`目标目录：${targetDir}`);
log.push('');

// 收集所有图片路径
const imagePaths = new Set();
const coverPaths = new Map(); // fileName -> cover path

// 获取所有 md 文件
const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
console.log(`找到 ${files.length} 篇文章`);

// 第一遍：收集所有图片路径
files.forEach(fileName => {
    const filePath = path.join(postsDir, fileName);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 提取正文中的图片 ![alt](src)
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imagePattern.exec(content)) !== null) {
        const imgPath = match[2];
        if (imgPath.startsWith('/')) {
            imagePaths.add(imgPath);
        }
    }
    
    // 提取 cover 字段
    const coverMatch = content.match(/^cover:\s*(.+)$/im);
    if (coverMatch && coverMatch[1]) {
        const coverPath = coverMatch[1].trim();
        if (coverPath.startsWith('/')) {
            coverPaths.set(fileName, coverPath);
            imagePaths.add(coverPath);
        }
    }
});

console.log(`找到 ${imagePaths.size} 个唯一图片路径`);
log.push(`找到 ${imagePaths.size} 个唯一图片路径`);
log.push('');

// 第二遍：迁移图片
const pathMapping = new Map(); // old path -> new filename

imagePaths.forEach(oldPath => {
    // 将 /images/xxx 或 /xxx 转换为实际路径
    const sourcePath = path.join('d:\\hexo\\source', oldPath.replace(/^\//, ''));
    
    if (!fs.existsSync(sourcePath)) {
        stats.errors++;
        log.push(`[错误] 文件不存在：${sourcePath}`);
        return;
    }
    
    // 生成新文件名（避免冲突）
    const ext = path.extname(sourcePath);
    const baseName = path.basename(sourcePath, ext);
    const newFileName = `${baseName}${ext}`;
    const targetPath = path.join(targetDir, newFileName);
    
    // 如果目标文件已存在，添加时间戳
    let finalTargetPath = targetPath;
    let counter = 1;
    while (fs.existsSync(finalTargetPath)) {
        const newName = `${baseName}_${counter}${ext}`;
        finalTargetPath = path.join(targetDir, newName);
        counter++;
    }
    
    // 复制文件
    try {
        fs.copyFileSync(sourcePath, finalTargetPath);
        stats.migrated++;
        
        // 记录映射关系
        pathMapping.set(oldPath, `/images/posts/${path.basename(finalTargetPath)}`);
        
        log.push(`[已迁移] ${oldPath} -> /images/posts/${path.basename(finalTargetPath)}`);
    } catch (err) {
        stats.errors++;
        log.push(`[错误] 复制失败 ${oldPath}: ${err.message}`);
    }
});

log.push('');
log.push('='.repeat(60));
log.push('图片迁移完成，开始更新文章引用...');
log.push('');

// 第三遍：更新文章中的图片引用
files.forEach(fileName => {
    const filePath = path.join(postsDir, fileName);
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;
    
    // 更新正文中的图片
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        if (pathMapping.has(src)) {
            updated = true;
            stats.updated++;
            return `![${alt}](${pathMapping.get(src)})`;
        }
        return match;
    });
    
    // 更新 cover 字段
    content = content.replace(/^cover:\s*(.+)$/im, (match, coverPath) => {
        const trimmedPath = coverPath.trim();
        if (pathMapping.has(trimmedPath)) {
            updated = true;
            return `cover: ${pathMapping.get(trimmedPath)}`;
        }
        return match;
    });
    
    if (updated) {
        fs.writeFileSync(filePath, content, 'utf8');
        log.push(`[已更新] ${fileName}`);
    } else {
        stats.skipped++;
    }
});

// 写入日志
log.push('');
log.push('='.repeat(60));
log.push(`执行完成 - ${new Date().toLocaleString('zh-CN')}`);
log.push(`迁移图片：${stats.migrated} 张`);
log.push(`更新文章：${stats.updated} 次引用`);
log.push(`错误：${stats.errors} 个`);
log.push(`跳过：${stats.skipped} 篇（无需更新）`);

fs.writeFileSync(logFile, log.join('\n'), 'utf8');

console.log('');
console.log('执行完成！');
console.log(`迁移图片：${stats.migrated} 张`);
console.log(`更新引用：${stats.updated} 次`);
console.log(`错误：${stats.errors} 个`);
console.log(`日志文件：${logFile}`);
