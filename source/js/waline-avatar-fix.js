/**
 * Waline 默认头像强制替换
 * 将所有 Gravatar 默认头像替换为本地中性简约头像
 */
(function () {
  const DEFAULT_AVATAR = '/images/default-avatar.png';

  // 判断是否为 Gravatar 默认头像（无个性化头像时的默认图）
  function isDefaultAvatar(src) {
    if (!src) return true;
    // Gravatar 默认头像 URL 特征
    return (
      src.includes('gravatar.com/avatar/') ||
      src.includes('cravatar.cn/avatar/') ||
      src.includes('cn.gravatar.com/avatar/')
    );
  }

  // 替换单个头像
  function replaceAvatar(img) {
    if (!img || img.dataset.avatarFixed) return;
    const src = img.getAttribute('src') || '';
    if (isDefaultAvatar(src)) {
      img.setAttribute('src', DEFAULT_AVATAR);
      img.dataset.avatarFixed = '1';
    }
  }

  // 扫描并替换所有头像
  function scanAndReplace() {
    document.querySelectorAll('.wl-avatar').forEach(replaceAvatar);
  }

  // DOM 变化监听（处理翻页、新评论等动态内容）
  function observeChanges() {
    const observer = new MutationObserver(function (mutations) {
      let shouldScan = false;
      mutations.forEach(function (m) {
        if (m.addedNodes.length > 0) shouldScan = true;
      });
      if (shouldScan) scanAndReplace();
    });
    const target = document.querySelector('.wl-cards') || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  // 在 Waline 初始化后执行
  function init() {
    scanAndReplace();
    observeChanges();
    // 延迟再次扫描（处理异步加载）
    setTimeout(scanAndReplace, 1000);
    setTimeout(scanAndReplace, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
