/**
 * 持久化主题模板修改
 * 在每次生成前，自动将 source/_partial 中的模板文件覆盖到 node_modules/hexo-theme-butterfly/layout/
 */

const fs = require('fs');
const path = require('path');

hexo.on('generateBefore', function() {
  hexo.log.warn('[持久化模板] generateBefore 钩子触发！');
  const partialDir = path.join(hexo.base_dir, 'source/_partial');
  const themeDir = path.join(hexo.base_dir, 'node_modules/hexo-theme-butterfly/layout');
  hexo.log.warn('[持久化模板] partialDir:', partialDir);
  hexo.log.warn('[持久化模板] source/_partial exists:', fs.existsSync(partialDir));

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

 // FestivalSolar.pug 来自 hexo-bot/refresh-cache（本地，不在 git）
  const FestivalSolarSrc = path.join(botDir, 'FestivalSolar.pug');
  const FestivalSolarDest = path.join(themeDir, 'FestivalSolar.pug');
  if (fs.existsSync(FestivalSolarSrc)) {
    fs.copyFileSync(FestivalSolarSrc, FestivalSolarDest);
    hexo.log.info('[持久化模板] 已覆盖: FestivalSolar.pug');
  }

  // poetry-widget.pug 来自 hexo-bot/refresh-cache（本地，不在 git）
  const poetrySrc = path.join(botDir, 'DailyPoetry.pug');
  const poetryDest = path.join(themeDir, 'DailyPoetry.pug');
  if (fs.existsSync(poetrySrc)) {
    fs.copyFileSync(poetrySrc, poetryDest);
    hexo.log.info('[持久化模板] 已覆盖: DailyPoetry.pug');
  }

  // history-today.pug 来自 hexo-bot/refresh-cache/
  const historySrc = path.join(botDir, 'HistoryToday.pug');
  const historyDest = path.join(themeDir, 'HistoryToday.pug');
  if (fs.existsSync(historySrc)) {
    fs.copyFileSync(historySrc, historyDest);
    hexo.log.info('[持久化模板] 已覆盖: HistoryToday.pug');
  }

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
