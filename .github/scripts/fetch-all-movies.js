const fs = require('fs');
const path = require('path');

const AGGREGATE_URL = 'https://xn--6orr3pi6g9uu.top/%E7%A6%81%E6%AD%A2%E8%B4%A9%E5%8D%96/bhvip.json';
const USER_AGENT = 'okhttp/3.12.13';

async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...options.headers },
        ...options
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
    return res.json();
}

async function main() {
    console.log('1. 获取聚合接口...');
    const aggregate = await fetchJSON(AGGREGATE_URL);
    
    // 提取子源列表（兼容 sites 或 sources 字段）
    let subSources = [];
    if (aggregate.sites) subSources = aggregate.sites;
    else if (aggregate.sources) subSources = aggregate.sources;
    else throw new Error('聚合接口中没有 sites 或 sources 字段');

    console.log(`发现 ${subSources.length} 个子源`);

    const allMovies = [];
    for (const src of subSources) {
        const sourceName = src.name || '未知源';
        const apiUrl = src.api || src.url;
        if (!apiUrl) {
            console.warn(`子源 ${sourceName} 缺少 api 地址，跳过`);
            continue;
        }
        console.log(`  正在抓取: ${sourceName} (${apiUrl})`);
        try {
            const data = await fetchJSON(apiUrl);
            // 提取影片列表（兼容 movies 或 sources[].movies）
            let movies = [];
            if (data.movies && Array.isArray(data.movies)) {
                movies = data.movies;
            } else if (data.sources && Array.isArray(data.sources)) {
                for (const s of data.sources) {
                    if (s.movies) movies.push(...s.movies);
                }
            }
            movies.forEach(m => {
                allMovies.push({
                    title: m.title || '无标题',
                    cover: m.cover || '',
                    videoUrl: m.videoUrl || m.url || '',
                    source: sourceName,
                });
            });
            console.log(`    获取到 ${movies.length} 部影片`);
        } catch (err) {
            console.error(`  抓取失败: ${err.message}`);
        }
    }

    console.log(`总共合并 ${allMovies.length} 部影片`);

    // 保存到 source/data/all_movies.json
    const outputPath = path.join(process.cwd(), 'source', 'data', 'all_movies.json');
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({ movies: allMovies }, null, 2));
    console.log(`已保存到 ${outputPath}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});