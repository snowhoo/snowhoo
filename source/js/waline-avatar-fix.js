/* ===== Waline 头像覆盖：只改 libravatar/gravatar/cravatar 默认头像，不动 QQ 头像 ===== */
(function() {
  var GREY_MP = 'https://cravatar.cn/avatar/?d=mp&s=80';

  function replaceAvatars() {
    var avatars = document.querySelectorAll('.wl-user-avatar');
    
    for (var i = 0; i < avatars.length; i++) {
      var img = avatars[i];
      var src = img.src || '';
      
      // 只处理 Libravatar/Gravatar/Cravatar
      if (src.indexOf('libravatar') !== -1 || 
          src.indexOf('gravatar') !== -1 || 
          src.indexOf('cravatar') !== -1) {
        img.src = GREY_MP;
        img.removeAttribute('srcset');
      }
    }
  }

  function init() {
    setTimeout(replaceAvatars, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  var observer = new MutationObserver(function() {
    setTimeout(replaceAvatars, 500);
  });

  var target = document.getElementById('post-comment') || document.querySelector('.wl-container') || document.body;
  observer.observe(target, { childList: true, subtree: true });
})();
