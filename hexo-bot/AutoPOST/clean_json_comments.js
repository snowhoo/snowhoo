#!/usr/bin/env node
/**
 * 清理 Waline 中 path 以 .json 结尾的「不合法」评论
 * 用法（任选其一）：
 *   WALINE_TOKEN=eyJxxx node clean_json_comments.js
 *   node clean_json_comments.js --token=eyJxxx
 *   node clean_json_comments.js --token=eyJxxx --host=waline.snowhoo.net --dry-run   # 只列不删
 *
 * 说明：
 *   - 通过管理员接口 GET /api/comment?type=all 分页拉全站评论
 *   - 筛出 url/path 以 .json 结尾的（即过滤 bug 时期错发到 json 地址的评论）
 *   - 逐条 DELETE /api/comment/:id 删除
 *   - 删除后复核剩余 .json 评论数
 */
const https = require('https');

function parseArgs(argv) {
  const a = { host: 'waline.snowhoo.net', dryRun: false, token: process.env.WALINE_TOKEN || '' };
  for (const s of argv.slice(2)) {
    if (s.startsWith('--token=')) a.token = s.slice(8);
    else if (s.startsWith('--host=')) a.host = s.slice(7);
    else if (s === '--dry-run') a.dryRun = true;
  }
  return a;
}

function req(method, host, path, body, token) {
  return new Promise((resolve, reject) => {
    let p = path;
    if (token && !/token=/.test(p)) p += (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = https.request({ hostname: host, port: 443, path: p, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { let j; try { j = JSON.parse(d); } catch (e) { j = { raw: d }; } resolve({ status: res.statusCode, body: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const stripHtml = s => String(s || '').replace(/<[^>]+>/g, '');
const normUrl = u => (u || '').split('?')[0];
const isJson = u => /\.json$/i.test(normUrl(u));

async function listAllComments(host, token) {
  const out = [];
  let page = 1; const pageSize = 100;
  while (true) {
    const res = await req('GET', host, `/api/comment?type=all&page=${page}&pageSize=${pageSize}`, null, token);
    if (res.status !== 200) { console.log('LIST err', res.status, JSON.stringify(res.body).slice(0, 200)); break; }
    const b = res.body || {};
    const arr = (b.data && Array.isArray(b.data.data)) ? b.data.data
              : (Array.isArray(b.data) ? b.data : []);
    if (!arr.length) break;
    out.push(...arr);
    if (arr.length < pageSize) break;
    if (++page > 300) break;
  }
  return out;
}

(async () => {
  const a = parseArgs(process.argv);
  if (!a.token) { console.log('缺少令牌：请用 WALINE_TOKEN 或 --token= 提供管理员 JWT'); process.exit(2); }
  console.log('HOST =', a.host, '| dryRun =', a.dryRun);

  const all = await listAllComments(a.host, a.token);
  console.log('全站评论总数:', all.length);

  const bad = all.filter(c => isJson(c.url || c.path));
  console.log('=== 待删 (.json 路径) 评论数:', bad.length, '===');
  bad.forEach(c => console.log(`  id=${c.objectId} | url=${c.url} | [${c.nick}] ${stripHtml(c.comment).slice(0, 30)}`));

  if (a.dryRun) { console.log('(dry-run) 未执行删除'); return; }
  if (!bad.length) { console.log('无 .json 评论，结束。'); return; }

  let ok = 0, fail = 0;
  for (const c of bad) {
    const del = await req('DELETE', a.host, `/api/comment/${c.objectId}`, null, a.token);
    if (del.status === 200 || del.status === 204) ok++;
    else { fail++; if (fail <= 8) console.log('  DEL FAIL', c.objectId, del.status, JSON.stringify(del.body).slice(0, 120)); }
  }
  console.log(`=== 删除完成: 成功 ${ok}, 失败 ${fail} ===`);

  // 复核
  const after = await listAllComments(a.host, a.token);
  const remaining = after.filter(c => isJson(c.url || c.path)).length;
  console.log('复核：剩余 .json 评论数 =', remaining);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
