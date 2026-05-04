/**
 * 持久化主题模板修改
 * 在每次生成前，自动将 source/_partial 中的模板文件覆盖到 node_modules/hexo-theme-butterfly/layout/
 */

const fs = require('fs');
const path = require('path');

hexo.on('generateBefore', function() {
  const partialDir = path.join(hexo.base_dir, 'source/_partial');
  const themeDir = path.join(hexo.base_dir, 'node_modules/hexo-theme-butterfly/layout');

  // 检查持久目录是否存在
  if (!fs.existsSync(partialDir)) {
    hexo.log.warn('[持久化模板] source/_partial 目录不存在，跳过覆盖');
    return;
  }

  // 复制 pagination.pug 到 layout/includes
  const paginationSrc = path.join(partialDir, 'includes/pagination.pug');
  const paginationDest = path.join(themeDir, 'includes/pagination.pug');
  if (fs.existsSync(paginationSrc)) {
    fs.copyFileSync(paginationSrc, paginationDest);
    hexo.log.info('[持久化模板] 已覆盖: pagination.pug');
  }

  // 递归复制所有其他 .pug 文件
  copyPugFiles(partialDir, themeDir);
});

function copyPugFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;

  const files = fs.readdirSync(sourceDir);

  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      // 递归处理子目录
      copyPugFiles(sourcePath, targetPath);
    } else if (file.endsWith('.pug') && file !== 'pagination.pug') {
      // 复制 .pug 文件（排除 pagination.pug，已单独处理）
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, targetPath);
      hexo.log.info('[持久化模板] 已覆盖: ' + file);
    }
  });
}