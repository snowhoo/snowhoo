/**
 * pdf-to-docx.js
 * Converts scanned PDF to DOCX via PDF→PNG→OCR→DOCX pipeline
 * Uses pdfjs-dist (bundled @napi-rs/canvas) + tesseract.js + docx-js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Paths
const PDF_PATH = 'C:/Users/Administrator/AppData/Roaming/BoClaw/wechat-inbound/1775382292807_w82szf.pdf';
const IMG_DIR = path.join(os.tmpdir(), 'pdf2docx_imgs');
const OUT_DOCX = 'D:/hexo/北大炒股.docx';

if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

// ============ Step 1: Render PDF to PNG ============
async function renderPdfToImages() {
  const { getDocument } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/pdfjs-dist/node_modules/@napi-rs/canvas');

  const data = new Uint8Array(fs.readFileSync(PDF_PATH));
  const doc = await getDocument({ data }).promise;
  const numPages = doc.numPages;

  console.log(`[Step 1] PDF has ${numPages} pages, rendering to PNG...`);

  const imagePaths = [];
  for (let i = 1; i <= numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 2.0 });

    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const buf = canvas.toBuffer('image/png');
    const imgPath = path.join(IMG_DIR, `page_${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(imgPath, buf);
    imagePaths.push(imgPath);

    if (i % 10 === 0 || i === numPages) {
      console.log(`  Rendered ${i}/${numPages} pages`);
    }
  }
  console.log(`[Step 1] Done! ${numPages} images saved.`);
  return imagePaths;
}

// ============ Step 2: OCR images with tesseract.js ============
async function ocrImages(imagePaths) {
  const { createWorker } = require('C:/Users/Administrator/AppData/Roaming/npm/node_modules/tesseract.js');

  console.log(`[Step 2] Starting OCR on ${imagePaths.length} images...`);

  const worker = await createWorker('eng+chi_sim');
  const results = [];

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];
    const { data } = await worker.recognize(imgPath);
    results.push(data.text);
    if ((i + 1) % 5 === 0 || i === imagePaths.length - 1) {
      console.log(`  OCR progress: ${i + 1}/${imagePaths.length}`);
    }
  }

  await worker.terminate();
  console.log(`[Step 2] OCR complete!`);
  return results;
}

// ============ Step 3: Create DOCX ============
async function createDocx(texts) {
  // Read docx-js documentation
  const docxDoc = `
# DOCX creation guide

Key rules:
- 页面尺寸必须显式设置 — docx-js 默认 A4，美国文档用 US Letter（12240 × 15840 DXA）
- 禁止使用 Unicode 子弹符号 — 不要用 • 或 \\u2022，必须用 LevelFormat.BULLET + numbering config
- 禁止使用 \\n 换行 — 用多个 Paragraph 元素代替
- 表格需要双宽度 — 同时设置 columnWidths 数组和每个 cell 的 width
- 表格宽度只用 DXA — 不要用 WidthType.PERCENTAGE
- 表格 shading 用 ShadingType.CLEAR — 不要用 SOLID，否则渲染为纯黑背景
- 不要用表格做分隔线 — 用 Paragraph 的 border 属性代替
- PageBreak 必须在 Paragraph 内 — 独立 PageBreak 会产生无效 XML
- ImageRun 必须指定 type 参数 — png/jpg/jpeg/gif/bmp/svg
`;

  // For docx creation, we'll create the document directly
  // First check if docx npm is available
  const docxPath = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/docx';

  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel,
    PageBreak, AlignmentType, WidthType, ShadingType,
    Table, TableRow, TableCell, BorderStyle
  } = require(docxPath);

  console.log(`[Step 3] Creating DOCX with ${texts.length} pages...`);

  const children = [];

  // Title
  children.push(
    new Paragraph({
      text: '北大炒股笔记',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: `来源：北大炒股PPT（共${texts.length}页）`,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new PageBreak()] })
  );

  // Process each page
  for (let i = 0; i < texts.length; i++) {
    const pageText = texts[i].trim();
    const pageNum = i + 1;

    // Page header
    children.push(
      new Paragraph({
        text: `第 ${pageNum} 页`,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
      })
    );

    if (pageText) {
      // Split by newlines and create paragraphs
      const lines = pageText.split(/\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          children.push(new Paragraph({ text: '' }));
        } else {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: trimmed })],
              spacing: { after: 100 },
            })
          );
        }
      }
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '(此页无文字内容)' })],
          alignment: AlignmentType.CENTER,
          color: '999999',
        })
      );
    }

    // Page break (except last page)
    if (i < texts.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  DOCX progress: ${i + 1}/${texts.length}`);
    }
  }

  const doc = new Document({
    sections: [{ children }],
    properties: {
      document: {
        title: '北大炒股笔记',
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_DOCX, buffer);
  console.log(`[Step 3] DOCX saved: ${OUT_DOCX}`);
}

// ============ Main ============
async function main() {
  try {
    const startTime = Date.now();

    // Step 1: Render PDF to images
    const imagePaths = await renderPdfToImages();

    // Step 2: OCR images
    const texts = await ocrImages(imagePaths);

    // Step 3: Create DOCX
    await createDocx(texts);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[DONE] Total time: ${elapsed}s`);
    console.log(`Output: ${OUT_DOCX}`);

    // Clean up images
    for (const p of imagePaths) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
    try { fs.rmdirSync(IMG_DIR); } catch (_) {}

  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
  }
}

main();
