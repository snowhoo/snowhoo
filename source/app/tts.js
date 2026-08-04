/* ============================================================
 * tts.js — 讯飞在线语音合成朗读器（前端直连）
 * 功能：分段合成、顺序播放、连续朗读、底部状态栏内嵌控制条
 * 密钥采用混淆存储，运行时解码（提高直接复制获取门槛）
 * v2.4 — business 补 tte:'utf8'+sfl:1（修复中文乱码）；默认男声；
 *        控制条内嵌底部状态栏；分段调小加速加载；移除调试面板
 * ============================================================ */
(function(){
  'use strict';
  console.log('[TTS] 朗读器 v2.4 已加载');

  /* ---------- 1. 密钥配置（混淆存储，运行解码） ---------- */
  var TTS_KEY = {
    appid: 'TEVvd0tGSXo=',
    apikey: 'dXd7eHt7fHl6SEt8RUxGeHZLTEtId0h6fG9ISEVMdUs=',
    apisecret: 'EC0YfCE9IUAhRBAvIUQkLSF1GT4QGiFEIRsZPxAtPz0='
  };

  function _deobf(s){
    if (!s) return '';
    try {
      var t = b64Decode(s);   // 手写 base64 解码 → 字节数组
      var out = '';
      for (var i = 0; i < t.length; i++) out += String.fromCharCode((t[i] - 13) ^ 0x5A);
      return decodeURIComponent(escape(out));
    } catch(e){ return ''; }
  }

  /* ---------- 2. 发音人配置（男声在前，默认男声） ---------- */
  var VOICES = [
    { key: 'aisjiuxu', name: '许久' },                  // 男声（默认）
    { key: 'xiaoyan',  name: '晓燕' },
    { key: 'x4_lingxiaoxuan_oral', name: '凌晓萱' }
  ];

  /* ---------- 3. 内部状态 ---------- */
  var state = {
    queue: [],        // [{text, title}] 待播列表
    cur: -1,          // 当前段索引
    curItem: -1,
    itemStart: [],
    voice: 0,
    speed: 50,
    audio: null,
    playing: false,
    paused: false,
    fetching: false,  // 当前段合成/预取进行中
    prefetched: null, // 预取音频 URL
    prefetchedIdx: -1,
    session: 0,       // 会话令牌：每次 speak/stop 递增，用于丢弃过期回调
    activeWs: {},     // 进行中的 WebSocket（id → ws），stop 时全部关闭
    wsSeq: 0,
    native: false,
    el: null,
    inited: false,
    mountEl: null,   // 控制条挂载容器（页面底部状态栏）
    provider: null   // 页面提供朗读内容：fn() → {items, label} 或 items[]
  };

  /* ---------- 4. 编码工具（纯手写，不依赖 TextEncoder/btoa/atob，兼容任意 WebView） ---------- */
  // 手写 UTF-8 编码：字符串 → 字节数组
  function utf8Bytes(str){
    var b = [], i = 0;
    while (i < str.length) {
      var c = str.charCodeAt(i);
      if (c < 0x80) { b.push(c); i++; }
      else if (c < 0x800) { b.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); i++; }
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 < 0xe000) {
          var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          b.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); i += 2;
        } else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); i++; }
      } else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); i++; }
    }
    return b;
  }

  var B64CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // 手写 base64 编码：字节数组 → base64 字符串
  function b64Encode(bytes){
    var out = '', i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i+1] << 8) | bytes[i+2];
      out += B64CHARS[(n >> 18) & 63] + B64CHARS[(n >> 12) & 63] + B64CHARS[(n >> 6) & 63] + B64CHARS[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) {
      var n1 = bytes[i] << 16;
      out += B64CHARS[(n1 >> 18) & 63] + B64CHARS[(n1 >> 12) & 63] + '==';
    } else if (rem === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i+1] << 8);
      out += B64CHARS[(n2 >> 18) & 63] + B64CHARS[(n2 >> 12) & 63] + B64CHARS[(n2 >> 6) & 63] + '=';
    }
    return out;
  }
  // 手写 base64 解码：base64 字符串 → 字节数组（自动跳过空白与 %XX）
  function b64Decode(b64str){
    var s = String(b64str);
    if (s.indexOf('%') !== -1) { try { s = decodeURIComponent(s); } catch(e){} }
    s = s.replace(/[\r\n\s]/g, '');
    var bytes = [], i = 0;
    for (; i < s.length; i += 4) {
      var c1 = B64CHARS.indexOf(s[i]);
      var c2 = B64CHARS.indexOf(s[i+1]);
      var c3 = B64CHARS.indexOf(s[i+2]);
      var c4 = B64CHARS.indexOf(s[i+3]);
      if (c1 < 0 || c2 < 0) break;
      var n = (c1 << 18) | (c2 << 12);
      if (c3 >= 0) n |= (c3 << 6);
      if (c4 >= 0) n |= c4;
      bytes.push((n >> 16) & 255);
      if (c3 >= 0) bytes.push((n >> 8) & 255);
      if (c4 >= 0) bytes.push(n & 255);
    }
    return bytes;
  }

  // 通用 base64（字符串 → base64；或字节数组 → base64）
  function b64(input){
    if (typeof input === 'string') return b64Encode(utf8Bytes(input));
    var arr = [];
    for (var i = 0; i < input.length; i++) arr.push(input[i]);
    return b64Encode(arr);
  }

  // 纯 JS HMAC-SHA256 → base64
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
    return b64Encode(outer);   // 手写 base64，不依赖 btoa
  }

  function buildWsUrl(){
    if (typeof WebSocket === 'undefined') throw new Error('环境不支持 WebSocket');
    var host = 'tts-api.xfyun.cn';
    var path = '/v2/tts';
    var date = new Date().toUTCString();
    var signatureOrigin = 'host: ' + host + '\ndate: ' + date + '\nGET ' + path + ' HTTP/1.1';
    var signature = jsHmacSha256B64(_deobf(TTS_KEY.apisecret), signatureOrigin);
    var authorizationOrigin = 'hmac username="' + _deobf(TTS_KEY.apikey) + '", algorithm="hmac-sha256", headers="host date request-line", signature="' + signature + '"';
    var authorization = b64(authorizationOrigin);
    return 'wss://' + host + path +
      '?authorization=' + encodeURIComponent(authorization) +
      '&date=' + encodeURIComponent(date) +
      '&host=' + encodeURIComponent(host);
  }

  /* ---------- 5. 单段文本合成（WebSocket 流式，连接受管理） ---------- */
  function synth(text){
    return new Promise(function(resolve, reject){
      var url;
      try { url = buildWsUrl(); } catch(e) { reject(e); return; }
      var ws = new WebSocket(url);
      var wsId = ++state.wsSeq;
      state.activeWs[wsId] = ws;
      var audioB64 = '';
      var settled = false;

      function cleanup(){
        if (state.activeWs[wsId]) delete state.activeWs[wsId];
        try { ws.close(); } catch(e){}
      }

      var timeout = setTimeout(function(){
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('合成超时'));
      }, 20000);

      ws.onopen = function(){
        ws.send(JSON.stringify({
          common: { app_id: _deobf(TTS_KEY.appid) },
          business: {
            aue: 'lame',
            sfl: 1,                       // 文档要求：aue=lame 时需传 sfl=1（流式 mp3）
            tte: 'utf8',                  // 文本编码格式：必须是 utf8（与 base64 文本编码一致，否则按 GBK 解读 → 中文乱码）
            auf: 'audio/L16;rate=16000',
            vcn: VOICES[state.voice].key,
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
          if (!settled) { settled = true; clearTimeout(timeout); cleanup(); }
          reject(new Error('讯飞 ' + j.code + ' ' + (j.message || '')));
          return;
        }
        if (j.data && j.data.audio) audioB64 += j.data.audio;
        if (j.data && j.data.status === 2) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          cleanup();
          if (!audioB64) { reject(new Error('无音频返回')); return; }
          var audioBytes = b64Decode(audioB64);   // 手写 base64 解码（内部处理 %XX 与空白）
          var arr = new Uint8Array(audioBytes.length);
          for (var i = 0; i < audioBytes.length; i++) arr[i] = audioBytes[i];
          resolve(URL.createObjectURL(new Blob([arr], { type: 'audio/mp3' })));
        }
      };
      ws.onerror = function(){
        if (!settled) { settled = true; clearTimeout(timeout); cleanup(); }
        reject(new Error('WebSocket 连接失败'));
      };
      ws.onclose = function(){
        if (!settled) { settled = true; clearTimeout(timeout); cleanup(); reject(new Error('连接已关闭')); }
      };
    });
  }

  /* ---------- 6. 文本智能分段（兼容无 lookbehind 的 WebView） ---------- */
  // 单次合成上限：讯飞实测 800字(1872字节) 7s 成功、1300字 超时(10222)。
  // 每段 ≤ 500 字节（约 160 汉字）：优先按文章自然段落分段（短段落不拆），
  // 长段落按句再拆，保证单段合成快速返回、加载更快。
  var SEG_MAX = 500;

  function utf8Len(s){ return utf8Bytes(s).length; }

  function splitText(text){
    var segs = [];
    if (!text) return segs;
    var paras = text.split(/\n{2,}/);
    for (var p = 0; p < paras.length; p++) {
      var para = paras[p].replace(/\s+/g, ' ').trim();
      if (!para) continue;
      if (utf8Len(para) > SEG_MAX) {
        // 按句子拆（带捕获组保留标点），兼容不支持 lookbehind 的老 WebView
        var parts = para.split(/([。！？!?；;])/);
        var sentences = [];
        for (var k = 0; k < parts.length; k += 2) {
          sentences.push((parts[k] || '') + (parts[k+1] || ''));
        }
        var buf = '';
        for (var s = 0; s < sentences.length; s++) {
          var sn = sentences[s].trim();
          if (!sn) continue;
          if (utf8Len(buf + sn) > SEG_MAX) {
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
    var final = [];
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i];
      while (utf8Len(seg) > SEG_MAX) {
        var cut = Math.floor(seg.length * 0.9);
        while (cut > 0 && utf8Len(seg.slice(0, cut)) > SEG_MAX) cut--;
        final.push(seg.slice(0, cut));
        seg = seg.slice(cut);
      }
      if (seg) final.push(seg);
    }
    return final;
  }

  /* ---------- 7. 播放控制（会话令牌防错乱） ---------- */
  function playSegment(idx){
    if (!state.queue.length) return;
    if (idx < 0 || idx >= state.queue.length) { finishAll(); return; }
    state.cur = idx;
    state.curItem = -1;
    for (var i = 0; i < state.itemStart.length; i++) {
      if (state.itemStart[i] <= idx) state.curItem = i;
    }
    updateUI();
    if (state.fetching) return; // 正在合成/预取中，忽略重复请求
    fetchAndPlay(idx);
  }

  function fetchAndPlay(idx){
    var sid = state.session;
    state.fetching = true;
    // 合成当前段
    synth(state.queue[idx].text).then(function(url){
      if (sid !== state.session) { URL.revokeObjectURL(url); return; } // 会话已失效，丢弃
      if (state.cur !== idx) { URL.revokeObjectURL(url); state.fetching = false; return; }
      // 预取下一段（绑定会话与索引，防错乱）
      if (idx + 1 < state.queue.length) {
        var nextIdx = idx + 1;
        synth(state.queue[nextIdx].text).then(function(u){
          if (sid !== state.session) { URL.revokeObjectURL(u); return; }
          state.prefetched = u;
          state.prefetchedIdx = nextIdx;
        }).catch(function(){});
      }
      startAudio(url, idx, sid);
    }).catch(function(e){
      if (sid !== state.session) return; // 过期失败不处理
      state.fetching = false;
      console.warn('[TTS] 合成失败:', e);
      showToast('语音合成失败');
      fallbackNative(idx, '讯飞合成失败：' + (e && e.message ? e.message : e));
    });
  }

  function startAudio(url, idx, sid){
    if (state.audio) { try{ state.audio.pause(); state.audio.onended = null; }catch(e){} state.audio = null; }
    var a = new Audio(url);
    state.audio = a;
    a.onended = function(){
      URL.revokeObjectURL(url);
      if (sid !== state.session) return; // 会话已失效（已被 stop/新 speak 接管）
      if (state.cur !== idx) return;
      // 有预取且预取正是下一段 → 无缝衔接
      if (state.prefetched && state.prefetchedIdx === idx + 1) {
        var pu = state.prefetched;
        state.prefetched = null; state.prefetchedIdx = -1;
        state.cur++;
        updateUI();
        startAudio(pu, state.cur, sid);
        return;
      }
      state.fetching = false;
      playSegment(state.cur + 1); // 自动播下一段
    };
    a.onerror = function(){
      URL.revokeObjectURL(url);
      if (sid !== state.session) return;
      if (state.cur !== idx) return;
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
    state.session++;                 // 使所有进行中回调失效
    // 关闭所有进行中的 WebSocket
    for (var k in state.activeWs) { try{ state.activeWs[k].close(); }catch(e){} }
    state.activeWs = {};
    if (state.audio) { try{ state.audio.pause(); state.audio.onended = null; }catch(e){} state.audio = null; }
    if (state.prefetched) { URL.revokeObjectURL(state.prefetched); state.prefetched = null; }
    state.prefetchedIdx = -1;
    state.playing = false; state.paused = false;
    state.queue = []; state.cur = -1; state.curItem = -1; state.itemStart = [];
    state.fetching = false;
    if (state.native) { try{ speechSynthesis.cancel(); }catch(e){} state.native = false; }
    updateUI();   // 控制条常驻，仅刷新为"已停止"
  }

  function finishAll(){ stop(); }

  /* ---------- 8. 系统 TTS 降级 ---------- */
  function fallbackNative(idx, reason){
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] 降级失败, 无 speechSynthesis. 原因:', reason || '未知');
      showToast('朗读不可用：' + (reason || '当前环境不支持语音朗读'));
      stop();
      return;
    }
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

  /* ---------- 9. 控制条 UI（内嵌底部状态栏，常驻） ---------- */
  // 页面调用 TTS.mount(container) 把朗读控件挂到底部状态栏；未指定时挂 body 底部
  function initBar(){
    if (state.inited && state.el) return;
    state.inited = true;
    var el = document.createElement('div');
    el.id = 'ttsBar';
    el.style.cssText = 'display:flex;align-items:center;gap:2px;height:44px;flex-shrink:0;user-select:none;-webkit-user-select:none';
    el.innerHTML =
      '<button data-act="play" title="播放/暂停朗读" style="background:none;border:none;cursor:pointer;color:var(--tts-accent,#ff8c00);font-size:17px;line-height:1;padding:0 6px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0">▶</button>' +
      '<button data-act="stop" title="停止" style="background:none;border:none;cursor:pointer;color:#999;font-size:14px;line-height:1;padding:0 5px;height:34px;display:flex;align-items:center;justify-content:center;flex-shrink:0">⏹</button>' +
      '<button data-act="voice" title="发音人（点按切换）" style="background:none;border:none;cursor:pointer;color:var(--tts-accent,#a5d6ff);font-size:12px;padding:0 4px;height:34px;white-space:nowrap;flex-shrink:0">' + VOICES[state.voice].name + '</button>' +
      '<button data-act="speed" title="语速（点按切换）" style="background:none;border:none;cursor:pointer;color:var(--tts-accent,#ffb74d);font-size:12px;padding:0 4px;height:34px;white-space:nowrap;flex-shrink:0">1.0x</button>';
    var container = state.mountEl || document.body;
    container.appendChild(el);
    state.el = el;

    // 按钮直接绑定（不依赖 closest 事件委托，兼容老 WebView）
    var acts = el.querySelectorAll('[data-act]');
    for (var ai = 0; ai < acts.length; ai++) {
      (function(btn){
        btn.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          handleAct(btn.getAttribute('data-act'));
        });
      })(acts[ai]);
    }
  }

  // 控制条动作处理（播放/停止/语速/发音人）
  function handleAct(act){
    if (!state.el) return;
    if (act === 'play') {
      // 无队列（未开始朗读）→ 调用页面提供的内容函数启动朗读
      if (!state.queue.length) {
        if (state.provider) {
          var r, items = null;
          try { r = state.provider(); } catch(err) {
            showToast('朗读内容获取失败：' + (err && err.message ? err.message : err));
            return;
          }
          items = (r && r.items) ? r.items : r;
          if (!items || !items.length) { showToast('没有可朗读的文本'); return; }
          window.TTS.speak(items, { title: (r && r.label) || '' });
        } else {
          showToast('朗读内容未配置');
        }
        return;
      }
      if (state.playing) pauseResume();
      else if (state.cur >= 0) {
        state.paused = false;
        if (state.audio) { state.audio.play().catch(function(){}); updateUI(); }
        else playSegment(state.cur);
      }
    }
    else if (act === 'stop') stop();
    else if (act === 'speed') cycleSpeed();
    else if (act === 'voice') cycleVoice();
  }

  function showBar(){ if (state.el) state.el.style.display = 'flex'; }
  function hideBar(){ if (state.el) state.el.style.display = 'none'; }

  function cycleSpeed(){
    var speeds = [40, 50, 60];
    var idx = speeds.indexOf(state.speed);
    state.speed = speeds[(idx + 1) % speeds.length];
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
  window.TTS = {
    version: 'v2.4',   // 版本号：v2.4 修复 tte 编码（中文乱码）并内嵌底部状态栏
    // 把朗读控制条挂载到指定容器（页面底部状态栏）；容器缺省挂 body
    mount: function(container){
      if (container) state.mountEl = container;
      initBar();
      showBar();
    },
    // 设置朗读内容提供函数：fn() → {items:[{title,text}], label} 或 [{title,text}]
    // 点播放按钮但未开始朗读时调用（由页面传入"构建当前文章/栏目"逻辑）
    setProvider: function(fn){
      state.provider = fn;
    },
    speak: function(items, opts){
      if (!items || !items.length) return;
      stop();                 // 关闭旧会话（连接/音频/回调全部作废）
      state.session++;        // 开启新会话
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
      // 诊断日志：确认发送给讯飞的文本是否正确
      console.log('[TTS] speak 队列 ' + queue.length + ' 段');
      for (var di = 0; di < Math.min(queue.length, 3); di++) {
        console.log('[TTS] 段' + (di + 1) + ': ' + queue[di].text.slice(0, 50));
      }
      initBar();
      showBar();
      updateUI();
      if (!_deobf(TTS_KEY.appid) || !_deobf(TTS_KEY.apikey) || !_deobf(TTS_KEY.apisecret)) {
        showToast('讯飞未配置，使用系统语音');
        fallbackNative(0, '讯飞密钥未配置');
        return;
      }
      fetchAndPlay(0);
    },
    stop: stop,
    pause: pauseResume,
    isSpeaking: function(){ return state.playing; }
  };
})();
