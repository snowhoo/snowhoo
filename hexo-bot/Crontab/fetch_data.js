const fs = require('fs');
const path = require('path');

// ==================== 配置 ====================
const AGGREGATE_URL = 'https://xn--6orr3pi6g9uu.top/%E7%A6%81%E6%AD%A2%E8%B4%A9%E5%8D%96/bhvip.json';
const OUTPUT_DIR = 'D:\\temp';            // 临时输出目录
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'all_movies.json');
const USER_AGENT = 'okhttp/3.12.13';      // 伪装 TVBox
const TIMEOUT_MS = 15000;                 // 每个请求超时 15 秒
const MAX_RETRIES = 2;                    // 子源请求失败重试次数

// ==================== 辅助函数 ====================
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 安全的 JSON 请求（支持重试、超时、User-Agent）
async function fetchJSON(url, retries = MAX_RETRIES) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // 尝试解析 JSON，如果是 JSONP 则提取对象部分
        try {
            return JSON.parse(text);
        } catch (e) {
            const match = text.match(/(\{.*\})/s);
            if (match) return JSON.parse(match[1]);
            throw new Error(`Not valid JSON: ${text.slice(0, 100)}`);
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (retries > 0) {
            console.warn(`  请求失败，剩余重试次数 ${retries}: ${err.message}`);
            await sleep(2000);
            return fetchJSON(url, retries - 1);
        }
        throw err;
    }
}

// 从子源返回的数据中提取影片列表（兼容多种格式）
function extractMovies(data, sourceName) {
    let movies = [];

    // 常见字段：list, movies, vod_list, data
    if (data.list && Array.isArray(data.list)) movies = data.list;
    else if (data.movies && Array.isArray(data.movies)) movies = data.movies;
    else if (data.vod_list && Array.isArray(data.vod_list)) movies = data.vod_list;
    else if (data.data && Array.isArray(data.data)) movies = data.data;
    else if (data.sources && Array.isArray(data.sources)) {
        // 某些源使用 sources 嵌套
        for (const src of data.sources) {
            if (src.movies) movies.push(...src.movies);
            else if (src.list) movies.push(...src.list);
        }
    }

    // 映射字段：title, cover, videoUrl
    return movies.map(item => {
        const title = item.vod_name || item.name || item.title || '';
        const cover = item.vod_pic || item.cover || item.pic || '';
        let videoUrl = item.vod_play_url || item.play_url || item.url || '';
        // 如果 videoUrl 是 JSON 字符串（例如多个播放源），取第一个
        if (videoUrl && (videoUrl.startsWith('{') || videoUrl.startsWith('['))) {
            try {
                const parsed = JSON.parse(videoUrl);
                if (Array.isArray(parsed) && parsed.length > 0) videoUrl = parsed[0];
                else if (typeof parsed === 'object') videoUrl = Object.values(parsed)[0] || '';
            } catch(e) {}
        }
        // 只保留有效的 videoUrl（非空且以 http 开头）
        if (!videoUrl || !videoUrl.startsWith('http')) return null;
        return {
            title: title || '无标题',
            cover: cover || '',
            videoUrl: videoUrl,
            source: sourceName
        };
    }).filter(m => m !== null);
}

// ==================== 主流程 ====================
async function main() {
    console.log(`[${new Date().toISOString()}] 开始抓取聚合数据...`);

    // 1. 获取聚合接口（子源列表）
    let aggregate;
    try {
        aggregate = await fetchJSON(AGGREGATE_URL);
        console.log('聚合接口获取成功');
    } catch (err) {
        console.error('聚合接口请求失败:', err.message);
        process.exit(1);
    }

    // 提取子源列表
    let subSources = [];
    if (aggregate.sites) subSources = aggregate.sites;
    else if (aggregate.sources) subSources = aggregate.sources;
    else {
        console.error('聚合接口中未找到 sites 或 sources 字段');
        process.exit(1);
    }
    console.log(`共发现 ${subSources.length} 个子源`);

    const allMovies = [];
    for (const src of subSources) {
        const sourceName = src.name || '未知源';
        let apiUrl = src.api || src.url;
        if (!apiUrl || (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://'))) {
            console.warn(`跳过无效子源: ${sourceName} (api: ${apiUrl})`);
            continue;
        }
        console.log(`正在抓取: ${sourceName} (${apiUrl})`);
        try {
            const data = await fetchJSON(apiUrl);
            const movies = extractMovies(data, sourceName);
            console.log(`  获取到 ${movies.length} 部有效影片`);
            allMovies.push(...movies);
        } catch (err) {
            console.error(`  抓取失败: ${err.message}`);
        }
        // 避免请求过快
        await sleep(500);
    }

    console.log(`总计获取影片: ${allMovies.length} 部`);

    // 简单去重：按标题+来源去重（保留第一个）
    const unique = [];
    const seen = new Set();
    for (const m of allMovies) {
        const key = `${m.title}|${m.source}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(m);
        }
    }
    console.log(`去重后影片: ${unique.length} 部`);

    // 确保输出目录存在
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    const outputData = { movies: unique };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`✅ 数据已保存到 ${OUTPUT_PATH}`);
}

// 运行主函数
main().catch(err => {
    console.error('脚本执行出错:', err);
    process.exit(1);
});