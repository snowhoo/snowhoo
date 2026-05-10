---
title: 新闻速递
date: 2026-05-09 10:45:00
type: news
description: 聚合22个平台的实时热点新闻
---

<link rel="stylesheet" href="/css/news-page.css">

<div class="news-page">
  <div class="platform-tabs" id="platform-tabs">
    <button class="tab-btn active" data-platform="baidu">百度</button>
    <button class="tab-btn" data-platform="weibo">微博</button>
    <button class="tab-btn" data-platform="36kr">36氪</button>
    <button class="tab-btn" data-platform="zhihu">知乎</button>
    <button class="tab-btn" data-platform="douban">豆瓣</button>
    <button class="tab-btn" data-platform="tieba">贴吧</button>
    <button class="tab-btn" data-platform="bilibili">B站</button>
    <button class="tab-btn" data-platform="hupu">虎扑</button>
    <button class="tab-btn" data-platform="douyin">抖音</button>
    <button class="tab-btn" data-platform="v2ex">V2EX</button>
    <button class="tab-btn" data-platform="juejin">掘金</button>
    <button class="tab-btn" data-platform="tenxunwang">腾讯网</button>
    <button class="tab-btn" data-platform="shaoshupai">少帅派</button>
    <button class="tab-btn" data-platform="jinritoutiao">今日头条</button>
    <button class="tab-btn" data-platform="52pojie">吾爱破解</button>
    <button class="tab-btn" data-platform="stackoverflow">Stack Overflow</button>
    <button class="tab-btn" data-platform="github">GitHub</button>
    <button class="tab-btn" data-platform="hackernews">HN</button>
    <button class="tab-btn" data-platform="sina_finance">新浪财经</button>
    <button class="tab-btn" data-platform="eastmoney">东方财富</button>
    <button class="tab-btn" data-platform="xueqiu">雪球</button>
    <button class="tab-btn" data-platform="cls">财联社</button>

  </div>

  <div class="news-content" id="news-container">
    <div class="loading">
      <span class="loading-icon">🔄</span>
      <span>加载中...</span>
    </div>
  </div>

  <div class="news-footer">
    <p>数源：热点速览  <span id="last-update"></span></p>
  </div>
</div>

<style>
.news-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 10px 8px;
}
.platform-tabs {
  display: flex;
  overflow-x: auto;
  gap: 6px;
  padding-bottom: 5px;
  margin-bottom: 5px;
  scrollbar-width: thin;
  scrollbar-color: #ccc transparent;
  -webkit-overflow-scrolling: touch;
  white-space: nowrap;
}
.platform-tabs::-webkit-scrollbar {
  height: 4px;
}
.platform-tabs::-webkit-scrollbar-track {
  background: transparent;
}
.platform-tabs::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 2px;
}
.tab-btn {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #f8f9fa;
  cursor: pointer;
  font-size: 13px;
  //font-weight: 400;
  transition: all 0.2s;
  flex-shrink: 0;
  white-space: nowrap;
}
.tab-btn:hover {
  background: #e9ecef;
}
.tab-btn.active {
  background: #ff6b6b;
  color: white;
  border-color: #ff6b6b;
}
html[data-theme=dark] .tab-btn {
  background: #2a2a2a;
  border-color: #444;
  color: #ccc;
}
html[data-theme=dark] .tab-btn:hover {
  background: #3a3a3a;
}
html[data-theme=dark] .tab-btn.active {
  background: #ff6b6b;
  color: white;
}
.news-content {
  min-height: 300px;
}
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  color: #888;
  font-size: 16px;
}
.loading-icon {
  font-size: 22px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.news-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.news-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 0 0;
}
.news-item:last-child {
  border-bottom: none;
}
.news-rank {
  min-width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  background: #f0f0f0;
  border-radius: 50%;
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
  margin-top: 2px;
}
html[data-theme=dark] .news-rank {
  background: #3a3a3a;
  color: #aaa;
}
.news-item.hot .news-rank {
  background: linear-gradient(135deg, #ff6b6b, #ff8e53);
  color: white;
}
.news-info {
  flex: 1;
  min-width: 0;
}
.news-title {
  font-size: 15px;
  //font-weight: 400;
  line-height: 1.2;
  margin: 0;
  word-break: break-word;
}
.news-title a {
  color: inherit;
  text-decoration: none;
}
.news-title a:hover {
  color: #ff6b6b;
  text-decoration: underline;
}
.news-desc {
  font-size: 13px;
  //font-weight: 400;
  color: #888;
  margin: 0;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.news-meta {
  font-size: 12px;
  //font-weight: 400;
  color: #aaa;
  margin-top: 4px;
}
.news-hot-tag {
  display: inline-block;
  padding: 2px 6px;
  background: #ff4757;
  color: white;
  border-radius: 4px;
  font-size: 11px;
  margin-left: 8px;
}
.news-footer {
  text-align: center;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #eee;
  color: #888;
  font-size: 13px;
}
.news-footer a {
  color: #ff6b6b;
}
.error-msg {
  text-align: center;
  padding: 40px;
  color: #ff6b6b;
}
.error-msg .retry-btn {
  margin-top: 16px;
  padding: 8px 24px;
  background: #ff6b6b;
  color: white;
  border: none;
  border-radius: 20px;
  cursor: pointer;
}
@media (max-width: 600px) {
  .news-page {
    padding: 6px 6px;
  }
  .tab-btn {
    padding: 4px 6px;
    font-size: 11px;
  }
  .news-title {
    font-size: 13px;
  }
}
</style>

<script>
(function() {
  const API_BASE = 'https://orz.ai/api/v1/dailynews/';
  const container = document.getElementById('news-container');
  const lastUpdate = document.getElementById('last-update');
  const tabBtns = document.querySelectorAll('.tab-btn');
  
  let currentPlatform = 'baidu';
  
  // Hot threshold (top N items get hot tag)
  const HOT_THRESHOLD = 3;
  
  function showLoading() {
    container.innerHTML = '<div class="loading"><span class="loading-icon">🔄</span><span>加载中...</span></div>';
  }
  
  function showError(msg) {
    container.innerHTML = '<div class="error-msg"><p>❌ ' + msg + '</p><button class="retry-btn" onclick="location.reload()">重试</button></div>';
  }
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  function formatScore(score) {
    const n = parseInt(score) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n.toLocaleString();
  }
  
  function renderNews(data) {
    if (!data || !data.data || data.data.length === 0) {
      showError('暂无数据，请稍后重试');
      return;
    }
    
    const items = data.data;
    let html = '<ul class="news-list">';
    
    items.forEach(function(item, index) {
      const rank = index + 1;
      const isHot = rank <= HOT_THRESHOLD;
      const hotTag = '';
      const title = item.title || '无标题';
      const url = item.url || '#';
      const desc = item.desc || '';
      const score = item.score ? formatScore(item.score) : '';
      
      html +=
        '<li class="news-item' + (isHot ? ' hot' : '') + '">' +
          '<span class="news-rank">' + rank + '</span>' +
          '<div class="news-info">' +
            '<h3 class="news-title">' +
              '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' + escapeHtml(title) + '</a>' + hotTag +
            '</h3>' +
            (desc ? '<p class="news-desc">' + escapeHtml(desc) + '</p>' : '') +
            (score ? '<div class="news-meta">热度: ' + escapeHtml(score) + '</div>' : '') +
          '</div>' +
        '</li>';
    });
    
    html += '</ul>';
    container.innerHTML = html;
    
    if (lastUpdate) {
      lastUpdate.textContent = '更新时间: ' + new Date().toLocaleString('zh-CN');
    }
  }
  
  async function fetchNews(platform) {
    showLoading();
    
    try {
      const url = API_BASE + '?platform=' + platform;
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error('请求失败: ' + response.status);
      }
      
      const data = await response.json();
      renderNews(data);
    } catch (err) {
      console.error('Fetch error:', err);
      showError('加载失败，请稍后重试');
    }
  }
  
  // Tab switching
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const platform = this.dataset.platform;
      if (platform === currentPlatform) return;
      
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      currentPlatform = platform;
      
      fetchNews(platform);
    });
  });
  
  // Initial load
  fetchNews(currentPlatform);
})();
</script>
