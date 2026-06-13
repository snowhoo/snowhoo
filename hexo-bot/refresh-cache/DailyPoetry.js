"use strict";
const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const HEXO = "D:\\hexo";
const TARGET = path.join(HEXO, "source", "js", "DailyPoetry.json");
const CWD = HEXO;

const TOKEN_FILE = path.join(__dirname, "poetry_token.json");

function loadToken() {
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")).token || ""; } catch(e) { return ""; }
}
function saveToken(token) {
  if (!token) return;
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, updatedAt: Date.now() }), "utf8");
}

// 获取或加载 token
async function getToken() {
  var token = loadToken();
  if (token) return token;
  return new Promise((resolve) => {
    https.get("https://v2.jinrishici.com/token", { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          var j = JSON.parse(data);
          if (j.status === "success" && j.data) { saveToken(j.data); resolve(j.data); }
          else resolve("");
        } catch(e) { resolve(""); }
      });
    }).on("error", () => resolve(""));
  });
}

function fetchPoem() {
  return new Promise(async (resolve) => {
    var token = await getToken();
    if (!token) { resolve(null); return; }
    // 使用高级 JSON 接口，通过 X-User-Token 头部保持同一身份，服务端自动去重
    var url = "https://v2.jinrishici.com/sentence";
    var headers = { "Accept": "application/json", "X-User-Token": token };
    https.get(url, { headers: headers }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const j = JSON.parse(data);
          if (j.status === "success" && j.data) {
            // 保存 token，下次请求带上避免地理定位固定池
            if (j.token) saveToken(j.token);
            const d = j.data;
            resolve({
              fetchedAt: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
              line: d.content,
              author: d.origin && d.origin.author ? d.origin.author : "佚名",
              dynasty: (d.origin && d.origin.dynasty) || "古代",
              title: d.origin ? (typeof d.origin === "string" ? d.origin : d.origin.title) : "诗词",
              detail: d.origin && typeof d.origin !== "string" ? {
                content: d.origin.content,
                author: d.origin.author,
                dynasty: d.origin.dynasty,
                biography: ""
              } : null
            });
            return;
          }
        } catch (e) {}
        resolve(null);
      });
    }).on("error", () => resolve(null));
  });
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
  const poem = await fetchPoem();
  if (!poem) { console.error("[update-poetry-json] API 获取失败，退出"); process.exit(1); }
  const jsDir = path.dirname(TARGET);
  if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
  fs.writeFileSync(TARGET, JSON.stringify(poem, null, 2), "utf8");
  console.log("[update-poetry-json] 已写入: " + poem.line + " - " + poem.author);
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