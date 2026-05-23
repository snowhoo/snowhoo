// refresh-history-cache.js - pure Node.js, no PowerShell encoding issues
// Run by: node D:\hexo\refresh-history-cache-node.js
// Scheduled task calls this instead of .ps1

const fs = require('fs');
const { execSync } = require('child_process');

const apiUrl = 'https://query.asilu.com/today/list/';
const jsonFile = 'D:\\hexo\\source\\js\\HistoryToday.json';

function fetchApi(url) {
    const mod = url.startsWith('https') ? require('https') : require('http');
    return new Promise((resolve, reject) => {
        const opts = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        };
        mod.get(url, opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function toChineseDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}年${m}月${dd}日`;
}

function runGit(cmd, cwd) {
    try {
        const r = execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { ok: true, out: r.trim() };
    } catch (e) {
        return { ok: false, err: e.message, status: e.status };
    }
}

async function main() {
    console.log('[API] Fetching ' + apiUrl);
    const body = await fetchApi(apiUrl);
    const json = JSON.parse(body);

    if (json.code !== 200) {
        console.error('[ERR] API code ' + json.code);
        process.exit(1);
    }

    const today = new Date();
    const dateStr = toChineseDate(today);

    const events = json.data.map(item => ({
        year: item.year,
        text: item.title,
        link: item.link,
        type: item.type
    }));

    const cacheData = { date: dateStr, events: events };
    const cacheJson = JSON.stringify(cacheData, null, 0);

    fs.writeFileSync(jsonFile, cacheJson, 'utf8');
    console.log('[OK] Written ' + jsonFile + ' - ' + events.length + ' events');

    // git timestamp
    const gitTs = runGit('git log -1 --format="%ai"', 'D:\\hexo');
    const ts = gitTs.ok
        ? gitTs.out.replace(/[ :]/g, '-').substring(0, 19)
        : new Date().toISOString().replace(/[-:T]/g, '').substring(0, 19);
    console.log('[GIT] ts: ' + ts + ' (git ok: ' + gitTs.ok + ')');

    // git add
    const add = runGit('git add "source/js/historyDay.json"', 'D:\\hexo');
    console.log('[GIT] add ok: ' + add.ok + (add.err ? ' err: ' + add.err : ''));

    // git commit
    const commit = runGit('git commit -m "[Bot] Auto refresh historyDay ' + ts + '"', 'D:\\hexo');
    console.log('[GIT] commit ok: ' + commit.ok + (commit.err ? ' err: ' + commit.err : ''));

    // git push
    const push = runGit('git push origin source', 'D:\\hexo');
    console.log('[GIT] push ok: ' + push.ok + (push.err ? ' err: ' + push.err : ''));
}

main().catch(e => { console.error('[ERR] ' + e.message); process.exit(1); });
