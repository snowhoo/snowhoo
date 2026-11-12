"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const HEXO = path.resolve(__dirname, "..", "..");
const TARGET = path.join(HEXO, "source", "js", "DailyPoetry.json");
const CWD = HEXO;

// 诗词资源已迁至 Cloudflare R2，本地不再保留诗词库。
// 结构：manifest.json（各分片首数，用于加权等概率）+ 分片 + authors.json。
const R2_BASE = "https://pub-d583e3093dc1438882b43509c1571302.r2.dev/poetry/";

function getJSON(name) {
  return new Promise((resolve, reject) => {
    const req = https.get(R2_BASE + name, { headers: { "User-Agent": "hexo-daily-poetry/1.0" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " : " + name));
      }
      const chunks = [];
      res.on("data", d => chunks.push(d));
      res.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (e) { reject(new Error("JSON 解析失败: " + name + " " + e.message)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("R2 请求超时: " + name)));
  });
}

// 各分片保留原始字段，这里统一成输出所需结构
function normalize(kind, p) {
  switch (kind) {
    case "tang":
      return { author: p.author, paragraphs: p.paragraphs, title: p.title || "无题", dynasty: "唐代" };
    case "ci":
      return { author: p.author, paragraphs: p.paragraphs, title: p.rhythmic || p.title || "词", dynasty: "宋代" };
    case "yuanqu":
      return { author: p.author, paragraphs: p.paragraphs, title: p.title || "元曲", dynasty: "元代" };
    case "shijing":
      return { author: p.chapter + "·" + p.section, paragraphs: p.content, title: p.title, dynasty: "先秦" };
    case "chuci":
      return { author: p.author || "屈原", paragraphs: p.content, title: p.title, dynasty: "先秦" };
    default:
      return null;
  }
}

// 按分片首数加权，保证每首诗被抽中的概率相同
async function pickPoem() {
  const manifest = await getJSON("manifest.json");
  if (!manifest.total || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("manifest.json 无效");
  }
  let r = Math.floor(Math.random() * manifest.total);
  let shard = manifest.files[manifest.files.length - 1];
  for (const f of manifest.files) {
    r -= f.count;
    if (r < 0) { shard = f; break; }
  }
  const list = await getJSON(shard.name);
  if (!Array.isArray(list) || list.length === 0) throw new Error("分片为空: " + shard.name);
  const p = normalize(shard.kind, list[Math.floor(Math.random() * list.length)]);
  if (!p || !p.paragraphs || !p.paragraphs.length) throw new Error("分片数据异常: " + shard.name);
  const authors = await getJSON(manifest.authors || "authors.json");
  return { p, bio: authors[p.author] || "" };
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
  console.log("[update-poetry-json] 开始从 R2 抽取今日诗词...");

  const start = Date.now();
  const { p, bio } = await pickPoem();
  console.log("[update-poetry-json] 抽中 " + p.dynasty + "·" + p.author + "《" + p.title + "》，耗时 " + (Date.now() - start) + "ms");

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

main().catch(e => {
  console.error("[update-poetry-json] 抽取失败: " + e.message);
  process.exit(1);
});
