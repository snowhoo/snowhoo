#!/usr/bin/env node
/**
 * 清理 Waline 中 path 落在 sitemap .json 地址上的「不合法」评论
 *
 * 背景：旧版过滤 bug 让 /api/comment 把评论发到了 sitemap 里的 .json 资源路径上。
 *       本定制版 Waline 列表接口强制要求 path 参数，且返回对象不含 url 字段，
 *       因此必须按 sitemap 中的 .json 路径逐一枚举。
 *
 * 用法：
 *   node clean_json_v2.js --token=eyJxxx [--dry-run] [--host=waline.snowhoo.net]
 *
 * 说明：
 *   - 拉取 sitemap.xml，提取所有 .json 的 <loc>
 *   - 对每个 .json 路径，用两种形态查询评论：
 *       formA = URL.pathname（保持 sitemap 中的百分号编码原样，query 中不二次编码）
 *       formB = 完整 URL（https://.../x.json）
 *   - 命中即视为 .json 不合法评论，收集 objectId（按 id 去重）
 *   - --dry-run 只列不删；否则逐条 DELETE /api/comment/:id
 */
const https = require('https');

function parseArgs(argv) {
  const a = { host: 'waline.snowhoo.net', dryRun: false, token: '' };
  for (const s of argv.slice(2)) {
    if (s.startsWith('--token=')) a.token = s.slice(8);
    else if (s.startsWith('--host=')) a.host = s.slice(7);
    else if (s === '--dry-run') a.dryRun = true;
  }
  return a;
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    }).on('error', rej);
  });
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

function extractJsonUrls(sitemapXml) {
  const locs = sitemapXml.match(/<loc>[^<]*<\/loc>/gi) || [];
  const urls = locs.map(l => (l.match(/<loc>([^<]*)<\/loc>/i) || [])[1] || '').filter(Boolean);
  return urls.filter(u => /\.json($|\?)/i.test(u));
}

function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ''); }

async function listByPath(host, token, pathVal) {
  // pathVal 已是最终要放进 query 的字符串（百分号编码或完整 URL），不二次编码
  const q = '/api/comment?type=all&pageSize=100&path=' + pathVal;
  const res = await req('GET', host, q, token);
  if (res.status !== 200) return [];
  let j; try { j = JSON.parse(res.body); } catch (e) { return []; }
  const arr = (j.data && Array.isArray(j.data.data)) ? j.data.data
            : (Array.isArray(j.data) ? j.data : []);
  return arr;
}

(async () => {
  const a = parseArgs(process.argv);
  if (!a.token) { console.log('缺少令牌：--token=eyJxxx'); process.exit(2); }
  console.log('HOST =', a.host, '| dryRun =', a.dryRun);

  const sm = await get('https://snowhoo.net/sitemap.xml');
  const jsonUrls = extractJsonUrls(sm.body);
  console.log('sitemap 中 .json 路径数:', jsonUrls.length);

  const seen = new Set();
  const hits = [];
  let probed = 0;
  for (const u of jsonUrls) {
    let pathname;
    try { pathname = new URL(u).pathname; } catch (e) { continue; }
    let decoded = pathname;
    try { decoded = decodeURIComponent(pathname); } catch (e) {}
    // bug 时期的 url 构造为 cleanPath + '/'（.json 非 html → 补尾斜杠），故存储形态带尾斜杠。
    // 多形态覆盖存储编码差异：
    //  fA 编码 pathname + 尾斜杠（标准存储形态）
    //  fB 完整 URL + 尾斜杠
    //  fC 解码后再安全编码 + 尾斜杠（中文路径「存储为解码」情形）
    //  fD 双编码 pathname + 尾斜杠（「存储为编码」且服务端仅解码一次情形）
    const doubleEnc = encodeURIComponent(pathname);
    const forms = [
      pathname + '/',
      u + '/',
      encodeURI(decoded) + '/',
      doubleEnc + '/'
    ];
    for (const f of forms) {
      const arr = await listByPath(a.host, a.token, f);
      if (arr.length) {
        probed++;
        for (const c of arr) {
          if (seen.has(c.objectId)) continue;
          seen.add(c.objectId);
          hits.push({ id: c.objectId, matchedForm: f, nick: c.nick, comment: stripTags(c.comment).slice(0, 40), time: c.time });
        }
      }
    }
  }
  console.log('枚举命中的不重复 .json 评论数:', hits.length, '| 命中的路径形态次数:', probed);
  hits.forEach(h => console.log(`  id=${h.id} | via=${h.matchedForm.slice(0, 60)} | [${h.nick}] ${h.comment}`));

  if (a.dryRun) { console.log('(dry-run) 未执行删除'); return; }
  if (!hits.length) { console.log('无 .json 评论，结束。'); return; }

  let ok = 0, fail = 0;
  for (const h of hits) {
    const del = await req('DELETE', a.host, '/api/comment/' + h.id, a.token);
    if (del.status === 200 || del.status === 204) ok++;
    else { fail++; if (fail <= 10) console.log('  DEL FAIL', h.id, del.status, del.body.slice(0, 120)); }
  }
  console.log(`=== 删除完成: 成功 ${ok}, 失败 ${fail} ===`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
