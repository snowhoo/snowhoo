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
          // 去掉模板 HTML 的外层框架标签，只保留 body 内容
          html = html.replace(/<!DOCTYPE[^>]*>\s*/gi, '');
          html = html.replace(/<html[^>]*>/gi, '');
          html = html.replace(/<\/html>\s*/gi, '');
          html = html.replace(/<head[^>]*>[\s\S]*?<\/head>\s*/gi, '');
          html = html.replace(/<body/gi, '<div');
          html = html.replace(/<\/body>/gi, '</div>');

          // 此时 html 就是一个 <div>...</div> 结构，body 就是它的外层容器
          // 提取其中内容（即 body > div.app 那个层级的 div）
          var bodyContent = html.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, '');

          // 1. 注入 CSS（每个 id 只注入一次）- 提取 <style> 和 <link> 标签
          if (!injectedStyles[id]) {
            // 处理 <style> 标签
            var styleMatches = bodyContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
            if (styleMatches) {
              styleMatches.forEach(function(styleTag) {
                var contentMatch = styleTag.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
                if (contentMatch) {
                  var newStyle = document.createElement('style');
                  var cssContent = contentMatch[1]
                    .replace(/__CID__/g, id)
                    .replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, function(m, path) {
                      if (path.startsWith('/') || path.startsWith('http')) return m;
                      return 'url(\'' + basePath + path + '\')';
                    });
                  newStyle.textContent = cssContent;
                  newStyle.dataset.scId = id;
                  document.head.appendChild(newStyle);
                }
              });
            }
            // 处理 <link rel="stylesheet"> 标签
            var linkMatches = bodyContent.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi);
            if (linkMatches) {
              linkMatches.forEach(function(linkTag) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = linkTag;
                var linkEl = tempDiv.firstChild;
                if (linkEl) {
                  linkEl.dataset.scId = id;
                  document.head.appendChild(linkEl);
                }
              });
            }
            injectedStyles[id] = true;
          }

          // 2. 提取 data 脚本列表（从原始 html 字符串中提取）
          var basePath = htmlUrl.replace(/\/[^/]*$/, '/');
          var dataScripts = [];
          var scriptRegex = /<script[^>]+src=["']([^"']*data\/[^"']+\.js)["'][^>]*>/gi;
          var match;
          while ((match = scriptRegex.exec(bodyContent)) !== null) {
            dataScripts.push(basePath + match[1].replace(/^\.\//, ''));
          }

          // 3. 提取内联脚本内容（用于后续 eval 执行）
          var inlineScriptContent = '';
          var scriptMatch = bodyContent.match(/<script>([\s\S]*?)<\/script>/i);
          if (scriptMatch) {
            inlineScriptContent = scriptMatch[1];
          }

          // 4. 生成纯净 HTML：移除 DATA_FILES 注释块和 data 脚本标签，保留内联 JS 供后续 eval
          var bodyHtml = bodyContent
            .replace(/<!--\s*DATA_FILES_START\s*-->\s*/gi, '')
            .replace(/\s*<!--\s*DATA_FILES_END\s*-->/gi, '')
            .replace(/<script[^>]+src=["']([^"']*data\/[^"']+\.js)["'][^>]*>\s*/gi, '')
            .replace(/<script>[\s\S]*?<\/script>/i, ''); // 移除内联脚本（稍后 eval）

          bodyHtml = fixRelativePaths(bodyHtml, basePath);
          bodyHtml = bodyHtml.replace(/__CID__/g, id);
          // JS 代码里的 __CID__ArticleList 也要替换
          inlineScriptContent = inlineScriptContent.replace(/__CID__/g, id);

          // 5. 加载数据脚本
          return Promise.all(dataScripts.map(function(src) {
            return fetch(src).then(function(r) { return r.text(); });
          })).then(function(texts) {
            texts.forEach(function(text) {
              // 修复数据脚本中的相对路径（coverSrc, audioSrc 等）
              text = text.replace(/"(\.[^"]+)"/g, function(m, path) {
                if (path.startsWith('/') || path.startsWith('http')) return m;
                return '"' + basePath + path.replace(/^\.\//, '') + '"';
              });
              try { eval(text); } catch(e) {}
            });

            var prefix = CONTENT_PREFIX[id] || ('__' + id + '_');
            window.__scArticles = Object.keys(window)
              .filter(function(k) { return k.startsWith(prefix); })
              .sort()
              .reverse()
              .map(function(k) { return window[k]; });

            return { bodyHtml: bodyHtml, inlineScriptContent: inlineScriptContent };
          });
        })
        .then(function(result) {
          content.innerHTML = result.bodyHtml;
          content.dataset.loaded = 'true';
          // eval 内联脚本（innerHTML 不会自动执行内联 script）
          if (result.inlineScriptContent) {
            try { eval(result.inlineScriptContent); } catch(e) { console.error('Script eval error:', e); }
          }
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
