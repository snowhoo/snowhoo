/**
 * TVBox 预热触发器 — 全局生效
 * 在 tvbox-cache.js 之后加载，从 index.js 读取文件列表并启动预热
 */
(function() {
  window.__TVBOX_BASE = '/js/sevencolor/3/';

  var s = document.createElement('script');
  s.src = window.__TVBOX_BASE + 'data/index.js';
  s.onload = function() {
    var index = window._TVBOX_INDEX;
    delete window._TVBOX_INDEX;
    if (!index || !index.length) return;
    var files = [];
    index.forEach(function(site) {
      if (site.page_count) {
        for (var pg = 1; pg <= site.page_count; pg++) {
          var n = String(pg);
          if (n.length < 2) n = '0' + n;
          files.push(site.file.replace(/-01\.js$/, '-' + n + '.js'));
        }
      }
    });
    if (files.length && typeof TVCache !== 'undefined') {
      TVCache.warm(files);
    }
  };
  s.onerror = function() { s.remove(); };
  document.head.appendChild(s);
})();
