/**
 * TVBox 无感缓存 — IndexedDB 版（带指纹检测）
 * 用法：<script src="/js/sevencolor/tvbox-cache.js"></script>
 *
 * 提供接口：
 *   TVCache.load(file, callback)
 *   TVCache.warm(fileList, progress, done)
 *   TVCache.loadedSources  — 内存缓存（对象）
 */

;var TVCache = (function() {
  var DB_NAME = 'tvbox_cache';
  var STORE = 'files';
  var DB_VERSION = 1;
  var db = null;
  var dbReady = null;
  var globalKey = '_TVBOX_SITE_DATA';
  var loaded = {};
  var MAX_CACHE = 520;

  function openDB() {
    if (dbReady) return dbReady;
    dbReady = new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function(e) {
        e.target.result.createObjectStore(STORE, { keyPath: 'file' });
      };
      req.onsuccess = function(e) {
        db = e.target.result;
        resolve(db);
      };
      req.onerror = function(e) {
        console.warn('IndexedDB 不可用，降级到内存缓存');
        db = null;
        resolve(null);
      };
    });
    return dbReady;
  }

  function loadFromDB(file) {
    if (!db) return Promise.resolve(null);
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction(STORE, 'readonly');
        var store = tx.objectStore(STORE);
        var req = store.get(file);
        req.onsuccess = function() {
          var entry = req.result;
          if (entry && entry._d) {
            entry._d._cached = true;
            resolve(entry._d);
          } else resolve(null);
        };
        req.onerror = function() { resolve(null); };
      } catch(e) { resolve(null); }
    });
  }

  function saveToDB(file, data) {
    if (!db || !data) return;
    var fp = (data.videos ? data.videos.length : 0) + '|' +
             ((data.videos || [])[0] ? (data.videos[0].vod_name || '') : '');
    var entry = { file: file, _d: data, _fp: fp, _t: Date.now() };
    // 记录字节数，供 warm 逐文件比对
    try { localStorage.setItem('tvbox_fsize_' + file, JSON.stringify(data).length); } catch(e) {}

    try {
      var countReq = db.transaction(STORE, 'readonly').objectStore(STORE).count();
      countReq.onsuccess = function() {
        if (countReq.result >= MAX_CACHE) {
          var delReq = db.transaction(STORE, 'readwrite').objectStore(STORE).openCursor();
          var deleted = 0;
          delReq.onsuccess = function(e2) {
            var cursor = e2.target.result;
            if (cursor && deleted < Math.ceil(MAX_CACHE / 4)) {
              cursor.delete();
              deleted++;
              cursor.continue();
            } else if (!delReq._done) {
              delReq._done = true;
              try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry); } catch(_) {}
            }
          };
        } else {
          try { db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry); } catch(_) {}
        }
      };
    } catch(e) {}
  }

  function loadFresh(file, callback, timeout) {
    timeout = timeout || 5000;
    var s = document.createElement('script');
    var t = setTimeout(function() { s.onerror = s.onload = null; s.remove(); callback(null); }, timeout);
    s.onerror = function() { clearTimeout(t); callback(null); };
    s.onload = function() {
      clearTimeout(t);
      var d = window[globalKey];
      delete window[globalKey];
      d = d || null;
      if (d) {
        saveToDB(file, d);
        loaded[file] = d;
      }
      callback(d);
    };
    s.src = (window.__TVBOX_BASE || '') + 'data/' + file;
    document.head.appendChild(s);
  }

  function load(file, callback, timeout) {
    if (loaded[file]) { callback(loaded[file]); return; }

    openDB().then(function() {
      loadFromDB(file).then(function(cached) {
        if (cached) {
          loaded[file] = cached;
          callback(cached);
          // 后台无感刷新（load 总是刷新，因为用户主动请求）
          loadFresh(file, function() {}, timeout);
          return;
        }
        loadFresh(file, callback, timeout);
      });
    });
  }

  function warm(fileList, progress, done, timeout) {
    var total = fileList.length, finished = 0;
    var CONCURRENT = 10;
    var basePath = window.__TVBOX_BASE || '';

    // 底部进度条
    var bar = document.createElement('div');
    bar.innerHTML = '<div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:4px 12px;background:rgba(22,33,62,0.95);font-size:11px;color:#90a4ae;font-family:-apple-system,Microsoft YaHei,sans-serif;display:flex;align-items:center;gap:8px"><span style="flex-shrink:0">📦 缓存预热中</span><span style="flex:1;height:2px;background:#333;border-radius:1px;overflow:hidden"><span class="tvbox-bar-fill" style="display:block;height:100%;width:0;background:#ff6b35;transition:width .2s"></span></span><span class="tvbox-bar-pct" style="flex-shrink:0;min-width:32px;text-align:right">0%</span></div>';
    document.body.appendChild(bar.firstElementChild);
    var barFill = document.querySelector('.tvbox-bar-fill');
    var barPct = document.querySelector('.tvbox-bar-pct');
    var barWrap = barFill.parentElement.parentElement;

    function bump() {
      finished++;
      var pct = Math.floor(finished / total * 100);
      if (barFill) { barFill.style.width = pct + '%'; }
      if (barPct) { barPct.textContent = pct + '%'; }
      if (progress) progress(finished, total);
    }

    function finish() {
      if (barFill) { barFill.style.width = '100%'; barFill.style.background = '#2e7d32'; }
      if (barPct) { barPct.textContent = '100%'; barPct.style.color = '#2e7d32'; }
      setTimeout(function() {
        if (barWrap && barWrap.parentNode) barWrap.parentNode.removeChild(barWrap);
      }, 800);
      if (done) done();
    }

    // 第一步：从 IndexedDB 快速加载
    var dbLoaded = 0;
    fileList.forEach(function(f) {
      loadFromDB(f).then(function(cached) {
        if (cached && !loaded[f]) loaded[f] = cached;
        dbLoaded++;
        bump();
      });
    });

    // 第二步：逐文件 fetch 比对字节数，变化才联网刷新
    var checkDone = 0, needRefresh = [];
    fileList.forEach(function(f) {
      fetch(basePath + 'data/' + f)
        .then(function(r) { return r.text(); })
        .then(function(t) {
          var newSize = t.length;
          var oldSize = parseInt((localStorage.getItem('tvbox_fsize_' + f) || '').split('|')[0] || '0');
          if (newSize !== oldSize) needRefresh.push(f);
        })
        .catch(function() {})
        .then(function() {
          checkDone++;
          if (checkDone >= fileList.length) {
            // 第三步：仅刷新变化的文件
            if (needRefresh.length === 0) {
              finish();
              return;
            }
            var ri = 0, rr = 0;
            function doRefresh() {
              if (ri >= needRefresh.length) { if (rr <= 0) finish(); return; }
              if (rr >= CONCURRENT) return;
              var f = needRefresh[ri++]; rr++;
              loadFresh(f, function() { rr--; doRefresh(); }, timeout);
            }
            for (var i = 0; i < CONCURRENT; i++) doRefresh();
          }
        });
    });
  }

  return { load: load, warm: warm, loadData: load, loadedSources: loaded };
})();

// ── 自动预热触发器 ──
// 如果页面未设置 __TVBOX_BASE，默认指向 /js/sevencolor/3/
// __TVBOX_WARM_RUN 防止重复启动（3.html 也会触发自己的预热）
if (!window.__TVBOX_WARM_RUN) {
  window.__TVBOX_WARM_RUN = true;
  window.__TVBOX_BASE = window.__TVBOX_BASE || '/js/sevencolor/3/';
  var warmScript = document.createElement('script');
  warmScript.src = window.__TVBOX_BASE + 'data/index.js';
  warmScript.onload = function() {
    var idx = window._TVBOX_INDEX;
    delete window._TVBOX_INDEX;
    if (!idx || !idx.length) return;
    var files = [];
    idx.forEach(function(site) {
      if (site.page_count) {
        for (var pg = 1; pg <= site.page_count; pg++) {
          var n = String(pg);
          if (n.length < 2) n = '0' + n;
          files.push(site.file.replace(/-01\.js$/, '-' + n + '.js'));
        }
      }
    });
    if (files.length) TVCache.warm(files);
  };
  document.head.appendChild(warmScript);
}
