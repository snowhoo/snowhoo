/* ===== Waline 头像强制替换为灰色 mp ===== */
/* 强制所有评论头像显示 Cravatar 的灰色神秘人图案，不显示个性化头像 */
(function() {
  // 替换函数：把所有头像换成灰色 mp
  function replaceAvatars() {
    var avatars = document.querySelectorAll('.wl-avatar');
    for (var i = 0; i < avatars.length; i++) {
      var img = avatars[i];
      // 统一替换为 Cravatar 灰色 mp 头像
      img.src = 'https://cravatar.cn/avatar/?d=mp&s=80';
      img.removeAttribute('srcset');
    }
  }

  // 初始替换（等 Waline 渲染完）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(replaceAvatars, 500);
    });
  } else {
    setTimeout(replaceAvatars, 500);
  }

  // 观察新评论（无限滚动加载）
  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType === 1) { // Element node
          var imgs = node.querySelectorAll ? node.querySelectorAll('.wl-avatar') : [];
          for (var k = 0; k < imgs.length; k++) {
            imgs[k].src = 'https://cravatar.cn/avatar/?d=mp&s=80';
            imgs[k].removeAttribute('srcset');
          }
          // 也有可能这个节点本身就是头像
          if (node.classList && node.classList.contains('wl-avatar')) {
            node.src = 'https://cravatar.cn/avatar/?d=mp&s=80';
            node.removeAttribute('srcset');
          }
        }
      }
    }
  });

  // 监听评论区容器
  var commentEl = document.getElementById('post-comment') || document.querySelector('.wl-container');
  if (commentEl) {
    observer.observe(commentEl, { childList: true, subtree: true });
  }
})();
