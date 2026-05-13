#!/usr/bin/env node
/**
 * TVBox Spider 直接解析引擎 v3.0
 * =================================
 * 
 * 原理: 跳过 drpy2 运行时，直接提取 Spider JS 文件中的 rule 对象，
 * 然后用 Node.js 原生能力解析规则的 json: / js: / CSS 选择器格式。
 * 
 * 用法:
 *   node spider-direct.mjs --all       # 全量测试
 *   node spider-direct.mjs 虎牙直播    # 单个
 *   node spider-direct.mjs --test      # 测试模式(每站3个)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const cheerio = require('cheerio');

const JS_DIR = path.join(__dirname, 'drpy-py', 'js');
const DATA_DIR = path.join(__dirname, 'playable', 'data');
const REPORT_DIR = path.join(__dirname, 'report');

for (const d of [DATA_DIR, REPORT_DIR]) fs.mkdirSync(d, { recursive: true });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ============================================================
// 工具函数
// ============================================================

async function httpGet(url, headers = {}) {
    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': UA, ...headers },
            signal: AbortSignal.timeout(15000),
        });
        return resp.ok ? await resp.text() : '';
    } catch { return ''; }
}

function getField(obj, key) {
    if (!key || !obj) return '';
    for (const k of key.split('.')) {
        if (obj && typeof obj === 'object') obj = obj[k];
        else return '';
    }
    return String(obj ?? '');
}

// ============================================================
// Rule 解析核心 (等效 drpy2 rule 引擎)
// ============================================================

function parseRule(ruleStr, html, hostUrl) {
    if (!ruleStr || ruleStr === '*') return [];

    // js: 直接执行代码
    if (ruleStr.startsWith('js:')) {
        try {
            // 创建一个 mini 沙箱
            let VODS = [];
            let input = hostUrl;
            let MY_PAGE = 1;
            let MY_URL = hostUrl;
            
            const fn = new Function('MY_URL', 'MY_PAGE', 'input', 'VODS', 'fetch', 'print',
                'Object', 'Array', 'String', 'Math', 'JSON', 'parseInt',
                ruleStr.slice(3) +
                '\n;return Array.isArray(VODS) ? VODS : ' +
                '(typeof VODS !== "undefined" ? VODS : []);'
            );
            const result = fn(hostUrl, 1, hostUrl, [], httpGet, console.log,
                Object, Array, String, Math, JSON, parseInt);
            if (Array.isArray(result)) {
                return result.map(v => ({
                    vod_id: v.vod_id || v.id || v.url || '',
                    vod_name: v.vod_name || v.title || v.name || '未知',
                    vod_pic: v.vod_pic || v.pic_url || v.pic || '',
                    vod_remarks: v.vod_remarks || v.remark || v.desc || '',
                }));
            }
            return [];
        } catch { return []; }
    }

    // json: path;title;img;desc;link
    if (ruleStr.startsWith('json:')) {
        const parts = ruleStr.slice(5).split(';');
        const jp = parts[0] || '';
        const tk = parts[1] || 'vod_name';
        const ik = parts[2] || 'vod_pic';
        const dk = parts[3] || 'vod_remarks';
        const lk = parts[4] || 'vod_id';

        let data;
        try { data = JSON.parse(html); } catch { return []; }
        let list = data;
        if (jp) for (const k of jp.split('.')) { if (list?.[k]) list = list[k]; else return []; }
        if (!Array.isArray(list)) return [];

        return list.map(item => ({
            vod_id: getField(item, lk) || getField(item, 'vod_id') || '',
            vod_name: getField(item, tk) || getField(item, 'vod_name') || '未知',
            vod_pic: getField(item, ik) || getField(item, 'vod_pic') || '',
            vod_remarks: getField(item, dk) || getField(item, 'vod_remarks') || '',
        }));
    }

    // CSS 选择器: selector;title;img;desc;link
    try {
        const $ = cheerio.load(html);
        const parts = ruleStr.split(';');
        const sel = parts[0];
        if (!sel) return [];
        const tt = parts[1] || '';
        const ii = parts[2] || '';
        const dd = parts[3] || '';
        const ll = parts[4] || '';
        const items = [];
        $(sel).each((i, el) => {
            const $e = $(el);
            items.push({
                vod_id: cssVal($e, ll) || `${i}`,
                vod_name: cssVal($e, tt) || '未知',
                vod_pic: cssVal($e, ii) || '',
                vod_remarks: cssVal($e, dd) || '',
            });
        });
        return items;
    } catch { return []; }
}

function cssVal($el, rule) {
    if (!rule) return '';
    for (const part of rule.split('&&')) {
        const [tag, attr] = part.includes('.') ? part.split('.') : [part, ''];
        if (attr === 'Text' || attr === 'text')
            return $el.find(tag).text().trim() || $el.text().trim();
        if (attr)
            return $el.find(tag).attr(attr) || $el.attr(attr) || '';
    }
    return '';
}

function isPlayable(url) {
    if (!url) return false;
    const u = url.toLowerCase();
    return ['.mp4', '.m3u8', '.flv', '.ts', '.webm', '.mkv'].some(e => u.includes(e))
        || ['share/', '/token=', '?sign='].some(t => u.includes(t));
}

// ============================================================
// Spider 执行
// ============================================================

function extractRule(code) {
    const start = code.indexOf('var rule = ');
    if (start < 0) return null;

    let depth = 0, braceStart = -1;
    let inStr = false, strChar = '';
    let inSl = false, inMl = false;

    for (let i = start; i < code.length; i++) {
        const ch = code[i];
        const prev = i > 0 ? code[i-1] : '';
        const next = code[i+1] || '';

        if (inSl) { if (ch === '\n') inSl = false; continue; }
        if (inMl) { if (ch === '*' && next === '/') { inMl = false; i++; } continue; }
        if (!inStr) {
            if (ch === '/' && prev === '/') { inSl = true; continue; }
            if (ch === '*' && prev === '/') { inMl = true; continue; }
        }
        if (inStr) {
            if (prev === '\\') continue;
            if (ch === strChar) inStr = false;
            continue;
        }
        if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }

        if (ch === '{') { if (depth++ === 0) braceStart = i; }
        if (ch === '}') {
            if (--depth === 0 && braceStart >= 0) {
                const ruleStr = code.slice(braceStart, i + 1);
                try {
                    const fn = new Function('return (' + ruleStr + ');');
                    return fn();
                } catch { return null; }
            }
        }
    }
    return null;
}

async function runSpider(filePath, testMode) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const rule = extractRule(code);
    const fileName = path.basename(filePath);

    if (!rule) return { name: fileName, error: '无法解析 rule', file: fileName };

    const name = rule.title || fileName;
    const host = rule.host || '';
    const maxVids = testMode ? 3 : 10;
    console.log(`  🕷️ ${name}...`);

    // 获取列表
    const homeUrl = rule.homeUrl || rule.url || '';
    const listRule = rule['一级'] || rule['推荐'] || '';
    
    if (!homeUrl && !listRule.startsWith('js:')) {
        return { name, error: '无 URL', file: fileName };
    }

    let html = '';
    if (homeUrl) {
        const url = homeUrl.startsWith('http') ? homeUrl : host + homeUrl;
        html = await httpGet(url, rule.headers);
        if (!html && !listRule.startsWith('js:')) {
            return { name, error: '请求失败', file: fileName };
        }
    }

    // 解析列表
    const items = parseRule(listRule, html, host + (homeUrl || ''));
    const result = { name, file: fileName, host, videos: [], total_videos: 0, total_episodes: 0, playable_episodes: 0, error: null };

    if (!items.length) return { ...result, error: '列表为空' };

    for (const item of items.slice(0, maxVids)) {
        const vid = item.vod_id;
        if (!vid) continue;

        // 构建详情 URL
        let detailUrl = '';
        if (rule.detailUrl) detailUrl = host + rule.detailUrl.replace('fyid', vid);
        else if (vid.startsWith('http')) detailUrl = vid;
        else detailUrl = host + '/' + vid;

        const dhtml = await httpGet(detailUrl, rule.headers);
        if (!dhtml) continue;

        // 解析播放地址
        let playUrl = '', playFrom = name;
        const detailRule = rule['二级'] || '';
        if (detailRule && detailRule !== '*') {
            if (detailRule.startsWith('json:')) {
                try {
                    const dd = JSON.parse(dhtml);
                    playUrl = dd.vod_play_url || dd.play_url || '';
                    playFrom = dd.vod_play_from || dd.play_from || name;
                } catch {}
            }
        }

        // 没有二级规则时，尝试从页面提取视频
        if (!playUrl) {
            try {
                const $ = cheerio.load(dhtml);
                const vsrc = $('video').attr('src') || $('iframe[src*="m3u8"],iframe[src*="mp4"]').attr('src') || '';
                if (vsrc) playUrl = `正片$${vsrc}`;
            } catch {}
        }

        if (playUrl) {
            const eps = playUrl.split('#').map(e => {
                const s = e.indexOf('$');
                return s > 0 ? { title: e.slice(0, s), url: e.slice(s + 1) } : { title: '', url: e };
            });
            result.videos.push({
                vod_id: vid, name: item.vod_name, pic: item.vod_pic, remarks: item.vod_remarks,
                play_list: eps.map(e => ({ ...e, playable: isPlayable(e.url) })),
            });
            result.total_episodes += eps.length;
            result.playable_episodes += eps.filter(e => isPlayable(e.url)).length;
        }

        await new Promise(r => setTimeout(r, 100));
    }
    result.total_videos = result.videos.length;
    return result;
}

// ============================================================
// 主入口
// ============================================================

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test') || args.includes('-t');
    const specific = args.find(a => !a.startsWith('-'));

    console.log('='.repeat(60));
    console.log('  TVBox Spider 直接解析引擎 v3.0');
    console.log('  跳过 drpy2 运行时，直接解释 rule 规则');
    console.log('='.repeat(60));

    if (specific) {
        const fp = path.join(JS_DIR, specific.endsWith('.js') ? specific : specific + '.js');
        if (!fs.existsSync(fp)) { console.error(`❌ 不存在: ${fp}`); return; }
        const r = await runSpider(fp, testMode);
        if (r.error) console.log(`  ❌ ${r.error}`);
        else {
            console.log(`\n✅ ${r.name}: ${r.total_videos}个视频, ${r.playable_episodes}/${r.total_episodes}个可播放`);
            for (const v of r.videos.slice(0, 5)) {
                console.log(`  📺 ${v.name}`);
                for (const e of v.play_list.slice(0, 3)) console.log(`     ${e.title}: ${e.url.slice(0, 80)}`);
            }
        }
        return;
    }

    // 全量扫描
    const files = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !['模板.js','rules.py'].includes(f));
    console.log(`\n📂 ${files.length} 个文件\n`);

    let success = 0, fail = 0;
    const siteIndex = [];

    for (const file of files) {
        const r = await runSpider(path.join(JS_DIR, file), testMode);
        if (r.error) { fail++; console.log(`  ❌ ${r.name}: ${r.error}`); }
        else if (r.total_videos > 0) {
            success++;
            console.log(`  ✅ ${r.name}: ${r.total_videos}视频 ${r.playable_episodes}/${r.total_episodes}可播`);
            // 保存到 data 目录
            const safe = r.name.replace(/[<>:"/\\|?*.]/g, '_').slice(0, 50);
            const data = {
                name: r.name, host: r.host, file: file,
                total_videos: r.total_videos, total_episodes: r.total_episodes, playable_count: r.playable_episodes,
                episodes: r.videos.flatMap(v => v.play_list.slice(0, 20).map(e => ({
                    vod_name: v.name, title: e.title, url: e.url, playable: e.playable,
                }))),
            };
            fs.writeFileSync(path.join(DATA_DIR, `spider_${safe}.json`), JSON.stringify(data, null, 2), 'utf-8');
            siteIndex.push({ name: r.name, file: `spider_${safe}.json`, source: 'JS-Spider', total: data.total_episodes, playable: data.playable_count });
        } else {
            console.log(`  ⚠️ ${r.name}: 无数据`);
        }
        if (testMode && success + fail >= 20) { console.log('  测试模式: 已达上限'); break; }
    }

    // 合并索引
    const idxFile = path.join(DATA_DIR, 'index.json');
    let idx = fs.existsSync(idxFile) ? JSON.parse(fs.readFileSync(idxFile, 'utf-8')) : [];
    idx = [...idx.filter(s => s.source !== 'JS-Spider'), ...siteIndex];
    // 去重
    const seen = new Set();
    idx = idx.filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true; });
    fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2), 'utf-8');

    // 报告
    fs.writeFileSync(path.join(REPORT_DIR, 'spider-report.json'), JSON.stringify({
        time: new Date().toISOString(), total: files.length, success, fail,
        total_episodes: siteIndex.reduce((s, r) => s + r.total, 0),
        total_playable: siteIndex.reduce((s, r) => s + r.playable, 0),
    }, null, 2), 'utf-8');

    console.log(`\n📊 ${success}/${files.length} 成功, ${fail} 失败`);
    console.log(`   播放地址: ${siteIndex.reduce((s, r) => s + r.total, 0)} 条`);
    console.log(`   可播放:   ${siteIndex.reduce((s, r) => s + r.playable, 0)} 条`);
    console.log(`  📁 data/ 已更新`);
}

main().catch(console.error);
