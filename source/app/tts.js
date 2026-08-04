/* ============================================================
 * tts.js — 讯飞在线语音合成朗读器（前端直连）
 * 功能：分段合成、顺序播放、连续朗读、底部固定栏第二行完整播放条
 * 密钥采用混淆存储，运行时解码（提高直接复制获取门槛）
 * v2.6 — 新增 onPlayState 播放状态钩子（播放/暂停/停止/外部中断时回调，
 *        页面据此记录"继续播放"恢复点：点击系统媒体卡片可跳回播放页位置）；
 * v2.5 — 完整播放条（▶ ⏹ 标题+进度 音色 语速）+ 首篇触发 onItemChange(0)
 * ============================================================ */
(function(){
  'use strict';
  console.log('[TTS] 朗读器 v2.6 已加载');

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

  /* ---------- 2. 发音人配置（默认叶子，新一代音库更自然；其余可切换） ---------- */
  var VOICES = [
    { key: 'x4_yezi', name: '叶子' },                 // 默认：新一代音库（更自然）
    { key: 'aisjiuxu', name: '许久(男)' },            // 男声
    { key: 'x4_ziwen_assist', name: '紫文' },         // 新一代音库（assist 口播风）
    { key: 'xiaoyan', name: '晓燕' }                  // 经典女声
  ];

  /* ---------- 3. 内部状态 ---------- */
  var state = {
    queue: [],        // [{text, title}] 待播列表
    cur: -1,          // 当前段索引
    curItem: -1,
    itemStart: [],
    voice: 0,
    speed: 40,        // 默认语速 0.8x（40/50）
    audio: null,
    audioEl: null,    // 持久复用的 Audio 元素（避免每次 new Audio 被自动播放策略拦截）
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
    card: null,       // 音乐播放卡片元素（朗读时显示）
    inited: false,
    mountEl: null,   // 控制条挂载容器（页面底部状态栏）
    provider: null,  // 页面提供朗读内容：fn() → {items, label} 或 items[]
    itemChangeCb: null,  // 朗读项切换回调：fn(itemIdx)（itemIdx=队列中第几篇，0 起）
    lastItem: -1,        // 上次播放的 item 索引（用于检测跨篇切换）
    label: '',           // 朗读来源标签（如"综合新闻"），用于媒体卡片/锁屏
    playStateCb: null    // 播放状态变化回调：fn({playing, paused})（供页面写"继续播放"恢复点）
  };

  // 播放状态变化广播：页面据此记录/清除"继续播放"恢复点（localStorage.resume_play）
  function emitPlayState(){
    if (state.playStateCb) {
      try { state.playStateCb({ playing: !!state.playing, paused: !!state.paused }); } catch(e){}
    }
  }

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
  // 计算当前所在篇目（item）索引；跨篇切换时触发页面回调（用于自动翻页）并更新媒体标题
  function advanceItem(){
    var ci = -1;
    for (var i = 0; i < state.itemStart.length; i++) {
      if (state.itemStart[i] <= state.cur) ci = i;
    }
    if (ci !== state.lastItem) {
      state.lastItem = ci;
      if (ci >= 0) {
        var t = state.queue[state.itemStart[ci]] ? state.queue[state.itemStart[ci]].title : '';
        syncMediaSession(true, t, state.label || '');
        notifyNative(true, t, state.label || '');
      }
      if (state.itemChangeCb && ci >= 0) {
        try { state.itemChangeCb(ci); } catch(e){}
      }
    }
    return ci;
  }

  function playSegment(idx){
    if (!state.queue.length) return;
    if (idx < 0 || idx >= state.queue.length) { finishAll(); return; }
    state.cur = idx;
    state.curItem = advanceItem();
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

  // 移动端 WebView 音频解锁：用户手势时调用，放开后续自动播放（连续播下一段不被拦截）
  var _audioUnlocked = false;
  function unlockAudio(){
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    // ① Web Audio API 解锁（iOS 有效）
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        var ctx = new AC();
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        if (ctx.state === 'suspended') { try{ ctx.resume(); }catch(e){} }
      }
    } catch(e) {}
    // ② HTMLAudioElement 静音播放解锁（Android WebView 有效）
    try {
      var silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      silent.muted = true;
      var pp = silent.play();
      if (pp && pp.catch) pp.catch(function(){});
    } catch(e) {}
  }

  // 获取持久复用的 Audio 元素：只创建一次，后续改 src 复用（多数 WebView 对重复 new Audio 每次都要手势）
  function getAudioEl(){
    if (!state.audioEl) {
      var a = new Audio();
      try { a.preload = 'auto'; } catch(e){}
      try { a.setAttribute('playsinline', ''); } catch(e){}
      try { a.setAttribute('webkit-playsinline', ''); } catch(e){}
      // 外部暂停（系统音频焦点被抢 / 来电 / WebView 切换页面等）→ 同步 UI，杜绝"假播放"
      a.addEventListener('pause', function(){
        if (state.playing && !state.paused) {
          state.playing = false;
          state.paused = true;
          updateUI();
          updateCard();
          syncMediaSession(false, '', '');
          notifyNative(false, '', '');
          emitPlayState();
        }
      });
      state.audioEl = a;
    }
    return state.audioEl;
  }

  function startAudio(url, idx, sid){
    var a = getAudioEl();
    state.audio = a;
    a.onended = null;
    a.onerror = null;
    a.ontimeupdate = null;
    // 释放旧 blob 资源（不 removeAttribute src，避免部分 WebView 重新赋值 src 后无声）
    try { if (a.src && a.src.indexOf('blob:') === 0) URL.revokeObjectURL(a.src); } catch(e){}
    a.src = url;
    try { a.load(); } catch(e){}
    // 进度：音乐卡片进度条 + 锁屏媒体进度
    a.ontimeupdate = function(){
      if (sid !== state.session) return;
      if (a.duration) {
        var prog = document.getElementById('ttsBarProg');
        if (prog) prog.style.width = Math.min(100, a.currentTime / a.duration * 100) + '%';
        if (navigator.mediaSession && navigator.mediaSession.setPositionState) {
          try { navigator.mediaSession.setPositionState({ duration: a.duration, position: a.currentTime || 0, playbackRate: 1 }); } catch(e){}
        }
      }
    };
    a.onended = function(){
      URL.revokeObjectURL(url);
      if (sid !== state.session) return; // 会话已失效（已被 stop/新 speak 接管）
      if (state.cur !== idx) return;
      var prog = document.getElementById('ttsBarProg');
      if (prog) prog.style.width = '0%';
      // 有预取且预取正是下一段 → 无缝衔接
      if (state.prefetched && state.prefetchedIdx === idx + 1) {
        var pu = state.prefetched;
        state.prefetched = null; state.prefetchedIdx = -1;
        state.cur++;
        state.curItem = advanceItem();
        updateUI();
        updateCard();
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
    updateUI();
    emitPlayState();
    // 播放：移动端自动播放可能被拦截 → 递增间隔重试 2 次；仍失败则暂停并提示（不假播放）
    function doPlay(attempt){
      if (sid !== state.session) return;
      var p;
      try { p = a.play(); } catch(e) { p = Promise.reject(e); }
      if (p && p.catch) p.catch(function(){
        if (attempt < 2) {
          setTimeout(function(){ if (sid === state.session) doPlay(attempt + 1); }, attempt === 0 ? 350 : 900);
        } else {
          if (sid !== state.session) return;
          showToast('自动播放被拦截，点 ▶ 继续');
          state.playing = false;
          updateUI();
        }
      });
    }
    doPlay(0);
  }

  function pauseResume(){
    var a = state.audioEl || state.audio;
    if (!a) return;
    if (state.paused) {
      var p;
      try { p = a.play(); } catch(e){ p = Promise.reject(e); }
      if (p && p.catch) p.catch(function(){});
      state.paused = false;
      emitPlayState();
    } else {
      state.paused = true;          // 先标记（外部 pause 监听据此跳过内部暂停）
      try { a.pause(); } catch(e){}
      emitPlayState();
    }
    updateUI();
  }

  function stop(){
    state.session++;                 // 使所有进行中回调失效
    // 关闭所有进行中的 WebSocket
    for (var k in state.activeWs) { try{ state.activeWs[k].close(); }catch(e){} }
    state.activeWs = {};
    state.playing = false; state.paused = false;   // 先复位（外部 pause 监听据此跳过内部暂停）
    // 暂停持久音频元素（复用不销毁）；释放 blob 资源但不清空 src（避免重新赋值 src 后无声）
    if (state.audioEl) {
      try {
        var cs = state.audioEl.src;
        state.audioEl.pause();
        state.audioEl.onended = null;
        state.audioEl.onerror = null;
        state.audioEl.ontimeupdate = null;
        if (cs && cs.indexOf('blob:') === 0) { try{ URL.revokeObjectURL(cs); }catch(e){} }
      } catch(e){}
    }
    state.audio = null;
    if (state.prefetched) { URL.revokeObjectURL(state.prefetched); state.prefetched = null; }
    state.prefetchedIdx = -1;
    state.playing = false; state.paused = false;
    state.queue = []; state.cur = -1; state.curItem = -1; state.itemStart = [];
    state.lastItem = -1;
    state.fetching = false;
    if (state.native) { try{ speechSynthesis.cancel(); }catch(e){} state.native = false; }
    // 播放条/锁屏/原生桥复位
    var prog = document.getElementById('ttsBarProg');
    if (prog) prog.style.width = '0%';
    syncMediaSession(false, '', '');
    notifyNative(false, '', '');
    updateUI();   // 控制条常驻，仅刷新为"已停止"
    emitPlayState();
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
    emitPlayState();
    var u = new SpeechSynthesisUtterance(state.queue[idx].text);
    u.lang = 'zh-CN';
    u.rate = state.speed / 50;
    var silentTimer = null;
    function done(){ if (silentTimer) clearTimeout(silentTimer); silentTimer = null; playSegment(state.cur + 1); }
    u.onend = done;
    u.onerror = done;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    // 静默兜底：8s 无结束回调 → 视为系统语音无声（部分设备无中文包），停止并提示
    silentTimer = setTimeout(function(){
      if (state.native && state.cur === idx) {
        showToast('系统语音不可用，请重试');
        stop();
      }
    }, 8000);
    updateUI();
  }

  /* ---------- 9. 控制条 UI（底部固定栏第二行，常驻完整播放条） ---------- */
  // 播放条结构：[▶ 播放/暂停] [⏹ 停止] [标题+进度条(弹性)] [音色] [语速]
  // 页面把 #ttsBarMount 放到底部固定栏第二行并 TTS.mount 挂载；未指定时挂 body 底部
  function injectBarStyle(){
    if (document.getElementById('ttsBarStyle')) return;
    var css =
      '#ttsBar{display:flex;align-items:center;gap:2px;height:42px;flex-shrink:0;user-select:none;-webkit-user-select:none;padding:0 8px;font-size:12px;color:#555;width:100%;box-sizing:border-box}' +
      '#ttsBar button{background:none;border:none;cursor:pointer;color:inherit;padding:0;margin:0;font-family:inherit}' +
      '#ttsBar .tts-btn{display:flex;align-items:center;justify-content:center;height:30px;border-radius:6px;flex-shrink:0;line-height:1}' +
      '#ttsBar .tts-btn:active{background:rgba(128,128,128,.18)}' +
      '#ttsBar .tts-play{width:34px;font-size:16px;color:var(--tts-accent,#ff8c00)}' +
      '#ttsBar .tts-stop{width:28px;font-size:13px;color:#999}' +
      '#ttsBar .tts-info{flex:1;min-width:0;padding:0 6px;display:flex;flex-direction:column;justify-content:center;gap:3px}' +
      '#ttsBar .tts-title{font-size:12px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}' +
      '#ttsBar .tts-prog{height:3px;background:rgba(128,128,128,.18);border-radius:2px;overflow:hidden}' +
      '#ttsBar .tts-prog i{display:block;height:100%;width:0%;background:var(--tts-accent,#ff8c00);border-radius:2px;transition:width .3s}' +
      '#ttsBar .tts-tag{height:24px;padding:0 8px;font-size:11px;border-radius:12px;flex-shrink:0;color:#555}' +
      '#ttsBar .tts-tag:active{background:rgba(128,128,128,.18)}' +
      '[data-theme="dark"] #ttsBar{color:#aaa}' +
      '[data-theme="dark"] #ttsBar .tts-title{color:#ddd}' +
      '[data-theme="dark"] #ttsBar .tts-tag{color:#bbb}' +
      '@media(prefers-color-scheme:dark){#ttsBar{color:#aaa}#ttsBar .tts-title{color:#ddd}#ttsBar .tts-tag{color:#bbb}}';
    var st = document.createElement('style');
    st.id = 'ttsBarStyle';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }
  function initBar(){
    if (state.inited && state.el) return;
    state.inited = true;
    injectBarStyle();
    var el = document.createElement('div');
    el.id = 'ttsBar';
    el.innerHTML =
      '<button class="tts-btn tts-play" data-act="play" title="播放/暂停朗读">▶</button>' +
      '<button class="tts-btn tts-stop" data-act="stop" title="停止">⏹</button>' +
      '<div class="tts-info">' +
        '<div class="tts-title" id="ttsBarTitle">语音朗读</div>' +
        '<div class="tts-prog"><i id="ttsBarProg"></i></div>' +
      '</div>' +
      '<button class="tts-tag" data-act="voice" id="ttsBarVoice" title="发音人（点按切换）">' + VOICES[state.voice].name + '</button>' +
      '<button class="tts-tag" data-act="speed" id="ttsBarSpeed" title="语速（点按切换）">' + (state.speed / 50).toFixed(1) + 'x</button>';
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
    setupMediaActions();
    updateUI();
  }

  // ---- 播放条标题更新（当前段标题；进度条由音频 timeupdate 驱动） ----
  function updateCard(){
    if (!state.el) return;
    var titleEl = document.getElementById('ttsBarTitle');
    if (!titleEl) return;
    var q = state.queue, idx = state.cur;
    var title = (idx >= 0 && q[idx]) ? (q[idx].title || '语音朗读') : '语音朗读';
    if (titleEl.textContent !== title) titleEl.textContent = title;
  }

  // ---- 锁屏/系统媒体卡片（MediaSession：通知栏与锁屏显示标题/封面/进度，支持系统媒体控制） ----
  function syncMediaSession(playing, title, sub){
    try {
      if (navigator.mediaSession && typeof MediaMetadata !== 'undefined') {
        if (playing) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: title || '语音朗读',
            artist: sub || '小红故事',
            album: '语音朗读',
            artwork: [{ src: './logo.png', sizes: '512x512' }]
          });
          navigator.mediaSession.playbackState = 'playing';
        } else {
          navigator.mediaSession.playbackState = title ? 'paused' : 'none';
        }
      }
    } catch(e){}
  }
  // 通知封装 App 原生（配合前台媒体服务实现真正的后台/锁屏播放；未注入桥时自动忽略）
  function notifyNative(playing, title, sub){
    try {
      if (window.AudioBridge) {
        if (typeof window.AudioBridge.setPlaying === 'function') window.AudioBridge.setPlaying(playing ? '1' : '0');
        if (typeof window.AudioBridge.setMeta === 'function') {
          window.AudioBridge.setMeta(title || '语音朗读', sub || '小红故事', '', '0', '0', playing ? '1' : '0');
        }
      }
    } catch(e){}
  }
  // MediaSession 系统媒体控制按钮（锁屏/通知栏）
  function setupMediaActions(){
    try {
      if (!navigator.mediaSession) return;
      var actions = {
        play: function(){ if (!state.playing) { state.paused = false; var a = state.audioEl || state.audio; if (a) { var p; try{ p = a.play(); }catch(e){ p = Promise.reject(e); } if (p && p.catch) p.catch(function(){}); } updateUI(); updateCard(); } },
        pause: function(){ if (state.playing) { try{ var a = state.audioEl || state.audio; if (a) a.pause(); }catch(e){} state.paused = true; updateUI(); updateCard(); } },
        stop: function(){ stop(); },
        nexttrack: function(){ if (state.cur >= 0 && state.cur < state.queue.length - 1) playSegment(state.cur + 1); },
        previoustrack: function(){ if (state.cur > 0) playSegment(state.cur - 1); }
      };
      for (var k in actions) {
        try { navigator.mediaSession.setActionHandler(k, actions[k]); } catch(e){}
      }
    } catch(e){}
  }

  // 控制条动作处理（播放/停止/语速/发音人）
  function handleAct(act){
    if (!state.el) return;
    if (act === 'play') {
      unlockAudio();   // 用户手势：解锁移动端自动播放限制（保证连续播下一段不被拦截）
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
        var pa = state.audioEl || state.audio;
        if (pa) { var pp; try{ pp = pa.play(); }catch(e){ pp = Promise.reject(e); } if (pp && pp.catch) pp.catch(function(){}); updateUI(); }
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
    updateCard();
    showToast('语速 ' + (state.speed / 50).toFixed(1) + 'x（下一段生效）');
  }

  function cycleVoice(){
    state.voice = (state.voice + 1) % VOICES.length;
    var btn = state.el.querySelector('[data-act="voice"]');
    if (btn) btn.textContent = VOICES[state.voice].name;
    updateCard();
    showToast('发音人：' + VOICES[state.voice].name + '（下一段生效）');
  }

  function updateUI(){
    if (!state.el) return;
    var playBtn = state.el.querySelector('[data-act="play"]');
    if (playBtn) playBtn.textContent = (state.playing && !state.paused) ? '⏸' : '▶';
    var v = state.el.querySelector('[data-act="voice"]');
    if (v) v.textContent = VOICES[state.voice].name;
    var sp = state.el.querySelector('[data-act="speed"]');
    if (sp) sp.textContent = (state.speed / 50).toFixed(1) + 'x';
    updateCard();   // 播放条标题同步（当前段标题）
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
    version: 'v2.6',   // v2.6：新增 onPlayState 播放状态钩子（供页面记录"继续播放"恢复点）
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
    // 设置朗读跨篇切换回调：fn(itemIdx)——itemIdx 为朗读队列中的第几篇（0 起）。
    // 首篇（0）与每次跨篇切换都会触发；页面可据此自动翻页/展开/高亮，
    // 保持"看到的=听到的"
    onItemChange: function(fn){
      state.itemChangeCb = fn;
    },
    // 设置播放状态变化回调：fn({playing, paused})——播放开始/暂停/停止/外部中断时触发。
    // 页面据此记录或清除"继续播放"恢复点（点击系统媒体卡片回到播放页）
    onPlayState: function(fn){
      state.playStateCb = fn;
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
      state.lastItem = 0;   // 首篇即当前页；跨篇切换由 advanceItem 触发回调
      state.label = opts.title || '';
      // 首篇也通知页面（itemIdx=0）：用于展开/高亮第一条，修复"第一篇不展开"
      if (state.itemChangeCb) { try { state.itemChangeCb(0); } catch(e){} }
      // 诊断日志：确认发送给讯飞的文本是否正确
      console.log('[TTS] speak 队列 ' + queue.length + ' 段');
      for (var di = 0; di < Math.min(queue.length, 3); di++) {
        console.log('[TTS] 段' + (di + 1) + ': ' + queue[di].text.slice(0, 50));
      }
      initBar();
      showBar();
      updateUI();
      updateCard();
      // 锁屏/后台媒体卡片 + 原生桥通知
      syncMediaSession(true, (items[0] && items[0].title) || '', opts.title || '');
      notifyNative(true, (items[0] && items[0].title) || '', opts.title || '');
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
