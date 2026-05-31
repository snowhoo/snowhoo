// FestivalSolar.js - 自动刷新 FestivalSolar.json 中的节日节气日期
// 原则：已过去的日期使用下一年的日期，未过去的日期使用当年的日期
// 用法: node D:\hexo\hexo-bot\refresh-cache\FestivalSolar.js

'use strict';

// 加载 managed workspace 中的 lunar-javascript
module.paths.unshift(require('path').join(
  process.env.USERPROFILE || process.env.HOME,
  '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules'
));

const { Solar, Lunar } = require('lunar-javascript');
const fs = require('fs');
const { execSync } = require('child_process');

const JSON_FILE = 'D:\\hexo\\source\\js\\FestivalSolar\\FestivalSolar.json';
const HEXO_DIR = 'D:\\hexo';

// ---------- 节日定义 ----------
// type: fixed(公历固定) | lunar(农历) | chuxi(除夕=春节前一天) | jieqi(节气)
const FESTIVAL_DEFS = {
  birthday:    { type: 'fixed', m: 4,  d: 9  },
  yuandan:     { type: 'fixed', m: 1,  d: 1  },
  qingren:     { type: 'fixed', m: 2,  d: 14 },
  laodong:     { type: 'fixed', m: 5,  d: 1  },
  guoqing:     { type: 'fixed', m: 10, d: 1  },
  shengdan:    { type: 'fixed', m: 12, d: 25 },
  chunjie:     { type: 'lunar', lm: 1,  ld: 1  },
  yuanxiao:    { type: 'lunar', lm: 1,  ld: 15 },
  duanwu:      { type: 'lunar', lm: 5,  ld: 5  },
  qixi:        { type: 'lunar', lm: 7,  ld: 7  },
  zhongqiu:    { type: 'lunar', lm: 8,  ld: 15 },
  chongyang:   { type: 'lunar', lm: 9,  ld: 9  },
  labajie:     { type: 'lunar', lm: 12, ld: 8  },
  chuxi:       { type: 'chuxi' },
  qingmingjie: { type: 'jieqi', name: '清明' }
};

// ---------- 工具函数 ----------

function pad2(n) { return String(n).padStart(2, '0'); }

function lunarToSolar(ly, lm, ld) {
  const s = Lunar.fromYmd(ly, lm, ld).getSolar();
  return { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
}

// 获取某年全部节气日期 { 节气名: { month, day } }
function getYearJieQiDates(year) {
  const map = {};
  for (let m = 1; m <= 12; m++) {
    const maxD = new Date(year, m, 0).getDate();
    for (let d = 1; d <= maxD; d++) {
      try {
        const jq = Solar.fromYmd(year, m, d).getLunar().getJieQi();
        if (jq) {
          const name = jq.toString();
          if (!map[name]) map[name] = { month: m, day: d };
        }
      } catch (_) { /* skip invalid dates */ }
    }
  }
  return map;
}

// 查找 >= today 的最近一次日期
function findNext(def, today, jieQiCache) {
  const y0 = today.getFullYear();
  for (let y = y0; y <= y0 + 2; y++) {
    let r;
    switch (def.type) {
      case 'fixed':
        r = { month: def.m, day: def.d, year: y };
        break;
      case 'lunar':
        r = lunarToSolar(y, def.lm, def.ld);
        break;
      case 'chuxi': {
        const sf = lunarToSolar(y, 1, 1);
        const cs = Solar.fromYmd(sf.year, sf.month, sf.day - 1);
        r = { year: cs.getYear(), month: cs.getMonth(), day: cs.getDay() };
        break;
      }
      case 'jieqi': {
        const jd = jieQiCache[y] && jieQiCache[y][def.name];
        if (!jd) continue;
        r = { month: jd.month, day: jd.day, year: y };
        break;
      }
    }
    if (!r) continue;
    const dt = new Date(r.year, r.month - 1, r.day, 0, 0, 0);
    if (dt >= today) return r;
  }
  return null;
}

function fmtDate(m, d) { return pad2(m) + '-' + pad2(d); }

function fmtRange(m, d) {
  const t = Date.UTC(2024, m - 1, d);
  const b = new Date(t - 86400000);
  const a = new Date(t + 86400000);
  return pad2(b.getUTCMonth() + 1) + '-' + pad2(b.getUTCDate()) +
         '~' +
         pad2(a.getUTCMonth() + 1) + '-' + pad2(a.getUTCDate());
}

function fmtDisplay(m, d) { return m + '月' + d + '日'; }

function git(c) {
  try {
    return execSync(c, { cwd: HEXO_DIR, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '[ERR] ' + e.message.split('\n')[0];
  }
}

// ---------- 主逻辑 ----------

function main() {
  console.log('=== FestivalSolar Date Refresh ===');
  const raw = fs.readFileSync(JSON_FILE, 'utf8').replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  console.log('Today: ' + year + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate()));

  // 预计算当前年 + 下一年的节气
  const jieQiCache = {};
  for (let y = year; y <= year + 1; y++) {
    jieQiCache[y] = getYearJieQiDates(y);
    console.log('JieQi ' + y + ': ' + Object.keys(jieQiCache[y]).length + ' terms loaded');
  }

  let changed = false;

  // ---- 更新节日 ----
  console.log('\n--- Festivals ---');
  for (const f of data.festivals) {
    const def = FESTIVAL_DEFS[f.id];
    if (!def) { console.log('  [SKIP] ' + f.id); continue; }
    const next = findNext(def, today, jieQiCache);
    if (!next) { console.log('  [ERR]  ' + f.name + ': no next date found'); continue; }
    const nd = fmtDate(next.month, next.day);
    const ndd = fmtDisplay(next.month, next.day);
    if (f.date !== nd || f.displayDate !== ndd) {
      console.log('  [UPD]  ' + f.name + ': ' + f.date + ' -> ' + nd + ' (' + next.year + ')');
      f.date = nd;
      f.displayDate = ndd;
      changed = true;
    } else {
      console.log('  [OK]   ' + f.name + ': ' + nd + ' (' + next.year + ')');
    }
  }

  // ---- 更新节气 ----
  console.log('\n--- Solar Terms ---');
  for (const t of data.solarTerms) {
    const next = findNext({ type: 'jieqi', name: t.name }, today, jieQiCache);
    if (!next) { console.log('  [ERR]  ' + t.name + ': no next date found'); continue; }
    const nr = fmtRange(next.month, next.day);
    const ndd = fmtDisplay(next.month, next.day);
    if (t.date !== nr || t.displayDate !== ndd) {
      console.log('  [UPD]  ' + t.name + ': ' + t.date + ' -> ' + nr + ' (' + next.year + ')');
      t.date = nr;
      t.displayDate = ndd;
      changed = true;
    } else {
      console.log('  [OK]   ' + t.name + ': ' + nr + ' (' + next.year + ')');
    }
  }

  if (!changed) {
    console.log('\n[OK] All dates are up to date. No changes needed.');
    process.exit(0);
  }

  // 更新描述
  data.description = '节日节气数据 - ' + year + '年';

  // 写回 JSON（无 BOM）
  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 4), 'utf8');
  console.log('\n[OK] Written: ' + JSON_FILE);

  // Git 操作
  console.log('[GIT] ' + git('git add "source/js/FestivalSolar/FestivalSolar.json"'));
  const ts = year + pad2(today.getMonth() + 1) + pad2(today.getDate());
  console.log('[GIT] ' + git('git commit -m "[Bot] Auto refresh FestivalSolar ' + ts + '"'));
  console.log('[GIT] ' + git('git push origin source'));
  console.log('\n[DONE]');
}

main();
