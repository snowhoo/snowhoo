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
  var _checkedSession = {};
  var _basePath = (window.__TVBOX_BASE || '');

  function fetchHeadMeta(url, cb) {
    fetch(url, { method: 'HEAD', cache: 'no-cache' })
      .then(function(r) { cb({ lm: r.headers.get('Last-Modified'), cl: r.headers.get('Content-Length') }); })
      .catch(function() { cb(null); });
  }

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
            resolve({ data: entry._d, meta: { _t: entry._t, _lm: entry._lm, _cl: entry._cl, _fp: entry._fp } });
          } else resolve(null);
        };
        req.onerror = function() { resolve(null); };
      } catch(e) { resolve(null); }
    });
  }

  function saveToDB(file, data, meta) {
    if (!db || !data) return;
    var fp = (data.videos ? data.videos.length : 0) + '|' +
             ((data.videos || [])[0] ? (data.videos[0].vod_name || '') : '');
    var entry = { file: file, _d: data, _fp: fp, _t: Date.now() };
    if (meta) { entry._lm = meta.lm || null; entry._cl = meta.cl || null; }
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

  function loadFresh(file, callback, timeout, meta) {
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
        saveToDB(file, d, meta);
        loaded[file] = d;
      }
      callback(d);
    };
    s.src = _basePath + 'data/' + file;
    document.head.appendChild(s);
  }

  function load(file, callback, timeout) {
    // index.js 始终重新加载，不走任何缓存
    if (file === 'index.js') {
      loadFresh(file, callback, timeout);
      return;
    }
    if (loaded[file]) { callback(loaded[file]); return; }

    openDB().then(function() {
      loadFromDB(file).then(function(cached) {
        if (cached && cached.data) {
          loaded[file] = cached.data;
          callback(cached.data);
          // 仅当文件有更新时才后台刷新
          if (!_checkedSession[file]) {
            _checkedSession[file] = true;
            fetchHeadMeta(_basePath + 'data/' + file, function(srvMeta) {
              if (!srvMeta) return;
              var changed = false;
              if (srvMeta.lm && srvMeta.lm !== (cached.meta?._lm || null)) changed = true;
              else if (!changed && srvMeta.cl && srvMeta.cl !== (cached.meta?._cl || null)) changed = true;
              if (!changed) return;
              loadFresh(file, function(d) {
                if (d && callback) callback(d, true);
              }, timeout, srvMeta);
            });
          }
          return;
        }
        loadFresh(file, callback, timeout);
      });
    });
  }

  function warm(fileList, progress, done, timeout) {
    var total = fileList.length, finished = 0;
    var CONCURRENT = 10;

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
    fileList.forEach(function(f) {
      loadFromDB(f).then(function(cached) {
        if (cached && cached.data && !loaded[f]) loaded[f] = cached.data;
      });
    });

    // 第二步：用 HEAD 请求逐文件比对 Last-Modified / Content-Length
    var checkDone = 0, needRefresh = [];
    function tryProcessRefresh() {
        if (checkDone >= fileList.length) processRefresh();
    }
    fileList.forEach(function(f) {
      if (_checkedSession[f]) { checkDone++; bump(); tryProcessRefresh(); return; }
      fetchHeadMeta(_basePath + 'data/' + f, function(srvMeta) {
        if (!srvMeta) { checkDone++; bump(); tryProcessRefresh(); return; }
        // 从缓存中获取旧元信息
        (function(localFile, serverMeta) {
          if (!db) { needRefresh.push({ file: localFile, meta: serverMeta }); checkDone++; bump(); tryProcessRefresh(); return; }
          try {
            var tx = db.transaction(STORE, 'readonly');
            var store = tx.objectStore(STORE);
            var req = store.get(localFile);
            req.onsuccess = function() {
              var entry = req.result;
              var changed = false;
              if (serverMeta.lm && serverMeta.lm !== (entry?._lm || null)) changed = true;
              else if (!changed && serverMeta.cl && serverMeta.cl !== (entry?._cl || null)) changed = true;
              _checkedSession[localFile] = true;
              if (changed) needRefresh.push({ file: localFile, meta: serverMeta });
              checkDone++;
              bump();
              tryProcessRefresh();
            };
            req.onerror = function() { needRefresh.push({ file: localFile, meta: serverMeta }); checkDone++; bump(); tryProcessRefresh(); };
          } catch(e) { needRefresh.push({ file: localFile, meta: serverMeta }); checkDone++; bump(); tryProcessRefresh(); }
        })(f, srvMeta);
      });
    });
    // 空列表兜底
    if (fileList.length === 0) finish();

    function processRefresh() {
      if (needRefresh.length === 0) { finish(); return; }
      var ri = 0, rr = 0;
      function doRefresh() {
        if (ri >= needRefresh.length) { if (rr <= 0) finish(); return; }
        if (rr >= CONCURRENT) return;
        var item = needRefresh[ri++]; rr++;
        // 通知 iframe 进度
        try { parent.postMessage({ type: 'tvbox-warm-progress', done: ri + checkDone, total: total }, '*'); } catch(e) {}
        loadFresh(item.file, function() { rr--; doRefresh(); }, timeout, item.meta);
      }
      for (var i = 0; i < CONCURRENT; i++) doRefresh();
    }
  }

  return { load: load, warm: warm, loadData: load, loadedSources: loaded };
})();

// ── 自动预热触发器 ──
// 隐藏 iframe 独立连接池运行，用 HEAD 请求逐文件检查 Last-Modified/Content-Length，仅刷新变化的文件
if (!window.__TVBOX_WARM_RUN) {
  window.__TVBOX_WARM_RUN = true;

  // 底部 1px 进度条
  var bar = document.createElement('div');
  bar.innerHTML = '<div style="position:fixed;bottom:0;left:0;right:0;z-index:99997;height:1px;background:transparent"><div class="tvbox-warm-fill" style="height:100%;width:0;background:rgba(0,0,0,0.8);transition:width .3s"></div></div>';
  document.body.appendChild(bar.firstElementChild);

  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'tvbox-warm-progress') return;
    var fill = document.querySelector('.tvbox-warm-fill');
    if (fill) fill.style.width = Math.floor(e.data.done / e.data.total * 100) + '%';
    if (e.data.done >= e.data.total) {
      setTimeout(function() {
        if (fill && fill.parentElement && fill.parentElement.parentNode) {
          fill.parentElement.parentNode.removeChild(fill.parentElement);
        }
      }, 500);
    }
  });

  setTimeout(function() {
    var iframe = document.createElement('iframe');
    iframe.src = '/js/sevencolor/tvbox-warm.html';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
  }, 3000);
}
