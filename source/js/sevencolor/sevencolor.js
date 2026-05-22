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

          // 每个 id 的 CSS 只注入一次
          if (!injectedStyles[id]) {
            var styles = doc.querySelectorAll('style');
            styles.forEach(function(s) {
              var newStyle = document.createElement('style');
              newStyle.textContent = s.textContent;
              newStyle.dataset.scId = id; // 标记属于哪个内容
              document.head.appendChild(newStyle);
            });
            injectedStyles[id] = true;
          }

          // 提取 data 文件的 script 标签
          var basePath = htmlUrl.replace(/\/[^/]*$/, '/');
          var dataScripts = [];
          doc.querySelectorAll('script').forEach(function(s) {
            var src = s.getAttribute('src');
            if (src && src.indexOf('data/') !== -1) {
              dataScripts.push(basePath + src.replace(/^\.\//, ''));
            }
          });

          // 并行加载所有 data 文件
          return Promise.all(dataScripts.map(function(src) {
            return fetch(src).then(function(r) { return r.text(); });
          })).then(function(texts) {
            // 执行所有 data 文件，设置 window.__yedu_* 变量
            texts.forEach(function(text) {
              try { eval(text); } catch(e) {}
            });

            // 汇总 articles
            window.__yedu_articles = Object.keys(window)
              .filter(function(k) { return k.startsWith('__yedu_'); })
              .sort()
              .reverse()
              .map(function(k) { return window[k]; });

            // 提取 body 内容，移除 <script> 标签（事件由父页面绑定）
            var bodyHtml = doc.body.innerHTML;
            bodyHtml = bodyHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            bodyHtml = fixRelativePaths(bodyHtml, basePath);

            content.innerHTML = bodyHtml;

            // 绑定事件
            bindYeduEvents(content);

            // 如果有分页，渲染第一页
            if (window.__yedu_articles && window.__yedu_articles.length > 0) {
              yeduRenderPage(1);
            }

            content.dataset.loaded = 'true';
          });
        })
        .catch(function(e) {
          content.innerHTML = '<div class="sc-loading">内容加载失败</div>';
          console.error('SevenColor load failed:', e);
        });
    }
  }

  function bindYeduEvents(content) {
    // 音频按钮
    var audioBtns = content.querySelectorAll('.yedu-audio-btn');
    audioBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(btn.getAttribute('data-index'));
        yeduToggleAudio.call(null, index, btn);
      });
    });

    // 展开/收起
    var readMores = content.querySelectorAll('.yedu-read-more');
    readMores.forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var index = parseInt(el.getAttribute('data-index'));
        yeduToggleContent.call(null, el, index);
      });
    });

    // 分页
    var prevBtn = content.querySelector('.yedu-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        if (prevBtn.disabled) return;
        var pg = content.querySelector('.yedu-pagination');
        if (pg) yeduRenderPage(parseInt(pg.getAttribute('data-page')) - 1);
      });
    }
    var nextBtn = content.querySelector('.yedu-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (nextBtn.disabled) return;
        var pg = content.querySelector('.yedu-pagination');
        if (pg) yeduRenderPage(parseInt(pg.getAttribute('data-page')) + 1);
      });
    }
  }

  // yedu 内部渲染（供外部调用）
  function yeduRenderPage(page) {
    var container = document.querySelector('#sc-content-yedu .yedu-article-list');
    if (!container || !window.__yedu_articles) return;

    var PAGE_SIZE = 10;
    var start = (page - 1) * PAGE_SIZE;
    var end = start + PAGE_SIZE;
    var pageArticles = window.__yedu_articles.slice(start, end);
    var totalPages = Math.ceil(window.__yedu_articles.length / PAGE_SIZE);

    var html = '';
    for (var i = 0; i < pageArticles.length; i++) {
      var article = pageArticles[i];
      var globalIndex = start + i;
      var hasAudio = !!article.audioSrc;
      var imgSrc = article.coverSrc || '';
      var metaHtml = '<div class="yedu-article-meta">';
      if (article.duration) {
        metaHtml += '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg><span>' + article.duration + '</span>';
      }
      metaHtml += '</div>';

      var progressHtml = hasAudio
        ? '<div class="yedu-audio-progress"><div class="yedu-audio-progress-bar" id="yedu-progress-' + globalIndex + '"></div></div>'
        : '';

      var paragraphsHtml = '';
      if (article.paragraphs && article.paragraphs.length) {
        for (var j = 0; j < article.paragraphs.length; j++) {
          paragraphsHtml += '<p>' + article.paragraphs[j] + '</p>';
        }
      }

      html += '<div class="yedu-article-card" data-index="' + globalIndex + '">' +
        '<div class="yedu-article-main">' +
          '<div class="yedu-article-cover">' +
            (imgSrc ? '<img src="' + imgSrc + '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' : '') +
            '<div class="yedu-img-placeholder" style="display:' + (imgSrc ? 'none' : 'flex') + '">夜读</div>' +
            (hasAudio ? '<button class="yedu-audio-btn" data-index="' + globalIndex + '" data-src="' + article.audioSrc + '"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' : '') +
            metaHtml +
            progressHtml +
          '</div>' +
          '<div class="yedu-article-content">' +
            '<h2 class="yedu-article-title" title="' + article.title + '">' + article.title + '</h2>' +
            (article.pubDate ? '<div class="yedu-article-date">' + article.pubDate + '</div>' : '') +
            '<p class="yedu-article-summary">' + (article.summary || '') + '</p>' +
            '<div class="yedu-read-more" data-index="' + globalIndex + '"><span>展开</span><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>' +
          '</div>' +
        '</div>' +
        '<div class="yedu-full-content" id="yedu-full-content-' + globalIndex + '">' +
          '<div class="yedu-full-content-inner">' +
            paragraphsHtml +
            '<a href="' + (article.url || '#') + '" target="_blank" class="yedu-source-link">查看原文 →</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    if (totalPages > 1) {
      html += '<div class="yedu-pagination" data-total="' + totalPages + '" data-page="' + page + '">' +
        '<button class="yedu-prev-btn" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button>' +
        '<span class="yedu-page-info">' + page + ' / ' + totalPages + '</span>' +
        '<button class="yedu-next-btn" ' + (page >= totalPages ? 'disabled' : '') + '>下一页</button>' +
      '</div>';
    }

    container.innerHTML = html;
    bindYeduEvents(container);
  }

  function yeduToggleAudio(index, btn) {
    var src = btn.getAttribute('data-src');
    var progressBar = document.getElementById('yedu-progress-' + index);
    var svg = btn.querySelector('svg');
    var pathEl = svg.querySelector('path');

    if (window._yeduAudio && window._yeduAudio.src === src) {
      if (window._yeduAudio.paused) {
        window._yeduAudio.play();
        btn.classList.add('yedu-playing');
        pathEl.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
      } else {
        window._yeduAudio.pause();
        btn.classList.remove('yedu-playing');
        pathEl.setAttribute('d', 'M8 5v14l11-7z');
      }
      return;
    }

    if (window._yeduAudio) {
      window._yeduAudio.pause();
      if (window._yeduAudioBtn) {
        window._yeduAudioBtn.classList.remove('yedu-playing');
        window._yeduAudioBtn.querySelector('svg path').setAttribute('d', 'M8 5v14l11-7z');
      }
    }

    var audio = new Audio(src);
    window._yeduAudio = audio;
    window._yeduAudioBtn = btn;

    audio.addEventListener('timeupdate', function() {
      if (audio.duration && progressBar) {
        progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
      }
    });

    audio.addEventListener('ended', function() {
      btn.classList.remove('yedu-playing');
      pathEl.setAttribute('d', 'M8 5v14l11-7z');
      if (progressBar) progressBar.style.width = '0%';
    });

    audio.addEventListener('error', function() {
      btn.classList.remove('yedu-playing');
      pathEl.setAttribute('d', 'M8 5v14l11-7z');
      if (progressBar) progressBar.style.width = '0%';
    });

    btn.classList.add('yedu-playing');
    pathEl.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
    audio.play().catch(function() {
      btn.classList.remove('yedu-playing');
      pathEl.setAttribute('d', 'M8 5v14l11-7z');
    });
  }

  function yeduToggleContent(el, index) {
    var content = document.getElementById('yedu-full-content-' + index);
    if (!content) return;
    var isShow = content.classList.toggle('yedu-show');
    el.querySelector('span').textContent = isShow ? '收起' : '展开';
    el.classList.toggle('yedu-expanded');
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
