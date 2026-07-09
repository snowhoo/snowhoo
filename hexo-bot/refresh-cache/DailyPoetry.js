"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const HEXO = "D:\\hexo";
const TARGET = path.join(HEXO, "source", "js", "DailyPoetry.json");
const CWD = HEXO;
const DATA_DIR = path.join(__dirname, "poetry_data");

// 加载作者数据库，构建 name → desc 映射
function loadAuthors() {
  const map = {};
  for (const file of ["authors.tang.json", "authors.song.json", "author.song.json"]) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const a of list) {
          if (a.name && a.desc) map[a.name] = a.desc;
        }
      }
    } catch (e) {
      console.error("[update-poetry-json] 作者库加载失败:", file, e.message);
    }
  }
  return map;
}

// 加载诗词数据库，返回 [{author, paragraphs, title, dynasty}]
function loadPoems() {
  const poems = [];

  // 唐诗: poet.tang.*.json (0 ~ 57000, 步长1000)
  for (let i = 0; i <= 57000; i += 1000) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, "poet.tang." + i + ".json"), "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p.author && p.paragraphs && p.paragraphs.length > 0) {
            poems.push({
              author: p.author,
              paragraphs: p.paragraphs,
              title: p.title || "无题",
              dynasty: "唐代"
            });
          }
        }
      }
    } catch (e) { /* 文件不存在跳过 */ }
  }

  // 宋词: ci.song.*.json (0 ~ 21000, 步长1000)
  for (let i = 0; i <= 21000; i += 1000) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, "ci.song." + i + ".json"), "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const p of list) {
          if (p.author && p.paragraphs && p.paragraphs.length > 0) {
            poems.push({
              author: p.author,
              paragraphs: p.paragraphs,
              title: p.rhythmic || p.title || "词",
              dynasty: "宋代"
            });
          }
        }
      }
    } catch (e) { /* 文件不存在跳过 */ }
  }

  // 元曲: yuanqu.json
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "yuanqu.json"), "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const p of list) {
        if (p.author && p.paragraphs && p.paragraphs.length > 0) {
          poems.push({
            author: p.author,
            paragraphs: p.paragraphs,
            title: p.title || "元曲",
            dynasty: "元代"
          });
        }
      }
    }
  } catch (e) { /* 文件不存在跳过 */ }

  // 诗经: shijing.json
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "shijing.json"), "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const p of list) {
        if (p.content && p.content.length > 0) {
          poems.push({
            author: p.chapter + "·" + p.section,
            paragraphs: p.content,
            title: p.title,
            dynasty: "先秦"
          });
        }
      }
    }
  } catch (e) { /* 文件不存在跳过 */ }

  // 楚辞: chuci.json
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, "chuci.json"), "utf8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      for (const p of list) {
        if (p.content && p.content.length > 0) {
          poems.push({
            author: p.author || "屈原",
            paragraphs: p.content,
            title: p.title,
            dynasty: "先秦"
          });
        }
      }
    }
  } catch (e) { /* 文件不存在跳过 */ }

  return poems;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: CWD, shell: true });
    let out = "";
    p.stdout.on("data", d => { process.stdout.write(d); out += d; });
    p.stderr.on("data", d => { process.stderr.write(d); out += d; });
    p.on("close", code => resolve({ code, out }));
  });
}

async function main() {
  console.log("[update-poetry-json] 开始获取今日诗词...");

  const start = Date.now();
  const poems = loadPoems();
  const authorMap = loadAuthors();
  console.log("[update-poetry-json] 加载完成: " + poems.length + " 首诗词, " + Object.keys(authorMap).length + " 位作者, 耗时 " + (Date.now() - start) + "ms");

  if (poems.length === 0) {
    console.error("[update-poetry-json] 诗词库为空，退出");
    process.exit(1);
  }

  const p = poems[Math.floor(Math.random() * poems.length)];
  const bio = authorMap[p.author] || "";
  const poem = {
    fetchedAt: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    line: p.paragraphs[0],
    author: p.author,
    dynasty: p.dynasty,
    title: p.title,
    detail: {
      content: p.paragraphs,
      author: p.author,
      dynasty: p.dynasty,
      biography: bio
    }
  };

  const jsDir = path.dirname(TARGET);
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(poem, null, 2), "utf8");
  console.log("[update-poetry-json] 已写入: " + poem.line + " - " + poem.author + "《" + poem.title + "》");
  if (bio) console.log("[update-poetry-json] 作者生平: " + bio.substring(0, 80) + "...");

  await run("git", ["add", "source/js/DailyPoetry.json"]);
  fs.writeFileSync(path.join(CWD, ".commit_msg"), "daily poetry update", "utf8");
  const r = await run("git", ["commit", "-F", ".commit_msg"]);
  if (r.code === 0) {
    await run("git", ["push", "origin", "source"]);
    console.log("[update-poetry-json] 推送完成");
  } else {
    console.log("[update-poetry-json] 无变化或提交失败: " + r.out);
  }
}
main();