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

    // 指纹检测：文件列表变了才联网刷新
    var fp = fileList.join('|');
    var oldFp = '';
    try { oldFp = localStorage.getItem('tvbox_cache_fp') || ''; } catch(e) {}
    var changed = (fp !== oldFp);
    if (changed) try { localStorage.setItem('tvbox_cache_fp', fp); } catch(e) {}

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

    if (changed) {
      // 数据更新：先 IndexedDB 快速加载 → 再后台联网刷新
      var dbLoaded = 0;
      fileList.forEach(function(f) {
        loadFromDB(f).then(function(cached) {
          if (cached && !loaded[f]) loaded[f] = cached;
          dbLoaded++;
          if (dbLoaded >= total) {
            // 全量联网刷新
            var idx = 0, running = 0;
            function refresh() {
              if (idx >= fileList.length) {
                if (running <= 0) finish();
                return;
              }
              if (running >= CONCURRENT) return;
              var f = fileList[idx++]; running++;
              loadFresh(f, function() {
                running--; bump(); refresh();
                if (idx >= fileList.length && running <= 0) finish();
              }, timeout);
            }
            for (var i = 0; i < CONCURRENT; i++) refresh();
          }
        });
      });
    } else {
      // 数据未变：仅从 IndexedDB 加载，不走网络
      var idx = 0, running = 0;
      function loadNext() {
        while (idx < fileList.length && loaded[fileList[idx]]) { bump(); idx++; }
        if (idx >= fileList.length) { if (running <= 0) finish(); return; }
        if (running >= CONCURRENT) return;
        var f = fileList[idx++]; running++;
        loadFromDB(f).then(function(cached) {
          if (cached && !loaded[f]) loaded[f] = cached;
          running--; bump(); loadNext();
          if (idx >= fileList.length && running <= 0) finish();
        }).catch(function() {
          running--; bump(); loadNext();
        });
      }
      for (var i = 0; i < CONCURRENT; i++) loadNext();
    }
  }

  return { load: load, warm: warm, loadData: load, loadedSources: loaded };
})();
