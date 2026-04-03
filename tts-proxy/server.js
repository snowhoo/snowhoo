const http = require('http');
const url = require('url');
const path = require('path');
const say = require('./node_modules/say');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const PORT = 3001;
const VOICE = 'Microsoft Huihui Desktop';
const TEMP_DIR = os.tmpdir();

const MIME = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

// Generate unique ID for this request
function uid() {
  return crypto.randomBytes(8).toString('hex');
}

// Parse query string (Node.js built-in)
function parseQuery(qs) {
  const params = {};
  if (!qs) return params;
  qs.split('&').forEach(pair => {
    const [k, v] = pair.split('=').map(decodeURIComponent);
    if (k) params[k] = v || '';
  });
  return params;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // TTS endpoint: /tts?text=xxx
  if (pathname === '/tts') {
    const { text } = parsedUrl.query;
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('text parameter required');
      return;
    }

    // Limit text length to prevent abuse (max 2000 chars)
    const safeText = String(text).slice(0, 2000);
    const filename = path.join(TEMP_DIR, `tts_${uid()}.wav`);
    const mp3name = path.join(TEMP_DIR, `tts_${uid()}.mp3`);

    try {
      // Generate WAV using say (SAPI on Windows)
      await new Promise((resolve, reject) => {
        say.export(safeText, VOICE, 1.0, filename, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Check file exists and size
      const stats = fs.statSync(filename);
      if (stats.size < 1000) {
        throw new Error('Generated audio too small - TTS may have failed');
      }

      // Read and return WAV directly
      const wavData = fs.readFileSync(filename);

      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': wavData.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      res.end(wavData);

      // Cleanup
      try { fs.unlinkSync(filename); } catch(e) {}
      return;

    } catch (err) {
      console.error('TTS error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('TTS error: ' + err.message);
      try { fs.unlinkSync(filename); } catch(e) {}
      return;
    }
  }

  // Voices endpoint: /voices
  if (pathname === '/voices') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify([{ name: VOICE, locale: 'zh-CN', gender: 'Female' }]));
    return;
  }

  // Not found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TTS server running on http://0.0.0.0:${PORT}`);
  console.log(`Voice: ${VOICE}`);
  console.log(`Usage: http://<server>:${PORT}/tts?text=床前明月光`);
});
