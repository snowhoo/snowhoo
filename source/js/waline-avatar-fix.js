/* ===== Waline 头像统一替换为灰色 mp ===== */
/* 强制所有评论头像（无论来自 Libravatar/Gravatar/Cravatar）显示灰色默认头像 */
(function() {
  var GREY_MP = 'https://cravatar.cn/avatar/?d=mp&s=80';

  function replaceAvatars() {
    // 用正确的 class 名称：wl-user-avatar
    var avatars = document.querySelectorAll('.wl-user-avatar');
    
    for (var i = 0; i < avatars.length; i++) {
      var img = avatars[i];
      var src = img.src || '';
      
      // 处理 Libravatar / Gravatar / Cravatar 的默认头像
      if (src.indexOf('libravatar') !== -1 || 
          src.indexOf('gravatar') !== -1 || 
          src.indexOf('cravatar') !== -1 ||
          src.indexOf('qlogo') !== -1) {
        img.src = GREY_MP;
        img.removeAttribute('srcset');
      }
    }
  }

  // 页面加载后等待 Waline 渲染
  function init() {
    setTimeout(replaceAvatars, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听评论区动态加载
  var observer = new MutationObserver(function() {
    setTimeout(replaceAvatars, 500);
  });

  var target = document.getElementById('post-comment') || document.querySelector('.wl-container') || document.body;
  observer.observe(target, { childList: true, subtree: true });
})();
