/* ===== Waline 头像覆盖：只改默认蓝色mm为灰色mp ===== */
(function() {
  var MP_AVATAR = 'https://cravatar.cn/avatar/?d=mp&s=80';

  function replaceDefaultAvatars() {
    // 查找所有评论区的 img 标签（更宽泛的匹配）
    var allImgs = document.querySelectorAll('#post-comment img, .wl-cards img, .wl-comment img');
    
    for (var i = 0; i < allImgs.length; i++) {
      var img = allImgs[i];
      var src = img.src || '';
      
      // 只处理来自头像服务的图片（gravatar/cravatar）
      if (src.indexOf('gravatar') === -1 && src.indexOf('cravatar') === -1) continue;
      
      // 判断是否是默认蓝色头像（d=mm 或无 d 参数的默认情况）
      // 如果 URL 里有 d=mm，说明是默认蓝色头像，需要替换
      // 如果用户有自己的 Gravatar，URL 里 d= 应该是其他值或没有 d=
      if (src.indexOf('d=mm') !== -1) {
        img.src = MP_AVATAR;
        img.removeAttribute('srcset');
      }
      // 如果 URL 里完全没有 d= 参数（用户设置了自定义头像但没指定默认值）
      // 这种情况下保持原样，不替换
    }
  }

  // 页面加载后等待 Waline 渲染
  function init() {
    // 延迟 1 秒等 Waline 完全渲染
    setTimeout(replaceDefaultAvatars, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听评论区动态加载（新评论、翻页等）
  var observer = new MutationObserver(function(mutations) {
    setTimeout(replaceDefaultAvatars, 500);
  });

  var target = document.getElementById('post-comment') || document.querySelector('.wl-container') || document.body;
  observer.observe(target, { childList: true, subtree: true });
})();
