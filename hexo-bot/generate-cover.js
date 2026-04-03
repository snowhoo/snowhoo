const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'source', 'images', 'hotnews-cover.jpg');
const imagesDir = path.dirname(outputPath);
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

// SVG 封面图：深红渐变背景 + 白色文字，两行标题
const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7a1515"/>
      <stop offset="40%" stop-color="#3d0c2d"/>
      <stop offset="100%" stop-color="#0a0a1a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="30%" r="60%">
      <stop offset="0%" stop-color="#c0392b" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#c0392b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#e74c3c"/>
      <stop offset="100%" stop-color="#c0392b"/>
    </linearGradient>
  </defs>
  <!-- 渐变背景 -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- 红色光晕 -->
  <rect width="1200" height="630" fill="url(#glow)"/>
  <!-- 顶部渐变条 -->
  <rect x="0" y="0" width="1200" height="5" fill="url(#accent)"/>
  <!-- 主标题第一行 -->
  <text x="600" y="270" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="100" font-weight="bold" fill="#ffffff" letter-spacing="16">
    小红故事
  </text>
  <!-- 主标题第二行 -->
  <text x="600" y="390" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="100" font-weight="bold" fill="#ffffff" letter-spacing="16">
    热搜
  </text>
  <!-- 装饰线 -->
  <rect x="420" y="430" width="360" height="4" rx="2" fill="url(#accent)"/>
  <!-- 底部文字 -->
  <text x="600" y="560" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="28" fill="#8888aa">
    snowhoo.net · 每日热榜
  </text>
</svg>`;

sharp(Buffer.from(svg))
  .jpeg({ quality: 90 })
  .toFile(outputPath)
  .then(() => console.log('封面图已生成:', outputPath))
  .catch(e => console.error('生成失败:', e.message));
