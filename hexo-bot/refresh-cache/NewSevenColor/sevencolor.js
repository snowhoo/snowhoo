/**
 * 新七彩按钮组 - 展开式内容加载
 * 点击按钮展开/收起，内容通过 fetch HTML 动态加载
 */
(function() {
  var CONFIG_URL = '/js/sevencolor/config.json';
  var config = [];
  var openedId = null;

  function renderButtons() {
    var container = document.getElementById('seven-color-card');
    if (!container) return;
    var row = container.querySelector('.sc-btn-row');
    if (!row) return;
    row.innerHTML = '';
    config.forEach(function(item) {
      var btn = document.createElement('button');
      btn.className = 'sc-btn sc-btn-' + item.colorIndex;
      btn.dataset.id = item.id;
      btn.dataset.htmlUrl = item.htmlUrl;
      btn.innerHTML = '<span>' + item.icon + ' ' + item.title + '</span><span class="sc-arrow">▼</span>';
      btn.addEventListener('click', handleBtnClick);
      row.appendChild(btn);
    });
  }

  function handleBtnClick(e) {
    var btn = e.currentTarget;
    var id = btn.dataset.id;
    var htmlUrl = btn.dataset.htmlUrl;
    if (openedId === id) {
      closeContent(id);
      openedId = null;
    } else {
      if (openedId) closeContent(openedId);
      openContent(id, htmlUrl, btn);
      openedId = id;
    }
  }

  function fixRelativePaths(html, basePath) {
    html = html.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, function(m, path) {
      if (path.startsWith('/') || path.startsWith('http')) return m;
      return 'url(\'' + basePath + path + '\')';
    });
    html = html.replace(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g, function(m, path) {
      if (path.startsWith('/') || path.startsWith('http')) return m;
      return 'import(\'' + basePath + path.replace(/^\.\//, '') + '\')';
    });
    return html;
  }

  function openContent(id, htmlUrl, btn) {
    var container = document.getElementById('seven-color-card');
    var content = container.querySelector('#sc-content-' + id);
    if (!content) return;
    btn.classList.add('sc-open');
    content.classList.add('sc-open');
    if (!content.dataset.loaded) {
      content.innerHTML = '<div class="sc-loading">加载中...</div>';
      fetch(htmlUrl)
        .then(function(r) { return r.ok ? r.text() : null; })
        .then(function(html) {
          if (html) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html, 'text/html');
            var bodyContent = doc.body ? doc.body.innerHTML : html;
            var lastSlash = htmlUrl.lastIndexOf('/');
            var basePath = lastSlash > 0 ? htmlUrl.substring(0, lastSlash + 1) : htmlUrl;
            bodyContent = fixRelativePaths(bodyContent, basePath);
            content.innerHTML = '<div class="sc-content-inner">' + bodyContent + '<button class="sc-close-btn">收起 ↑</button></div>';
            content.dataset.loaded = 'true';
          } else {
            content.innerHTML = '<div class="sc-loading">内容加载失败</div>';
          }
        })
        .catch(function() {
          content.innerHTML = '<div class="sc-loading">加载出错，请重试</div>';
        });
    }
  }

  function closeContent(id) {
    var container = document.getElementById('seven-color-card');
    var btn = container.querySelector('.sc-btn[data-id="' + id + '"]');
    var content = container.querySelector('#sc-content-' + id);
    if (btn) btn.classList.remove('sc-open');
    if (content) content.classList.remove('sc-open');
  }

  function init() {
    fetch(CONFIG_URL)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && Array.isArray(data)) {
          config = data;
          renderButtons();
        }
      })
      .catch(function(e) {
        console.warn('SevenColor config load failed:', e);
      });
    document.addEventListener('click', function(e) {
      var closeBtn = e.target.closest('.sc-close-btn');
      if (closeBtn && openedId) {
        closeContent(openedId);
        openedId = null;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
