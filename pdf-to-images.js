/**
 * pdf-to-images.js
 * Renders PDF pages to PNG images using pdfjs-dist + manual PNG encoding (no canvas npm needed)
 */
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

// Simple PNG encoder using raw pixel data (no canvas npm needed for writing)
function encodePNG(width, height, rgbaData) {
  const zlib = require('zlib');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function makeIHDR() {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data[8] = 8;  // bit depth
    data[9] = 6;  // color type (RGBA)
    data[10] = 0; // compression
    data[11] = 0; // filter
    data[12] = 0; // interlace
    return makeChunk('IHDR', data);
  }

  // IDAT chunk (image data)
  function makeIDAT() {
    // Add filter byte (0 = none) at start of each row
    const rawData = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
      rawData[y * (width * 4 + 1)] = 0; // filter byte
      for (let x = 0; x < width * 4; x++) {
        rawData[y * (width * 4 + 1) + 1 + x] = rgbaData[y * width * 4 + x];
      }
    }
    const compressed = zlib.deflateSync(rawData, { level: 6 });
    return makeChunk('IDAT', compressed);
  }

  // IEND chunk
  function makeIEND() {
    return makeChunk('IEND', Buffer.alloc(0));
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = [];
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  return Buffer.concat([signature, makeIHDR(), makeIDAT(), makeIEND()]);
}

async function renderPage(pageNum, scale = 2.0) {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');

  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
  }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return encodePNG(canvas.width, canvas.height, imageData.data);
}

async function main() {
  const pdfPath = process.argv[2] || 'input.pdf';
  const outputDir = process.argv[3] || 'output_pages';

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  console.log(`PDF has ${doc.numPages} pages`);

  for (let i = 1; i <= doc.numPages; i++) {
    page = await doc.getPage(i);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pngBuffer = encodePNG(canvas.width, canvas.height, imageData.data);

    const outPath = path.join(outputDir, `page_${String(i).padStart(3,'0')}.png`);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Saved: ${outPath}`);
  }

  console.log('Done!');
}

main().catch(console.error);
