#!/usr/bin/env node
/**
 * 全量扫描 Waline 评论，删除所有 url 以 .json/ 结尾（bug 错发到 .json 数据文件）的评论。
 *
 * 原理：定制版 Waline 的 /api/comment?type=all 强制要求 path，无法全量列出；
 *       但 /api/comment?type=recent 可翻页且每条返回 url 字段。
 *       因此翻页拉取全站评论，过滤 url 以 .json/ 或 .json 结尾者删除。
 *
 * 用法：
 *   node scan_recent_all.js --token=eyJxxx [--delete] [--maxpage=400]
 *   默认 dry-run（只列不删），加 --delete 才真实删除。
 */
const https = require('https');

function parseArgs(argv) {
  const a = { token: '', delete: false, maxpage: 400, conc: 20 };
  for (const s of argv.slice(2)) {
    if (s.startsWith('--token=')) a.token = s.slice(8);
    else if (s === '--delete') a.delete = true;
    else if (s.startsWith('--maxpage=')) a.maxpage = parseInt(s.slice(10), 10);
    else if (s.startsWith('--conc=')) a.conc = parseInt(s.slice(7), 10);
  }
  return a;
}

function req(method, p, token) {
  return new Promise((res, rej) => {
    const sep = p.includes('?') ? '&' : '?';
    const pp = p + sep + 'token=' + encodeURIComponent(token);
    const r = https.request({ hostname: 'waline.snowhoo.net', port: 443, path: pp, method, headers: { Authorization: 'Bearer ' + token } }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ status: resp.statusCode, body: d }));
    });
    r.on('error', rej); r.end();
  });
}

function extractArr(j) {
  if (Array.isArray(j.data)) return j.data;
  if (j.data && Array.isArray(j.data.data)) return j.data.data;
  return [];
}

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ''); }

async function mapLimit(items, limit, fn) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret.push(await fn(items[idx], idx));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return ret;
}

(async () => {
  const a = parseArgs(process.argv);
  if (!a.token) { console.log('缺少令牌：--token=eyJxxx'); process.exit(2); }
  console.log('delete =', a.delete, '| maxpage =', a.maxpage, '| conc =', a.conc);

  const pages = Array.from({ length: a.maxpage }, (_, i) => i + 1);
  const collected = [];
  let lastNonEmpty = 0;

  await mapLimit(pages, a.conc, async (pg) => {
    const resp = await req('GET', `/api/comment?type=recent&page=${pg}&pageSize=10`, a.token);
    if (resp.status !== 200) return;
    let j; try { j = JSON.parse(resp.body); } catch (e) { return; }
    const arr = extractArr(j);
    if (arr.length) { lastNonEmpty = Math.max(lastNonEmpty, pg); collected.push(...arr); }
  });

  console.log('抓取评论总条数（含重复页边界）:', collected.length, '| 最后非空页:', lastNonEmpty);
  if (lastNonEmpty >= a.maxpage) console.log('⚠️ 最后页仍满，可能未到底，建议加大 --maxpage');

  const seen = new Set();
  const hits = [];
  for (const c of collected) {
    const url = c.url || '';
    if (!/\.json\/?$/i.test(url)) continue;
    if (seen.has(c.objectId)) continue;
    seen.add(c.objectId);
    hits.push({ id: c.objectId, url, nick: c.nick, comment: stripTags(c.comment).slice(0, 40) });
  }

  console.log('=== url 以 .json/ 结尾的命中(去重):', hits.length, '===');
  hits.forEach(h => console.log(`  id=${h.id} | url=${h.url} | [${h.nick}] ${h.comment}`));

  if (!a.delete) { console.log('(dry-run) 未删除，加 --delete 才真正删除'); return; }
  if (!hits.length) { console.log('无命中。'); return; }

  let ok = 0, fail = 0;
  for (const h of hits) {
    const del = await req('DELETE', `/api/comment/${h.id}`, a.token);
    if (del.status === 200 || del.status === 204) ok++;
    else { fail++; if (fail <= 20) console.log('  DEL FAIL', h.id, del.status, del.body.slice(0, 120)); }
  }
  console.log(`=== 删除完成: 成功 ${ok}, 失败 ${fail} ===`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
