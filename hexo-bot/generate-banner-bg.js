/**
 * 节日横幅背景图片生成器
 * 为每个节日生成 PNG 横幅背景图
 * 纯 Node.js，零依赖，手动编码 PNG 格式
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ============ CRC32 ============
const CRC32_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[n] = c;
}

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ============ PNG 构建 ============
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeB, data]));
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPNG(width, height, pixelCallback) {
  // Raw: 每行 1 字节 filter(0) + RGB*width
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  let off = 0;
  for (let y = 0; y < height; y++) {
    raw[off++] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelCallback(x, y);
      raw[off++] = r;
      raw[off++] = g;
      raw[off++] = b;
    }
  }

  const compressed = zlib.deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdrData),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ============ 颜色工具 ============
function hexToRGB(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ============ 节庆数据 ============
const FESTIVALS = [
  { date: '2026-01-01', slug: 'yuandan',      color: '#c62828', bgTop: '#c62828', bgBot: '#fff5f5' },
  { date: '2026-02-14', slug: 'qingren',      color: '#e91e63', bgTop: '#e91e63', bgBot: '#fce4ec' },
  { date: '2026-02-17', slug: 'chunjie',      color: '#e53935', bgTop: '#c41e3a', bgBot: '#fff5f5' },
  { date: '2026-03-03', slug: 'yuanxiao',     color: '#e67e22', bgTop: '#e67e22', bgBot: '#fff8f0' },
  { date: '2026-04-05', slug: 'qingming',     color: '#6ab04c', bgTop: '#4caf50', bgBot: '#f0fdf4' },
  { date: '2026-05-01', slug: 'laodong',      color: '#c0392b', bgTop: '#c0392b', bgBot: '#fff5f5' },
  { date: '2026-05-31', slug: 'duanwu',       color: '#27ae60', bgTop: '#00897b', bgBot: '#f0fdf4' },
  { date: '2026-08-19', slug: 'qixi',         color: '#c0392b', bgTop: '#c0392b', bgBot: '#fff5f5' },
  { date: '2026-10-01', slug: 'guoqing',      color: '#c62828', bgTop: '#c62828', bgBot: '#fff5f5' },
  { date: '2026-10-08', slug: 'zhongqiu',     color: '#e67e22', bgTop: '#e67e22', bgBot: '#fff8f0' },
  { date: '2026-10-25', slug: 'chongyang',    color: '#795548', bgTop: '#795548', bgBot: '#fef9f0' },
  { date: '2026-12-25', slug: 'shengdan',     color: '#27ae60', bgTop: '#1b5e20', bgBot: '#f0fdf4' },
];

// ============ 生成单张横幅 ============
function generateBanner(festival) {
  const W = 1200;
  const H = 200;
  const topColor = hexToRGB(festival.bgTop);
  const botColor = hexToRGB(festival.bgBot);
  const accent = hexToRGB(festival.color);

  console.log(`生成横幅: ${festival.slug} (${festival.date})`);

  const buf = createPNG(W, H, (x, y) => {
    const t = clamp(y / (H * 0.4), 0, 1); // 渐变集中在上面 40%
    const base = lerp(topColor, botColor, Math.pow(t, 0.6));

    // 微妙装饰：对角线光带
    const diagPhase = ((x / W + y / H) * 3.5) % 1;
    const diagGlow = Math.sin(diagPhase * Math.PI) * 0.06;

    // 圆点装饰
    const dotX = ((x * 37 + y * 13) % 173) / 173;
    const dotY = ((x * 29 + y * 43) % 127) / 127;
    const dotD = Math.sqrt((dotX - 0.5) ** 2 + (dotY - 0.5) ** 2);
    const dotGlow = dotD < 0.25 ? Math.max(0, (0.25 - dotD) * 0.4) : 0;

    const factor = clamp(1 + diagGlow + dotGlow, 0.7, 1.1);

    return [
      clamp(Math.round(base[0] * factor), 0, 255),
      clamp(Math.round(base[1] * factor), 0, 255),
      clamp(Math.round(base[2] * factor), 0, 255),
    ];
  });

  const outDir = path.join(__dirname, '..', 'source', 'images', 'banner');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${festival.slug}-bg.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`  → ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
}

// ============ Main ============
const args = process.argv.slice(2);

if (args.length > 0) {
  const slug = args[0];
  const f = FESTIVALS.find(x => x.slug === slug);
  if (!f) {
    console.error(`未知节日: ${slug}`);
    console.error(`可选: ${FESTIVALS.map(x => x.slug).join(', ')}`);
    process.exit(1);
  }
  generateBanner(f);
} else {
  // 默认生成全部
  console.log(`=== 生成全部 ${FESTIVALS.length} 个节日横幅背景 ===\n`);
  FESTIVALS.forEach(generateBanner);
  console.log(`\n全部完成!`);
}
