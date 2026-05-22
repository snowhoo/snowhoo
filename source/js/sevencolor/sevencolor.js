/**
 * 新七彩按钮组 - 展开式内容加载
 * 点击按钮展开/收起，内容通过 fetch HTML 动态加载
 */
(function() {
  var CONFIG_URL = '/js/sevencolor/config.json';
  var config = [];
  var openedId = null;
  var injectedStyles = {}; // 记录每个 id 已注入的 style，避免重复

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
    // 处理 CSS url()
    html = html.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, function(m, path) {
      if (path.startsWith('/') || path.startsWith('http')) return m;
      return 'url(\'' + basePath + path + '\')';
    });
    // 处理 JS import()
    html = html.replace(/import\(\s*['"](\.[^'"]+)['"]\s*\)/g, function(m, path) {
      if (path.startsWith('/') || path.startsWith('http')) return m;
      return 'import(\'' + basePath + path.replace(/^\.\//, '') + '\')';
    });
    // 处理 HTML 标签的 src 属性 (img, script, source, video, audio, iframe 等)
    html = html.replace(/(<(?:img|script|source|video|audio|iframe|embed|object)\s+[^>]*)(src)=(['"]?)(\.\/[^'"\)]+|\.\.[^'"\)]+)(['"]?)/gi, function(m, tag, attr, q1, path, q2) {
      if (path.startsWith('/') || path.startsWith('http')) return m;
      return tag + attr + '=' + q1 + basePath + path.replace(/^\.\//, '') + q2;
    });
    // 处理 HTML 标签的 href 属性 (link, a 等，但排除锚点)
    html = html.replace(/(<(?:a|link)\s+[^>]*)(href)=(['"]?)(\.\/[^'"\)]+|\.\.[^'"\)]+)(['"]?)/gi, function(m, tag, attr, q1, path, q2) {
      if (path.startsWith('/') || path.startsWith('http') || path.startsWith('#')) return m;
      return tag + attr + '=' + q1 + basePath + path.replace(/^\.\//, '') + q2;
    });
    return html;
  }

  // 每个卡口的渲染函数（contentId → renderFn）
  var _scRenderFns = {};

  // contentId → window 全局变量前缀
  var CONTENT_PREFIX = {
    yedu: '__yedu_',
    news: '__news_',
    video: '__video_',
    photo: '__photo_'
  };

  // 注册渲染函数（由模板 JS 调用）
  function _scRegisterRenderFn(contentId, fn) {
    _scRenderFns[contentId] = fn;
  }

  // 调用渲染函数
  function _scCallRender(contentId, page) {
    var fn = _scRenderFns[contentId];
    if (fn) fn(page);
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
        .then(function(r) { return r.text(); })
        .then(function(html) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');

          // 1. 注入 CSS（每个 id 只注入一次）
          if (!injectedStyles[id]) {
            var styles = doc.querySelectorAll('style');
            styles.forEach(function(s) {
              var newStyle = document.createElement('style');
              newStyle.textContent = s.textContent;
              newStyle.dataset.scId = id;
              document.head.appendChild(newStyle);
            });
            injectedStyles[id] = true;
          }

          // 2. 提取 data 脚本列表
          var basePath = htmlUrl.replace(/\/[^/]*$/, '/');
          var dataScripts = [];
          doc.querySelectorAll('script').forEach(function(s) {
            var src = s.getAttribute('src');
            if (src && src.indexOf('data/') !== -1) {
              dataScripts.push(basePath + src.replace(/^\.\//, ''));
            }
          });

          // 3. 提取 body 内容（只移除 data 脚本部分，保留模板 JS）
          var bodyHtml = doc.body.innerHTML;
          // 移除 <!-- DATA_FILES_START --> ... <!-- DATA_FILES_END --> 之间的 data 脚本
          bodyHtml = bodyHtml.replace(/<!-- DATA_FILES_START -->[\s\S]*?<!-- DATA_FILES_END -->/g, '');
          bodyHtml = fixRelativePaths(bodyHtml, basePath);
          // 替换内容 ID 占位符
          bodyHtml = bodyHtml.replace(/__CID__/g, id);

          // 4. 加载数据脚本
          return Promise.all(dataScripts.map(function(src) {
            return fetch(src).then(function(r) { return r.text(); });
          })).then(function(texts) {
            // 执行数据脚本，设置 window.__xxx_* 全局变量
            texts.forEach(function(text) {
              try { eval(text); } catch(e) {}
            });

            // 汇总 articles 到 window.__scArticles（供模板 JS 使用）
            var prefix = CONTENT_PREFIX[id] || ('__' + id + '_');
            window.__scArticles = Object.keys(window)
              .filter(function(k) { return k.startsWith(prefix); })
              .sort()
              .reverse()
              .map(function(k) { return window[k]; });

            return bodyHtml;
          });
        })
        .then(function(bodyHtml) {
          // 5. 注入模板 HTML（包含模板的 JS）
          content.innerHTML = bodyHtml;

          // 6. 注入后续脚本：注册渲染函数、触发渲染
          //    用 setTimeout 推迟一下，确保模板 JS 已执行完毕
          var laterScript = document.createElement('script');
          laterScript.textContent = '(function(){'
            + 'var cid = "' + id + '";'
            + 'var listId = "#sc-content-' + id + ' .__CID___-article-list";'
            + 'listId = listId.replace("__CID__", cid);'
            + 'var container = document.querySelector(listId);'
            + 'var articles = window.__scArticles || [];'
            + 'if (!container || articles.length === 0) return;'
            + 'window.__scRegisterRenderFn(cid, function(page) {'
            + 'window.__scRender && window.__scRender(page, cid);'
            + '});'
            + 'window.__scRender && window.__scRender(1, cid);'
            + '})();';
          content.appendChild(laterScript);

          content.dataset.loaded = 'true';
        })
        .catch(function(e) {
          content.innerHTML = '<div class="sc-loading">内容加载失败</div>';
          console.error('SevenColor load failed:', e);
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
