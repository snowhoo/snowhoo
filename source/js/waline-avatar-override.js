// Waline 头像强制覆盖：统一显示灰色 mystery person（mp）
// 解决 avatar: 'mp' 配置在官方服务不生效的问题
(function() {
  if (!window.walineFn) {
    var origFn = window.walineFn;
    window.walineFn = function() {
      var init = origFn.apply(this, arguments);
      replaceAvatars();
      return init;
    };
  }

  function replaceAvatars() {
    var avatars = document.querySelectorAll('.wl-avatar');
    avatars.forEach(function(img) {
      if (img.src && img.src.includes('gravatar.com') && !img.src.includes('d=mp')) {
        img.src = img.src.replace(/d=[^&]+/, 'd=mp');
      }
    });
  }

  // 监听 Waline 评论渲染，用 MutationObserver 捕获动态加载的评论
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          var avatars = node.querySelectorAll ? node.querySelectorAll('.wl-avatar') : [];
          avatars.forEach(function(img) {
            if (img.src && img.src.includes('gravatar.com') && !img.src.includes('d=mp')) {
              img.src = img.src.replace(/d=[^&]+/, 'd=mp');
            }
          });
          // 节点本身可能是单个评论
          if (node.classList && node.classList.contains('wl-comment')) {
            var selfAvatar = node.querySelector('.wl-avatar');
            if (selfAvatar && selfAvatar.src && selfAvatar.src.includes('gravatar.com') && !selfAvatar.src.includes('d=mp')) {
              selfAvatar.src = selfAvatar.src.replace(/d=[^&]+/, 'd=mp');
            }
          }
        }
      });
    });
  });

  function startObserver() {
    var target = document.querySelector('#waline-wrap');
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(startObserver, 1500);
      setTimeout(replaceAvatars, 2000);
    });
  } else {
    setTimeout(startObserver, 500);
    setTimeout(replaceAvatars, 1500);
  }
})();
