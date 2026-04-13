import { getDocument } from 'file:///C:/Users/Administrator/AppData/Roaming/npm/node_modules/pdfjs-dist/build/pdf.mjs';
import { createCanvas } from 'D:/hexo/node_modules/@napi-rs/canvas/index.js';
import { readFileSync } from 'fs';

async function test() {
  const data = new Uint8Array(readFileSync('C:/Users/Administrator/AppData/Roaming/BoClaw/wechat-inbound/1775382292807_w82szf.pdf'));
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1.0 });

  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const buf = canvas.toBuffer('image/png');
    console.log('SUCCESS! Buffer size:', buf.length);
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

test().catch(console.error);
