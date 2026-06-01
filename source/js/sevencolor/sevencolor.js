/**
 * 新七彩按钮组 - 展开式内容加载
 * 点击按钮展开/收起，内容通过 fetch HTML 动态加载
 */
(function() {
  var CONFIG_URL = '/js/sevencolor/config.json';
  var config = [];
  var openedId = null;
  var injectedStyles = {}; // 记录每个 id 已注入的 style，避免重复
  var contentScopes = {}; // 每个 id 独立的作用域，存储 articles、render 等

  function ensureContentContainers() {
    var container = document.getElementById('seven-color-card');
    if (!container) return;
    // 清空所有旧的 content 容器
    var oldContents = container.querySelectorAll('.sc-content');
    oldContents.forEach(function(el) { el.remove(); });
    // 根据 config 动态创建新的 content 容器
    config.forEach(function(item) {
      var div = document.createElement('div');
      div.id = 'sc-content-' + item.id;
      div.className = 'sc-content';
      container.appendChild(div);
    });
  }

  function renderButtons() {
    var container = document.getElementById('seven-color-card');
    if (!container) return;
    var row = container.querySelector('.sc-btn-row');
    if (!row) return;
    row.innerHTML = '';
    config.forEach(function(item) {
      var btn = document.createElement('div');
      btn.className = 'sc-btn sc-btn-' + item.colorIndex;
      btn.dataset.id = item.id;
      btn.dataset.htmlUrl = item.htmlUrl;
      
      // 左侧文字区
      var leftPart = document.createElement('div');
      leftPart.className = 'sc-btn-left';
      leftPart.innerHTML = '<span class="sc-btn-text">' + item.icon + ' ' + item.title + '</span>';
      leftPart.addEventListener('click', function(e) {
        e.stopPropagation();
        window.location.href = item.htmlUrl.replace(/[^/]*$/, '');
      });
      
      // 右侧箭头区
      var rightPart = document.createElement('div');
      rightPart.className = 'sc-btn-right';
      rightPart.innerHTML = '<span class="sc-arrow">▼</span>';
      rightPart.addEventListener('click', function(e) {
        e.stopPropagation();
        handleBtnClick({ currentTarget: btn });
      });
      
      btn.appendChild(leftPart);
      btn.appendChild(rightPart);
      row.appendChild(btn);
    });
    // 按钮渲染完成后，确保 content 容器存在
    ensureContentContainers();
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

  function openContent(id, htmlUrl, btn) {
    var container = document.getElementById('seven-color-card');
    var content = container.querySelector('#sc-content-' + id);
    if (!content) return;

    // 如果内容已加载过，直接恢复并重新渲染
    if (content.dataset.loaded === 'true') {
      var scope = contentScopes[id] || { articles: [], render: null };
      try {
        scope.articles = JSON.parse(content.dataset.articles || '[]');
      } catch(e) {
        scope.articles = [];
      }
      btn.classList.add('sc-open');
      content.classList.add('sc-open');
      addCollapseBar(content, id);
      if (scope.render && typeof scope.render === 'function') {
        scope.render(1);
      }
      return;
    }

    btn.classList.add('sc-open');
    content.classList.add('sc-open');
    addCollapseBar(content, id);
    content.innerHTML = '<div class="sc-loading">加载中...</div>';

    fetch(htmlUrl)
      .then(function(r) { return r.text(); })
      .then(function(html) {
        // 提取 <head> 中的 <style> 和 <link>
        var headStyles = [];
        var headLinks = [];
        html = html.replace(/<head[^>]*>([\s\S]*?)<\/head>\s*/gi, function(match, headContent) {
          var s = headContent.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
          if (s) headStyles = headStyles.concat(s);
          var l = headContent.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi);
          if (l) headLinks = headLinks.concat(l);
          return '';
        });

        // 去掉 Hexo front matter 和外层框架标签
        html = html.replace(/^---[\s\S]*?---\s*/i, '');
        html = html.replace(/<!DOCTYPE[^>]*>\s*/gi, '');
        html = html.replace(/<html[^>]*>/gi, '');
        html = html.replace(/<\/html>\s*/gi, '');
        html = html.replace(/<body/gi, '<div');
        html = html.replace(/<\/body>/gi, '</div>');
        var bodyContent = html.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, '');

        // 提取内联脚本
        var inlineScriptContent = '';
        var scriptMatch = bodyContent.match(/<script>([\s\S]*?)<\/script>/i);
        if (scriptMatch) {
          inlineScriptContent = scriptMatch[1];
        }

        // 移除所有 script 标签
        var bodyHtml = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '');

        var basePath = htmlUrl.replace(/\/[^/]*$/, '/');

        bodyHtml = fixRelativePaths(bodyHtml, basePath);
        bodyHtml = bodyHtml.replace(/__CID__/g, id);

        // 注入 CSS（每个 id 只注入一次）
        if (!injectedStyles[id]) {
          if (headStyles.length > 0) {
            headStyles.forEach(function(styleTag) {
              var contentMatch = styleTag.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
              if (contentMatch) {
                var newStyle = document.createElement('style');
                var cssContent = contentMatch[1]
                  .replace(/__CID__/g, id);
                
                // 将 CSS 限制在 #sc-content-{id} 容器内
                // 使用更精确的方法：给每个选择器添加父容器限定
                cssContent = cssContent.replace(/([^{}]+)(\{[^}]*\})/g, function(match, selector, body) {
                  // 跳过@rules（@media, @keyframes, @font-face 等），后续单独处理
                  if (selector.trim().startsWith('@')) {
                    return match;
                  }
                  var sel = selector.trim();
                  // 特殊处理 :root — 替换为父容器，使 CSS 变量生效
                  if (sel === ':root') {
                    return '#sc-content-' + id + body;
                  }
                  // 特殊处理 [data-theme="dark"] — 同一元素，不加空格（CSS 变量继承）
                  if (sel === '[data-theme="dark"]' || sel === '[data-theme="light"]') {
                    return '#sc-content-' + id + sel + body;
                  }
                  // 给选择器添加前缀限定（后代选择器）
                  return '#sc-content-' + id + ' ' + sel + body;
                });

                // 第二遍：处理 @media 内部的子选择器（用花括号计数，正确处理嵌套）
                var idx = 0;
                while (true) {
                  var atIdx = cssContent.indexOf('@media', idx);
                  if (atIdx === -1) break;

                  var openIdx = cssContent.indexOf('{', atIdx);
                  if (openIdx === -1) break;

                  // 花括号计数，找到匹配的 }
                  var depth = 1;
                  var scan = openIdx + 1;
                  while (depth > 0 && scan < cssContent.length) {
                    var ch = cssContent.charAt(scan);
                    if (ch === '{') depth++;
                    else if (ch === '}') depth--;
                    scan++;
                  }
                  var closeIdx = scan - 1; // 匹配的 }

                  var inner = cssContent.substring(openIdx + 1, closeIdx);
                  var scopedInner = inner.replace(/([^{}]+)(\{[^}]*\})/g, function(m2, sel, body) {
                    var s = sel.trim();
                    if (/^(from|to|\d+%)\s*$/.test(s)) return m2;
                    if (s === ':root') return '#sc-content-' + id + body;
                    if (s === '[data-theme="dark"]' || s === '[data-theme="light"]') return '#sc-content-' + id + s + body;
                    return '#sc-content-' + id + ' ' + s + body;
                  });

                  cssContent = cssContent.substring(0, openIdx + 1) + scopedInner + cssContent.substring(closeIdx);
                  idx = closeIdx + (scopedInner.length - inner.length);
                }
                
                // 处理相对路径
                cssContent = cssContent.replace(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g, function(m, path) {
                  if (path.startsWith('/') || path.startsWith('http')) return m;
                  return 'url(\'' + basePath + path + '\')';
                });
                
                newStyle.textContent = cssContent;
                newStyle.dataset.scId = id;
                document.head.appendChild(newStyle);
              }
            });
          }
          if (headLinks.length > 0) {
            headLinks.forEach(function(linkTag) {
              var tempDiv = document.createElement('div');
              tempDiv.innerHTML = linkTag;
              var linkEl = tempDiv.firstChild;
              if (linkEl) {
                var newLink = linkEl.cloneNode(true);
                newLink.dataset.scId = id;
                document.head.appendChild(newLink);
              }
            });
          }
          injectedStyles[id] = true;
        }

        // 替换内联脚本中的 __CID__（全局替换）
        inlineScriptContent = inlineScriptContent.replace(/__CID__/g, id);
        
        // 同时替换 bodyHtml 中可能遗漏的 __CID__（包括事件处理器中的）
        bodyHtml = bodyHtml.replace(/__CID__/g, id);

        // 设置 DOM
        content.innerHTML = bodyHtml;
        addCollapseBar(content, id);

        // 注入全局变量供嵌入页面使用（独立访问时也有默认值）
        window.__SC_BASE_PATH = basePath;
        window.__SC_ID = id;

        // 创建独立作用域
        var scope = {
          articles: [],
          basePath: basePath,
          id: id,
          render: null
        };
        contentScopes[id] = scope;

        // 注册数据加载回调（模板加载完数据后通知我们缓存）
        scope.onDataLoaded = function(articles) {
          scope.articles = articles;
          content.dataset.articles = JSON.stringify(articles);
          content.dataset.loaded = 'true';
        };

        // 沙箱执行内联脚本
        if (inlineScriptContent) {
          try {
            // 创建沙箱函数，传入局部变量
            var sandboxFn = new Function(
              'basePath', 'id', 'onDataLoaded', 'defineRender',
              '(function() { ' + inlineScriptContent + ' })()'
            );
            // 提供 defineRender 回调，让模板注册 render 函数
            sandboxFn(
              basePath,
              id,
              scope.onDataLoaded,
              function(renderFn) { scope.render = renderFn; }
            );
          } catch(e) {
            console.error('[SevenColor] Script eval error:', e);
          }
        }
      })
      .catch(function(e) {
        content.innerHTML = '<div class="sc-loading">内容加载失败</div>';
        console.error('[SevenColor] load failed:', e);
      });
  }

  function closeContent(id) {
    var container = document.getElementById('seven-color-card');
    var btn = container.querySelector('.sc-btn[data-id="' + id + '"]');
    var content = container.querySelector('#sc-content-' + id);
    if (btn) btn.classList.remove('sc-open');
    if (content) {
      content.classList.remove('sc-open');
      var bar = content.querySelector('.sc-collapse-bar');
      if (bar) bar.remove();
    }
  }

  function addCollapseBar(content, id) {
    var existing = content.querySelector('.sc-collapse-bar');
    if (existing) return;
    var bar = document.createElement('div');
    bar.className = 'sc-collapse-bar';
    bar.dataset.id = id;
    // 获取当前展开按钮的标题
    var btn = document.querySelector('.sc-btn[data-id="' + id + '"]');
    var btnTitle = btn ? btn.textContent.replace(/[▼▲]/g, '').trim() : '';
    bar.innerHTML = '<span class="sc-collapse-arrow">▲</span><span>收起 ' + btnTitle + '</span>';
    bar.addEventListener('click', function() {
      closeContent(id);
      openedId = null;
    });
    content.appendChild(bar);
  }

  function init() {
    fetch(CONFIG_URL)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (data && Array.isArray(data) && data.length > 0) {
          config = data;
          renderButtons();
          document.getElementById('seven-color-card').style.display = '';
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
    window.addEventListener('load', init);
  } else {
    window.addEventListener('load', init);
  }
})();
