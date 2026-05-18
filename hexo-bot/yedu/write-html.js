/**
 * 根据 data/ 目录下的 .js 文件动态生成 index.html
 * 每次运行爬虫后执行，保持 index.html 与实际数据同步
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const OUTPUT_DIR = 'D:\\hexo\\source\\yedu';
const DATA_DIR = path.join(OUTPUT_DIR, 'data');
const HTML_PATH = path.join(OUTPUT_DIR, 'index.html');

// 扫描 data/ 下所有 .js 文件（排除 article-list.js 等）
const files = glob.sync('*.js', { cwd: DATA_DIR })
  .filter(f => f !== 'article-list.js')
  .sort()
  .reverse(); // 最新时间戳排在前面

const filesJsArray = '[\n      ' + files.map(f => "'" + f + "'").join(',\n      ') + '\n    ]';

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>夜读</title>
  <style>
    .yedu-app { padding: 0; }

    .yedu-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 16px;
      padding: 0 4px;
    }

    .yedu-header h1 {
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--text-primary, #1a1a2e);
    }

    .yedu-header span {
      font-size: 0.85rem;
      color: var(--text-secondary, #888);
    }

    .yedu-article-list { padding: 0 4px; }

    .yedu-article-card {
      background: var(--card-bg, rgba(255, 255, 255, 0.95));
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 12px;
      box-shadow: 0 2px 8px var(--shadow, rgba(0, 0, 0, 0.08));
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .yedu-article-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px var(--shadow, rgba(0, 0, 0, 0.12));
    }

    .yedu-article-main {
      display: flex;
    }

    .yedu-article-cover {
      position: relative;
      flex: 0 0 120px;
      width: 120px;
      overflow: hidden;
      background: var(--cover-bg, #2d4a6e);
    }

    .yedu-article-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .yedu-article-card:hover .yedu-article-cover img { transform: scale(1.06); }

    .yedu-audio-btn {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 36px;
      height: 36px;
      background: rgba(233, 69, 96, 0.9);
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      z-index: 2;
    }

    .yedu-audio-btn:hover { background: rgba(233, 69, 96, 1); transform: translate(-50%, -50%) scale(1.1); }

    .yedu-audio-btn svg { width: 14px; height: 14px; fill: #fff; margin-left: 2px; }
    .yedu-audio-btn.yedu-playing svg { margin-left: 0; }
    .yedu-audio-btn.yedu-playing svg path { d: "M6 4h4v16H6zM14 4h4v16h-4z"; }

    .yedu-article-meta {
      position: absolute;
      bottom: 4px;
      right: 4px;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 0.65rem;
      display: flex;
      align-items: center;
      gap: 3px;
      z-index: 2;
    }

    .yedu-article-meta svg { width: 9px; height: 9px; fill: currentColor; }

    .yedu-audio-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 2px;
      background: rgba(255, 255, 255, 0.3);
      z-index: 3;
    }

    .yedu-audio-progress-bar {
      height: 100%;
      background: #e94560;
      width: 0;
      transition: width 0.1s linear;
    }

    .yedu-article-content {
      flex: 1;
      padding: 0 8px;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .yedu-article-title {
      color: var(--text-primary, #1a1a2e);
      font-weight: 600;
      white-space: normal;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .yedu-article-date {
      color: var(--text-secondary, #aaa);
    }

    .yedu-article-summary {
      color: var(--text-secondary, #888);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .yedu-read-more {
      color: #e94560;
      font-size: 0.7rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      margin: 0;
      padding: 0;
      border: none;
      background: none;
      transition: gap 0.2s ease;
    }

    .yedu-read-more:hover { gap: 4px; }
    .yedu-read-more svg { width: 10px; height: 10px; fill: #e94560; transition: transform 0.2s ease; }
    .yedu-read-more.yedu-expanded svg { transform: rotate(180deg); }

    .yedu-full-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s ease;
      background: var(--card-bg, rgba(255, 255, 255, 0.98));
    }

    .yedu-full-content.yedu-show { max-height: 2000px; }

    .yedu-full-content-inner {
      padding: 14px;
      color: var(--text-primary, #333);
      font-size: 0.85rem;
      line-height: 1.8;
      border-top: 1px solid var(--border-color, #eee);
    }

    .yedu-full-content-inner p { margin-bottom: 10px; }

    .yedu-source-link {
      display: inline-block;
      margin-top: 10px;
      color: var(--text-secondary, #999);
      font-size: 0.75rem;
      text-decoration: none;
      transition: color 0.2s ease;
    }

    .yedu-source-link:hover { color: #e94560; }

    .yedu-loading {
      text-align: center;
      color: var(--text-secondary, rgba(255, 255, 255, 0.5));
      padding: 40px 0;
      font-size: 0.9rem;
    }

    .yedu-img-placeholder {
      width: 100%;
      height: 100%;
      background: var(--cover-bg, #2d4a6e);
      background-image: url('images/placeholder.jpg');
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 255, 255, 0.8);
      font-size: 0.9rem;
      font-weight: 500;
    }

    .yedu-pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
    }

    .yedu-pagination button {
      padding: 6px 14px;
      border: none;
      border-radius: 6px;
      background: var(--btn-bg, rgba(255, 255, 255, 0.15));
      color: var(--text-primary, #fff);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .yedu-pagination button:hover:not(:disabled) { background: rgba(233, 69, 96, 0.8); }
    .yedu-pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
    .yedu-pagination .yedu-page-info { color: var(--text-secondary, rgba(255, 255, 255, 0.6)); font-size: 0.8rem; }

    @media (max-width: 600px) {
      .yedu-article-main { flex-direction: column; }
      .yedu-article-cover { flex: none; width: 100%; height: 140px; }
      .yedu-audio-btn { width: 40px; height: 40px; }
      .yedu-article-content { padding: 4px 10px; }
    }

    @media (min-width: 601px) {
      .yedu-article-cover { flex: 0 0 160px; width: 160px; }
    }
  </style>
</head>
<body>
  <div class="yedu-app">
    <div class="yedu-header">
      <h1>夜读</h1>
      <span>每晚十点·温暖相伴</span>
    </div>

    <div class="yedu-article-list" id="yeduArticleList">
      <div class="yedu-loading">正在加载...</div>
    </div>
  </div>

  <script type="module">
    var DATA_FILES = ${filesJsArray};

    var PAGE_SIZE = 10;
    var currentPage = 1;
    var articles = [];
    var currentAudio = null;
    var currentBtn = null;

    var pausePath = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
    var playPath = 'M8 5v14l11-7z';

    async function loadData() {
      try {
        var fetches = DATA_FILES.map(function(f) {
          return import('./data/' + f).then(function(m) { return m.default; }).catch(function() { return null; });
        });
        var results = await Promise.all(fetches);
        articles = results.filter(Boolean);
        renderPage(1);
      } catch (e) {
        console.error('加载失败:', e);
        document.getElementById('yeduArticleList').innerHTML =
          '<div class="yedu-loading">数据加载失败，请刷新重试</div>';
      }
    }

    function renderPage(page) {
      currentPage = page;
      var start = (page - 1) * PAGE_SIZE;
      var end = start + PAGE_SIZE;
      var pageArticles = articles.slice(start, end);
      var totalPages = Math.ceil(articles.length / PAGE_SIZE);
      var container = document.getElementById('yeduArticleList');

      if (articles.length === 0) {
        container.innerHTML = '<div class="yedu-loading">暂无内容</div>';
        return;
      }

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
              (imgSrc ? '<img src="' + imgSrc + '" alt="" loading="lazy" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'flex\\'">' : '') +
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

      // 替换旧的点击 listener（防止叠加）
      if (window._yeduHandler) {
        container.removeEventListener('click', window._yeduHandler);
      }
      window._yeduHandler = function(e) {
        var btn = e.target.closest('.yedu-audio-btn');
        if (btn) {
          e.stopPropagation();
          yeduToggleAudio(parseInt(btn.getAttribute('data-index')), btn);
          return;
        }
        var readMore = e.target.closest('.yedu-read-more');
        if (readMore) {
          e.stopPropagation();
          yeduToggleContent(readMore, parseInt(readMore.getAttribute('data-index')));
          return;
        }
        var prevBtn = e.target.closest('.yedu-prev-btn');
        if (prevBtn && !prevBtn.disabled) {
          var pg = document.querySelector('.yedu-pagination');
          renderPage(parseInt(pg.getAttribute('data-page')) - 1);
          return;
        }
        var nextBtn = e.target.closest('.yedu-next-btn');
        if (nextBtn && !nextBtn.disabled) {
          var pg = document.querySelector('.yedu-pagination');
          renderPage(parseInt(pg.getAttribute('data-page')) + 1);
          return;
        }
      };
      container.addEventListener('click', window._yeduHandler);
    }

    function yeduToggleAudio(index, btn) {
      var src = btn.getAttribute('data-src');
      var progressBar = document.getElementById('yedu-progress-' + index);
      var svg = btn.querySelector('svg');
      var pathEl = svg.querySelector('path');

      if (currentAudio && currentAudio.src === src) {
        if (currentAudio.paused) {
          currentAudio.play();
          btn.classList.add('yedu-playing');
          pathEl.setAttribute('d', pausePath);
        } else {
          currentAudio.pause();
          btn.classList.remove('yedu-playing');
          pathEl.setAttribute('d', playPath);
        }
        return;
      }

      if (currentAudio) {
        currentAudio.pause();
        if (currentBtn) {
          currentBtn.classList.remove('yedu-playing');
          currentBtn.querySelector('svg path').setAttribute('d', playPath);
        }
      }

      var audio = new Audio(src);
      currentAudio = audio;
      currentBtn = btn;

      audio.addEventListener('timeupdate', function() {
        if (audio.duration && progressBar) {
          progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
        }
      });

      audio.addEventListener('ended', function() {
        btn.classList.remove('yedu-playing');
        pathEl.setAttribute('d', playPath);
        if (progressBar) progressBar.style.width = '0%';
      });

      audio.addEventListener('error', function() {
        btn.classList.remove('yedu-playing');
        pathEl.setAttribute('d', playPath);
        if (progressBar) progressBar.style.width = '0%';
      });

      btn.classList.add('yedu-playing');
      pathEl.setAttribute('d', pausePath);
      audio.play().catch(function() {
        btn.classList.remove('yedu-playing');
        pathEl.setAttribute('d', playPath);
      });
    }

    function yeduToggleContent(el, index) {
      var content = document.getElementById('yedu-full-content-' + index);
      var isShow = content.classList.toggle('yedu-show');
      el.querySelector('span').textContent = isShow ? '收起' : '展开';
      el.classList.toggle('yedu-expanded');
    }

    document.addEventListener('DOMContentLoaded', loadData);
  </script>
</body>
</html>`;

fs.writeFileSync(HTML_PATH, html, 'utf8');

console.log('index.html generated: ' + files.length + ' articles');
