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

  // 复制自定义组件文件到 layout/includes/
  const botDir = path.join(hexo.base_dir, 'hexo-bot/refresh-cache');
  const componentFiles = [
    { src: 'poetry-widget.pug', dest: 'poetry-widget.pug' },
    { src: 'history-today.pug', dest: 'history-today.pug' }
  ];
  componentFiles.forEach(({ src, dest }) => {
    const srcPath = path.join(botDir, src);
    const destPath = path.join(themeDir, 'includes', dest);
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

  // 特殊处理 index.pug：复制并修正 include 路径
  // 源文件中的 include ./includes/xxx 在目标位置需保持正确
  const indexSrc = path.join(partialDir, 'index.pug');
  const indexDest = path.join(themeDir, 'index.pug');
  if (fs.existsSync(indexSrc)) {
    let content = fs.readFileSync(indexSrc, 'utf8');
    // poetry-widget.pug 和 history-today.pug 需要从 theme layout/includes/ 引用
    // 但它们实际上在 source/_partial/includes/，persist 已复制过去了，所以 ./includes/ 是正确的
    fs.writeFileSync(indexDest, content);
    hexo.log.info('[持久化模板] 已覆盖: index.pug');
  }
});