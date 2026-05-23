/**
 * 一次性脚本：将旧格式 data 文件（export default）转换为新格式（window.__yedu_xxx）
 * 输入：D:\hexo\source\yedu\data\*.js
 * 输出：D:\hexo\source\js\sevencolor\test1\data\*.js
 * 用法：node convert-old-data.js [force]
 *       node convert-old-data.js force 强制覆盖已存在的文件
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = 'D:\\hexo\\source\\yedu\\data';
const DST_DIR = 'D:\\hexo\\source\\js\\sevencolor\\test1\\data';
const FORCE = process.argv.includes('force');

if (!fs.existsSync(DST_DIR)) {
  fs.mkdirSync(DST_DIR, { recursive: true });
}

const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.js') && f !== 'article-list.js');
let converted = 0;
let skipped = 0;

files.forEach(f => {
  const srcPath = path.join(SRC_DIR, f);
  const dstPath = path.join(DST_DIR, f);

  let content = fs.readFileSync(srcPath, 'utf8');

  // 检查是否是旧格式
  if (!content.includes('export default')) {
    console.log('[跳过] ' + f + '（非旧格式）');
    skipped++;
    return;
  }

  // 跳过已存在的文件（除非 force）
  if (fs.existsSync(dstPath) && !FORCE) {
    console.log('[跳过] ' + f + '（已存在）');
    skipped++;
    return;
  }

  // 转换：export default { → window.__yedu_文件名_ = {
  const varName = '__yedu_' + f.replace(/\.js$/, '').replace(/-/g, '_');
  content = content.replace(/export\s+default\s+/, 'window.' + varName + ' = ');

  fs.writeFileSync(dstPath, content, 'utf8');
  console.log(FORCE ? '[覆盖] ' + f : '[转换] ' + f + ' → ' + varName);
  converted++;
});

console.log('\n完成：转换 ' + converted + ' 个，跳过 ' + skipped + ' 个');
