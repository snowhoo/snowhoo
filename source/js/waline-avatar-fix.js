/**
 * Waline 默认头像强制替换
 * 持续监听并替换所有 Gravatar 默认头像为本地中性头像
 */
(function () {
  var AVATAR_URL = 'https://snowhoo.net/images/default-avatar.png';

  // 判断是否是 Gravatar 默认头像（无个性头像）
  function isDefault(src) {
    if (!src) return true;
    if (src.indexOf(AVATAR_URL) === 0) return false;
    if (src.indexOf('gravatar') === -1 && src.indexOf('cravatar') === -1) return false;
    return (
      src.indexOf('d=mp') !== -1 ||
      src.indexOf('d=retro') !== -1 ||
      src.indexOf('d=identicon') !== -1 ||
      src.indexOf('d=monsterid') !== -1 ||
      src.indexOf('/avatar/?') !== -1
    );
  }

  function replaceOne(img) {
    if (!img || img.dataset.fixed) return;
    var src = img.getAttribute('src') || '';
    if (isDefault(src)) {
      img.setAttribute('src', AVATAR_URL);
      img.dataset.fixed = '1';
    }
  }

  function scan() {
    var list = document.querySelectorAll('.wl-avatar');
    for (var i = 0; i < list.length; i++) {
      replaceOne(list[i]);
    }
  }

  var observer = new MutationObserver(function () {
    scan();
  });

  function start() {
    scan();
    try {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
      });
    } catch (e) {}
    setTimeout(start, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(start, 1000);
    });
  } else {
    setTimeout(start, 1000);
  }
})();
