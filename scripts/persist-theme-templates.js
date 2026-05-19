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

  // 复制 layout.pug（核心布局文件，包含 block home-widgets）
  const layoutSrc = path.join(partialDir, 'includes/layout.pug');
  const layoutDest = path.join(themeDir, 'includes/layout.pug');
  if (fs.existsSync(layoutSrc)) {
    fs.copyFileSync(layoutSrc, layoutDest);
    hexo.log.info('[持久化模板] 已覆盖: layout.pug');
  }

  // 复制 pagination.pug 到 layout/includes
  const paginationSrc = path.join(partialDir, 'includes/pagination.pug');
  const paginationDest = path.join(themeDir, 'includes/pagination.pug');
  if (fs.existsSync(paginationSrc)) {
    fs.copyFileSync(paginationSrc, paginationDest);
    hexo.log.info('[持久化模板] 已覆盖: pagination.pug');
  }

  // 复制自定义组件文件到 layout/（与 index.pug 同目录）
  const botDir = path.join(hexo.base_dir, 'hexo-bot/refresh-cache');
  const componentFiles = [
    { src: 'poetry-widget.pug', dest: 'poetry-widget.pug' },
    { src: 'history-today.pug', dest: 'history-today.pug' }
  ];
  componentFiles.forEach(({ src, dest }) => {
    const srcPath = path.join(botDir, src);
    const destPath = path.join(themeDir, dest);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      hexo.log.info('[持久化模板] 已覆盖: ' + dest);
    }
  });

  // 复制 mixins/indexPostUI.pug
  const mixinsSrc = path.join(partialDir, 'includes/mixins/indexPostUI.pug');
  const mixinsDest = path.join(themeDir, 'includes/mixins/indexPostUI.pug');
  if (fs.existsSync(mixinsSrc)) {
    fs.copyFileSync(mixinsSrc, mixinsDest);
    hexo.log.info('[持久化模板] 已覆盖: mixins/indexPostUI.pug');
  }

  // 复制 index.pug
  const indexSrc = path.join(botDir, 'index.pug');
  const indexDest = path.join(themeDir, 'index.pug');
  if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, indexDest);
    hexo.log.info('[持久化模板] 已覆盖: index.pug');
  }
});