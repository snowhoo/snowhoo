/**
 * TVBox 无感缓存 — IndexedDB 版
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
  var MAX_CACHE = 200; // 最多缓存 200 个文件

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

    // 超限时清理最旧的
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
              // 删完后写入
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
          // 后台无感刷新
          loadFresh(file, function() {}, timeout);
          return;
        }
        loadFresh(file, callback, timeout);
      });
    });
  }

  function warm(fileList, progress, done, timeout) {
    var total = fileList.length, finished = 0, running = 0;
    var MAX = 10;

    function bump() {
      finished++;
      if (progress) progress(finished, total);
    }

    function loadNext() {
      while (idx < fileList.length && loaded[fileList[idx]]) { bump(); idx++; }
      if (idx >= fileList.length) {
        if (running <= 0 && done) done();
        return;
      }
      if (running >= MAX) return;
      var f = fileList[idx++];
      running++;

      if (loaded[f]) { running--; bump(); loadNext(); return; }

      loadFromDB(f).then(function(cached) {
        if (cached) { loaded[f] = cached; running--; bump(); loadNext(); return; }
        loadFresh(f, function(data) {
          running--;
          bump();
          loadNext();
          if (finished >= total && done && running <= 0) done();
        }, timeout);
      });
    }

    var idx = 0;
    for (var i = 0; i < MAX; i++) loadNext();
  }

  return { load: load, warm: warm, loadData: load, loadedSources: loaded };
})();
