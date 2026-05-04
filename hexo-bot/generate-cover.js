const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'source', 'images', 'hotnews-cover.jpg');
const imagesDir = path.dirname(outputPath);
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

// SVG 封面图：深红渐变背景 + 白色文字，两行标题
const svg = `<svg width="1300" height="400" xmlns="http://www.w3.org/2000/svg">
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
  <rect width="1300" height="400" fill="url(#bg)"/>
  <!-- 红色光晕 -->
  <rect width="1300" height="400" fill="url(#glow)"/>
  <!-- 顶部渐变条 -->
  <rect x="0" y="0" width="1300" height="5" fill="url(#accent)"/>
  <!-- 主标题第一行 -->
  <text x="650" y="170" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="64" font-weight="bold" fill="#ffffff" letter-spacing="10">
    小红故事
  </text>
  <!-- 主标题第二行 -->
  <text x="650" y="250" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="64" font-weight="bold" fill="#ffffff" letter-spacing="10">
    热搜
  </text>
  <!-- 装饰线 -->
  <rect x="455" y="285" width="390" height="3" rx="1.5" fill="url(#accent)"/>
  <!-- 底部文字 -->
  <text x="650" y="360" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif"
    font-size="20" fill="#8888aa">
    snowhoo.net · 每日热榜
  </text>
</svg>`;

sharp(Buffer.from(svg))
  .jpeg({ quality: 90 })
  .toFile(outputPath)
  .then(() => console.log('封面图已生成:', outputPath))
  .catch(e => console.error('生成失败:', e.message));
