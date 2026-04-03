/**
 * compress-all-images.js
 * 压缩所有文章图片并更新引用
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const postsDir = 'D:/hexo/source/_posts';
const hotnewsDir = 'D:/hexo/source/images/hotnews';
const emailDir = 'D:/hexo/source/images/email-attachments';

let totalOrig = 0, totalNew = 0;
let postUpdated = 0;
let filesDeleted = 0;
let errors = 0;

async function run() {
  // ---- 1. 压缩 email-attachments（JPG，原地覆盖，不改格式）----
  const emailFiles = fs.readdirSync(emailDir).filter(f => f.match(/\.(jpg|jpeg)$/i));
  for (const f of emailFiles) {
    const fp = path.join(emailDir, f);
    const orig = fs.statSync(fp).size;
    try {
      const tmp = fp + '.tmp';
      await sharp(fp).resize(1200, null, { withoutEnlargement: true }).jpeg({ quality: 85, progressive: true }).toFile(tmp);
      const comp = fs.statSync(tmp).size;
      fs.unlinkSync(fp);
      fs.renameSync(tmp, fp);
      console.log('email压缩: ' + f + ' ' + Math.round(orig/1024) + 'KB -> ' + Math.round(comp/1024) + 'KB');
      totalOrig += orig; totalNew += comp;
    } catch(e) { console.error('email失败: ' + f, e.message); errors++; }
  }

  // ---- 2. 压缩 hotnews PNG/JPG 为 WebP ----
  const hotFiles = fs.readdirSync(hotnewsDir).filter(f => f.match(/\.(png|jpg|jpeg)$/i));
  for (const f of hotFiles) {
    const fp = path.join(hotnewsDir, f);
    const orig = fs.statSync(fp).size;
    const newName = f.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    const newFp = path.join(hotnewsDir, newName);
    try {
      await sharp(fp).resize(800, null, { withoutEnlargement: true }).webp({ quality: 80 }).toFile(newFp);
      const comp = fs.statSync(newFp).size;
      if (newFp !== fp) { fs.unlinkSync(fp); filesDeleted++; }
      console.log('hotnews压缩: ' + f + ' ' + Math.round(orig/1024) + 'KB -> ' + Math.round(comp/1024) + 'KB (省' + Math.round((1-comp/orig)*100) + '%)');
      totalOrig += orig; totalNew += comp;
    } catch(e) { console.error('hotnews失败: ' + f, e.message); errors++; }
  }

  // ---- 3. 更新文章中的图片引用（png/jpg -> webp）----
  const postFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'));
  for (const pf of postFiles) {
    const fp = path.join(postsDir, pf);
    let content = fs.readFileSync(fp, 'utf8');
    let changed = false;
    // 匹配 /images/hotnews/xxx.png 或 /images/hotnews/xxx.jpg 等
    const regex = /!\[\]\(\/images\/hotnews\/([^)]+)\.(png|jpg|jpeg)\)/gi;
    const newContent = content.replace(regex, function(match, name, ext) {
      changed = true;
      return '![](images/hotnews/' + name + '.webp)';
    });
    if (changed) {
      fs.writeFileSync(fp, newContent, 'utf8');
      postUpdated++;
    }
  }

  console.log('');
  console.log('===== 汇总 =====');
  console.log('压缩图片: ' + (emailFiles.length + hotFiles.length) + ' 张');
  console.log('删除原文件: ' + filesDeleted + ' 个');
  console.log('更新文章: ' + postUpdated + ' 篇');
  console.log('原始总大小: ' + Math.round(totalOrig/1024/1024) + ' MB');
  console.log('压缩后总大小: ' + Math.round(totalNew/1024/1024) + ' MB');
  console.log('节省: ' + Math.round((1-totalNew/totalOrig)*100) + '%');
  console.log('失败: ' + errors + ' 个');
}

run().catch(e => console.error(e));
