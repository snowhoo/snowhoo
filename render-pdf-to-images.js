/**
 * render-pdf-to-images.js
 * Renders PDF pages to PNG images using pdfjs-dist + @napi-rs/canvas
 */
const path = require('path');
const fs = require('fs');
const pdfjsLib = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const { createCanvas } = require('@napi-rs/canvas');

const pdfPath = process.argv[2];
const outputDir = process.argv[3] || 'pdf_images';

if (!pdfPath) {
  console.error('Usage: node render-pdf-to-images.js <pdf_path> [output_dir]');
  process.exit(1);
}

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function renderPage(doc, pageNum, scale) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
  }).promise;

  const buffer = canvas.toBuffer('image/png');
  const outPath = path.join(outputDir, `page_${String(pageNum).padStart(3, '0')}.png`);
  fs.writeFileSync(outPath, buffer);
  return outPath;
}

async function main() {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false, isEvalAllowed: false }).promise;

  console.log(`PDF: ${pdfPath}`);
  console.log(`Pages: ${doc.numPages}`);

  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const outPath = await renderPage(doc, i, 2.0);
      console.log(`[${i}/${doc.numPages}] Saved: ${outPath}`);
    } catch (e) {
      console.error(`[${i}] Error: ${e.message}`);
    }
  }

  console.log('Done!');
}

main().catch(e => console.error(e));
