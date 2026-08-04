/* ============================================================
 * tts.js — 讯飞在线语音合成朗读器（前端直连）
 * 功能：分段合成、顺序播放、连续朗读、底部悬浮控制条
 * 密钥采用混淆存储，运行时解码（提高直接复制获取门槛）
 * v2.1 — WebSocket 协议 + 纯 JS HMAC-SHA256（http/https 均可用）
 * ============================================================ */
(function(){
  'use strict';
  console.log('[TTS] 朗读器 v2.1 已加载');

  /* ---------- 1. 密钥配置（混淆存储，运行解码） ---------- */
  // 混淆规则：btoa( utf8( 每字符码 ^ 0x5A 后+13 ) )
  // 生成方式见下方工具函数 _obfuscate（部署时用 node 生成后填入）
  var TTS_KEY = {
    appid: 'TEVvd0tGSXo=',        // 填入混淆后的 AppID
    apikey: 'dXd7eHt7fHl6SEt8RUxGeHZLTEtId0h6fG9ISEVMdUs=',       // 填入混淆后的 APIKey
    apisecret: 'EC0YfCE9IUAhRBAvIUQkLSF1GT4QGiFEIRsZPxAtPz0='     // 填入混淆后的 APISecret
  };

  function _deobf(s){
    if (!s) return '';
    try {
      var t = atob(s);
      var out = '';
      for (var i = 0; i < t.length; i++) out += String.fromCharCode((t.charCodeAt(i) - 13) ^ 0x5A);
      return decodeURIComponent(escape(out));
    } catch(e){ return ''; }
  }

  // 生成混淆串的工具（部署时在 node 中运行，把结果填入 TTS_KEY）
  // function _obfuscate(str){
  //   var t = '';
  //   for (var i = 0; i < str.length; i++) t += String.fromCharCode((str.charCodeAt(i) ^ 0x5A) + 13);
  //   return btoa(t);
  // }

  /* ---------- 2. 发音人配置 ---------- */
  var VOICES = [
    { key: 'xiaoyan',  name: '晓燕' },
    { key: 'aisjiuxu', name: '许久' },
    { key: 'x4_lingxiaoxuan_oral', name: '凌晓萱' }
  ];

  /* ---------- 3. 内部状态 ---------- */
  var state = {
    queue: [],        // [{text, title}] 待播列表（支持连续朗读）
    cur: -1,          // 当前段索引
    curItem: -1,      // 当前"条"索引（一篇文章/新闻为一条，可拆多段）
    itemStart: [],    // 每条在队列中的起始段索引
    voice: 0,         // 发音人索引
    speed: 50,        // 讯飞语速 0-100（UI 显示 0.8/1.0/1.2）
    audio: null,      // 当前 Audio
    playing: false,
    paused: false,
    fetching: false,  // 正在预取下一段
    el: null,         // 控制条根元素
    inited: false
  };

  /* ---------- 4. 讯飞鉴权（WebSocket 握手，纯 JS HMAC-SHA256，兼容 http/file 环境） ---------- */
  function b64(input){
    // 支持字符串 / Uint8Array
    if (typeof input === 'string') {
      var bytes = new TextEncoder().encode(input);
      var bin = '';
      bytes.forEach(function(b){ bin += String.fromCharCode(b); });
      return btoa(bin);
    }
    var bin2 = '';
    input.forEach(function(b){ bin2 += String.fromCharCode(b); });
    return btoa(bin2);
  }

  // 纯 JS HMAC-SHA256 → base64（不依赖 crypto.subtle，HTTPS 非必需）
  function jsHmacSha256B64(secretStr, msgStr){
    function toBytes(s){
      var b = [], i = 0;
      while (i < s.length) {
        var c = s.charCodeAt(i);
        if (c < 0x80) { b.push(c); i++; }
        else if (c < 0x800) { b.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); i++; }
        else if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
          var c2 = s.charCodeAt(i + 1);
          if (c2 >= 0xdc00 && c2 < 0xe000) {
            var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
            b.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); i += 2;
          } else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); i++; }
        } else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); i++; }
      }
      return b;
    }
    function sha256Bytes(bytes){
      var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
      var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
      var bitLen = bytes.length * 8;
      var msg = bytes.slice();
      msg.push(0x80);
      while (msg.length % 64 !== 56) msg.push(0);
      var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
      msg.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,(lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);
      function rotr(x, n){ return (x >>> n) | (x << (32 - n)); }
      for (var off = 0; off < msg.length; off += 64) {
        var w = new Array(64);
        for (var t = 0; t < 16; t++) w[t] = ((msg[off+t*4]<<24)|(msg[off+t*4+1]<<16)|(msg[off+t*4+2]<<8)|msg[off+t*4+3])>>>0;
        for (var t2 = 16; t2 < 64; t2++) {
          var s0 = rotr(w[t2-15],7) ^ rotr(w[t2-15],18) ^ (w[t2-15]>>>3);
          var s1 = rotr(w[t2-2],17) ^ rotr(w[t2-2],19) ^ (w[t2-2]>>>10);
          w[t2] = (w[t2-16] + s0 + w[t2-7] + s1) >>> 0;
        }
        var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
        for (var t3 = 0; t3 < 64; t3++) {
          var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
          var ch = (e & f) ^ (~e & g);
          var t1 = (h + S1 + ch + K[t3] + w[t3]) >>> 0;
          var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
          var maj = (a & b) ^ (a & c) ^ (b & c);
          var t2 = (S0 + maj) >>> 0;
          h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
        }
        H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
        H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
      }
      var out = [];
      for (var i = 0; i < 8; i++) out.push((H[i]>>>24)&255,(H[i]>>>16)&255,(H[i]>>>8)&255,H[i]&255);
      return out;
    }
    var keyBytes = toBytes(secretStr);
    if (keyBytes.length > 64) keyBytes = sha256Bytes(keyBytes);
    var ipad = [], opad = [];
    for (var i = 0; i < 64; i++) { ipad.push((i<keyBytes.length?keyBytes[i]:0)^0x36); opad.push((i<keyBytes.length?keyBytes[i]:0)^0x5c); }
    var inner = sha256Bytes(ipad.concat(toBytes(msgStr)));
    var outer = sha256Bytes(opad.concat(inner));
    var bin = '';
    for (var j = 0; j < outer.length; j++) bin += String.fromCharCode(outer[j]);
    return btoa(bin);
  }

  // 构造 WebSocket 连接 URL（鉴权参数拼在 URL 上：authorization / date / host）
  function buildWsUrl(){
    if (typeof WebSocket === 'undefined') throw new Error('环境不支持 WebSocket');
    var host = 'tts-api.xfyun.cn';
    var path = '/v2/tts';
    var date = new Date().toUTCString();
    // WebSocket 握手为 GET
    var signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
    var signature = jsHmacSha256B64(_deobf(TTS_KEY.apisecret), signatureOrigin);
    var authorizationOrigin = 'hmac username="' + _deobf(TTS_KEY.apikey) + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
    var authorization = b64(authorizationOrigin);
    return 'wss://' + host + path +
      '?authorization=' + encodeURIComponent(authorization) +
      '&date=' + encodeURIComponent(date) +
      '&host=' + encodeURIComponent(host);
  }

  /* ---------- 5. 单段文本合成（WebSocket 流式） ---------- */
  // 返回音频 blob URL；失败抛错
  function synth(text){
    return new Promise(function(resolve, reject){
      var url;
      try { url = buildWsUrl(); } catch(e) { reject(e); return; }
      var ws = new WebSocket(url);
      var audioB64 = '';
      var settled = false;
      var timeout = setTimeout(function(){
        if (settled) return;
        settled = true;
        try { ws.close(); } catch(e){}
        reject(new Error('合成超时'));
      }, 20000);

      ws.onopen = function(){
        ws.send(JSON.stringify({
          common: { app_id: _deobf(TTS_KEY.appid) },
          business: {
            aue: 'lame',                        // mp3
            auf: 'audio/L16;rate=16000',
            vcn: VOICES[state.voice].key,       // 发音人（v2 字段名是 vcn）
            speed: state.speed,
            volume: 50,
            pitch: 50
          },
          data: { status: 2, text: b64(text), encoding: 'utf8' }
        }));
      };
      ws.onmessage = function(ev){
        var j;
        try { j = JSON.parse(ev.data); } catch(e){ return; }
        if (j.code !== 0) {
          if (!settled) { settled = true; clearTimeout(timeout); try{ ws.close(); }catch(e){} }
          reject(new Error('讯飞 ' + j.code + ' ' + (j.message || '')));
          return;
        }
        if (j.data && j.data.audio) audioB64 += j.data.audio;
        if (j.data && j.data.status === 2) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try { ws.close(); } catch(e){}
          if (!audioB64) { reject(new Error('无音频返回')); return; }
          // 兼容响应中 base64 可能带换行/URL 编码
          if (audioB64.indexOf('%') !== -1) { try { audioB64 = decodeURIComponent(audioB64); } catch(e){} }
          audioB64 = audioB64.replace(/[\r\n\s]/g, '');
          var bin = atob(audioB64);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(URL.createObjectURL(new Blob([arr], { type: 'audio/mp3' })));
        }
      };
      ws.onerror = function(){
        if (!settled) { settled = true; clearTimeout(timeout); }
        reject(new Error('WebSocket 连接失败'));
      };
      ws.onclose = function(){
        // 正常结束由 status=2 分支 resolve/reject；此处兜底
        if (!settled) { settled = true; clearTimeout(timeout); reject(new Error('连接已关闭')); }
      };
    });
  }

  /* ---------- 6. 文本智能分段（每段 ≤ 7000 字节，留余量） ---------- */
  function utf8Len(s){ return new TextEncoder().encode(s).length; }

  function splitText(text){
    var segs = [];
    if (!text) return segs;
    // 1. 先按段落拆
    var paras = text.split(/\n{2,}/);
    for (var p = 0; p < paras.length; p++) {
      var para = paras[p].replace(/\s+/g, ' ').trim();
      if (!para) continue;
      // 2. 段落超长再按句子拆
      if (utf8Len(para) > 7000) {
        var sentences = para.split(/(?<=[。！？!?；;])/);
        var buf = '';
        for (var s = 0; s < sentences.length; s++) {
          var sn = sentences[s].trim();
          if (!sn) continue;
          if (utf8Len(buf + sn) > 7000) {
            if (buf) segs.push(buf);
            buf = sn;
          } else {
            buf += sn;
          }
        }
        if (buf) segs.push(buf);
      } else {
        segs.push(para);
      }
    }
    // 3. 单段超过 7000（极端长无标点）→ 硬切
    var final = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      while (utf8Len(seg) > 7000) {
        var cut = Math.floor(seg.length * 0.9);
        while (cut > 0 && utf8Len(seg.slice(0, cut)) > 7000) cut--;
        final.push(seg.slice(0, cut));
        seg = seg.slice(cut);
      }
      if (seg) final.push(seg);
    }
    return final;
  }

  /* ---------- 7. 播放控制 ---------- */
  function playSegment(idx){
    if (!state.queue.length) return;
    if (idx < 0 || idx >= state.queue.length) { finishAll(); return; }
    state.cur = idx;
    state.curItem = -1;
    for (var i = 0; i < state.itemStart.length; i++) {
      if (state.itemStart[i] <= idx) state.curItem = i;
    }
    updateUI();
    // 预取：当前段 + 下一段
    if (state.fetching) return; // 已有预取进行中
    fetchAndPlay(idx);
  }

  async function fetchAndPlay(idx){
    state.fetching = true;
    try {
      var url = await synth(state.queue[idx].text);
      if (state.cur !== idx) { // 播放过程中用户已切换
        URL.revokeObjectURL(url);
        state.fetching = false;
        return;
      }
      // 预取下一段
      var nextUrl = null;
      if (idx + 1 < state.queue.length) {
        synth(state.queue[idx + 1].text).then(function(u){
          state._prefetched = u;
        }).catch(function(){});
      }
      startAudio(url, idx);
    } catch(e) {
      console.warn('[TTS] 合成失败:', e);
      state.fetching = false;
      showToast('语音合成失败，已切换系统语音');
      fallbackNative(idx); // 讯飞失败降级系统 TTS
      return;
    }
  }

  function startAudio(url, idx){
    if (state.audio) { try{ state.audio.pause(); }catch(e){} state.audio = null; }
    var a = new Audio(url);
    state.audio = a;
    a.onended = function(){
      URL.revokeObjectURL(url);
      if (state._prefetched) {
        var pu = state._prefetched;
        state._prefetched = null;
        URL.revokeObjectURL(url);
        if (state.cur === idx) { state.cur++; updateUI(); startAudio(pu, state.cur); return; }
      }
      state.fetching = false;
      playSegment(state.cur + 1); // 自动播下一段（连续朗读）
    };
    a.onerror = function(){
      URL.revokeObjectURL(url);
      state.fetching = false;
      playSegment(state.cur + 1);
    };
    state.playing = true;
    state.paused = false;
    a.play().catch(function(){});
    updateUI();
  }

  function pauseResume(){
    if (!state.audio) return;
    if (state.paused) {
      state.audio.play().catch(function(){});
      state.paused = false;
    } else {
      state.audio.pause();
      state.paused = true;
    }
    updateUI();
  }

  function stop(){
    if (state.audio) { try{ state.audio.pause(); state.audio.onended = null; }catch(e){} state.audio = null; }
    if (state._prefetched) { URL.revokeObjectURL(state._prefetched); state._prefetched = null; }
    state.playing = false; state.paused = false;
    state.queue = []; state.cur = -1; state.curItem = -1; state.itemStart = [];
    state.fetching = false;
    if (state.native) { try{ speechSynthesis.cancel(); }catch(e){} state.native = false; }
    updateUI();
    hideBar();
  }

  function finishAll(){
    stop();
  }

  /* ---------- 8. 系统 TTS 降级（讯飞未配置/失败时） ---------- */
  function fallbackNative(idx){
    if (!('speechSynthesis' in window)) { showToast('当前环境不支持语音朗读'); stop(); return; }
    state.native = true;
    state.playing = true; state.paused = false;
    var u = new SpeechSynthesisUtterance(state.queue[idx].text);
    u.lang = 'zh-CN';
    u.rate = state.speed / 50;
    u.onend = function(){ playSegment(state.cur + 1); };
    u.onerror = function(){ playSegment(state.cur + 1); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    updateUI();
  }

  /* ---------- 9. 控制条 UI ---------- */
  function initBar(){
    if (state.inited) return;
    state.inited = true;
    var el = document.createElement('div');
    el.id = 'ttsBar';
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:52px;z-index:29990;display:none;justify-content:center;padding:0 12px;pointer-events:none;box-sizing:border-box';
    el.innerHTML =
      '<div style="pointer-events:auto;background:#1c1c1e;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:8px 14px;display:flex;align-items:center;gap:10px;max-width:100%;box-shadow:0 6px 24px rgba(0,0,0,.35)">' +
        '<button data-act="prev" style="background:none;border:none;color:#fff;font-size:14px;cursor:pointer;padding:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">⏮</button>' +
        '<button data-act="play" style="background:#ff8c00;border:none;border-radius:50%;color:#fff;font-size:15px;cursor:pointer;width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0">▶</button>' +
        '<button data-act="next" style="background:none;border:none;color:#fff;font-size:14px;cursor:pointer;padding:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">⏭</button>' +
        '<button data-act="stop" style="background:none;border:none;color:#fff;font-size:13px;cursor:pointer;padding:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center">⏹</button>' +
        '<span data-role="info" style="color:#ddd;font-size:12px;min-width:70px;text-align:center;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">准备朗读</span>' +
        '<button data-act="speed" style="background:none;border:none;color:#ffb74d;font-size:12px;cursor:pointer;padding:2px 6px;white-space:nowrap">1.0x</button>' +
        '<button data-act="voice" style="background:none;border:none;color:#a5d6ff;font-size:12px;cursor:pointer;padding:2px 6px;white-space:nowrap">晓燕</button>' +
        '<button data-act="close" style="background:none;border:none;color:#999;font-size:12px;cursor:pointer;padding:2px 6px">✕</button>' +
      '</div>';
    document.body.appendChild(el);
    state.el = el;

    el.addEventListener('click', function(e){
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'play') { if (state.playing) pauseResume(); else if (state.queue.length && state.cur >= 0) { state.paused = false; if(state.audio){ state.audio.play(); updateUI(); } } }
      else if (act === 'stop') stop();
      else if (act === 'prev') { if (state.cur > 0) playSegment(state.cur - 1); }
      else if (act === 'next') { if (state.cur < state.queue.length - 1) playSegment(state.cur + 1); }
      else if (act === 'speed') { cycleSpeed(); }
      else if (act === 'voice') { cycleVoice(); }
      else if (act === 'close') stop();
    });
  }

  function showBar(){ if (state.el) state.el.style.display = 'flex'; }
  function hideBar(){ if (state.el) state.el.style.display = 'none'; }

  function cycleSpeed(){
    var speeds = [40, 50, 60];
    var idx = speeds.indexOf(state.speed);
    state.speed = speeds[(idx + 1) % speeds.length];
    // 已合成音频不变，仅对后续段生效
    var btn = state.el.querySelector('[data-act="speed"]');
    if (btn) btn.textContent = (state.speed / 50).toFixed(1) + 'x';
    showToast('语速 ' + (state.speed / 50).toFixed(1) + 'x（下一段生效）');
  }

  function cycleVoice(){
    state.voice = (state.voice + 1) % VOICES.length;
    var btn = state.el.querySelector('[data-act="voice"]');
    if (btn) btn.textContent = VOICES[state.voice].name;
    showToast('发音人：' + VOICES[state.voice].name + '（下一段生效）');
  }

  function updateUI(){
    if (!state.el) return;
    var info = state.el.querySelector('[data-role="info"]');
    if (info) {
      var total = state.queue.length;
      var itemLabel = '';
      if (state.curItem >= 0 && state.itemStart.length > 1) {
        itemLabel = (state.curItem + 1) + '/' + state.itemStart.length + ' · ';
      }
      info.textContent = state.playing
        ? (itemLabel + (state.cur + 1) + '/' + total + (state.paused ? ' 已暂停' : ''))
        : '已停止';
    }
    var playBtn = state.el.querySelector('[data-act="play"]');
    if (playBtn) playBtn.textContent = (state.playing && !state.paused) ? '⏸' : '▶';
  }

  /* ---------- 10. 轻提示 ---------- */
  var _toastTimer = null;
  function showToast(msg){
    var t = document.getElementById('ttsToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ttsToast';
      t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:29999;background:rgba(0,0,0,.75);color:#fff;padding:6px 16px;border-radius:18px;font-size:12px;opacity:0;transition:opacity .3s;pointer-events:none;white-space:nowrap';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function(){ t.style.opacity = '0'; }, 1800);
  }

  /* ---------- 11. 对外 API ---------- */
  // speak(items, opts)：items = [{title, text}]（可多条，支持连续朗读）
  // opts.title 可选：当前朗读的栏目名
  window.TTS = {
    speak: function(items, opts){
      if (!items || !items.length) return;
      stop();
      opts = opts || {};
      var queue = [], itemStart = [];
      for (var i = 0; i < items.length; i++) {
        itemStart.push(queue.length);
        var segs = splitText(items[i].text || '');
        for (var j = 0; j < segs.length; j++) queue.push({ text: segs[j], title: items[i].title || '' });
      }
      if (!queue.length) { showToast('没有可朗读的文本'); return; }
      state.queue = queue;
      state.itemStart = itemStart;
      state.cur = 0;
      state.curItem = 0;
      initBar();
      showBar();
      updateUI();
      // 讯飞密钥未配置 → 直接系统 TTS
      if (!_deobf(TTS_KEY.appid) || !_deobf(TTS_KEY.apikey) || !_deobf(TTS_KEY.apisecret)) {
        showToast('讯飞未配置，使用系统语音');
        fallbackNative(0);
        return;
      }
      fetchAndPlay(0);
    },
    stop: stop,
    pause: pauseResume,
    isSpeaking: function(){ return state.playing; }
  };
})();
