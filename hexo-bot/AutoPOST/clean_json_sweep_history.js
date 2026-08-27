#!/usr/bin/env node
/**
 * 补扫历史「日期型 .json」路径上的不合法评论（news_CCTV/YYYYMMDD/<分类>.json）
 *
 * 背景：bug 期间 auto-poster 把评论发到了 sitemap 里的 .json 资源地址，且存储形态为
 *       带尾斜杠（cleanPath + '/'）。日期型路径每天滚动，早已不在「当前 sitemap」，
 *       所以上一轮按当前 sitemap 枚举会漏掉它们。
 *       另外：中文路径在 Node 中 urlObj.pathname 保留百分号编码（存储为 %E5%...），
 *       而服务端会先解码 path 参数再比对，因此中文路径必须「双层编码」才能命中。
 *
 * 用法：
 *   node clean_json_sweep_history.js --token=eyJxxx [--delete] [--from=2026-05-15] [--to=2026-08-27]
 *   默认只枚举列出（dry-run）；加 --delete 才真实删除。
 */
const https = require('https');

function parseArgs(argv) {
  const a = { host: 'waline.snowhoo.net', token: '', delete: false, from: '2026-07-20', to: '2026-08-27' };
  for (const s of argv.slice(2)) {
    if (s.startsWith('--token=')) a.token = s.slice(8);
    else if (s === '--delete') a.delete = true;
    else if (s.startsWith('--from=')) a.from = s.slice(7);
    else if (s.startsWith('--to=')) a.to = s.slice(5);
  }
  return a;
}

function req(method, host, p, token) {
  return new Promise((res, rej) => {
    const sep = p.includes('?') ? '&' : '?';
    const pp = p + sep + 'token=' + encodeURIComponent(token);
    const r = https.request({ hostname: host, port: 443, path: pp, method, headers: { Authorization: 'Bearer ' + token } }, resp => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => res({ status: resp.statusCode, body: d }));
    });
    r.on('error', rej); r.end();
  });
}

const CATS = ['军事', '国内', '国际', '文娱', '新闻', '法治', '社会', '生活', '科技', '经济', '新华'];

function* dateRange(from, to) {
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    yield `${y}${m}${day}`;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ''); }

async function listByPath(host, token, pathVal) {
  const res = await req('GET', host, '/api/comment?type=all&pageSize=100&path=' + pathVal, token);
  if (res.status !== 200) return [];
  let j; try { j = JSON.parse(res.body); } catch (e) { return []; }
  const arr = (j.data && Array.isArray(j.data.data)) ? j.data.data
            : (Array.isArray(j.data) ? j.data : []);
  return arr;
}

// 简易并发池
async function mapLimit(items, limit, fn) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret.push(await fn(items[idx], idx));
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return ret;
}

(async () => {
  const a = parseArgs(process.argv);
  if (!a.token) { console.log('缺少令牌：--token=eyJxxx'); process.exit(2); }
  console.log('HOST =', a.host, '| delete =', a.delete, '| range', a.from, '~', a.to);

  // 生成所有 (date,cat) 对应的待查路径形态
  const tasks = [];
  for (const date of dateRange(a.from, a.to)) {
    for (const cat of CATS) {
      const base = `/app/news_CCTV/${date}/${encodeURIComponent(cat)}.json`;
      // 形态1：单层编码 + 尾斜杠（ASCII/服务端不解码时）
      // 形态2：双层编码 + 尾斜杠（中文路径：服务端先解码一次→回到单层编码，才能命中存储值）
      tasks.push(base + '/');
      tasks.push(encodeURIComponent(base) + '/');
    }
  }
  console.log('待查路径形态总数:', tasks.length);

  const seen = new Set();
  const hits = [];
  let probed = 0;
  const results = await mapLimit(tasks, 12, async (f) => {
    const arr = await listByPath(a.host, a.token, f);
    if (arr.length) {
      probed++;
      for (const c of arr) {
        if (seen.has(c.objectId)) continue;
        seen.add(c.objectId);
        hits.push({ id: c.objectId, via: f, nick: c.nick, comment: stripTags(c.comment).slice(0, 40) });
      }
    }
    return arr.length;
  });
  void results;

  console.log('枚举命中的不重复 .json 评论数:', hits.length, '| 命中的路径形态次数:', probed);
  hits.forEach(h => console.log(`  id=${h.id} | via=${h.via.slice(0, 70)} | [${h.nick}] ${h.comment}`));

  if (!a.delete) { console.log('(dry-run) 未执行删除，加 --delete 才真正删除'); return; }
  if (!hits.length) { console.log('无命中，结束。'); return; }

  let ok = 0, fail = 0;
  for (const h of hits) {
    const del = await req('DELETE', a.host, '/api/comment/' + h.id, a.token);
    if (del.status === 200 || del.status === 204) ok++;
    else { fail++; if (fail <= 12) console.log('  DEL FAIL', h.id, del.status, del.body.slice(0, 120)); }
  }
  console.log(`=== 删除完成: 成功 ${ok}, 失败 ${fail} ===`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
