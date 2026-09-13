#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""归档汇总请求处理（后端，由 Windows 计划任务调用）。

读取 Waline 中 /kaoqing/archive-request 的「归档并汇总」请求记录；
若存在请求，则运行 _1a2m3w4s.bat（归档 → 建表 → 写表 → 发邮件）；
  - 运行成功(returncode==0) → 删除 Waline 中的请求记录（避免重复执行）；
  - 运行失败                → 保留请求记录（下次计划任务重试）。

带锁文件(_C_request.lock)防止同一时刻并发运行。
手动运行：py _C_request.py        （也可由 _C_run.bat / 计划任务触发）
"""
import os
import sys
import json
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
# 复用 books 下的 upload_r2.py（R2 上传模块 + 凭证，多个 bot 共用，凭证不进前端）。
sys.path.insert(0, r"D:\hexo\hexo-bot\books")
import upload_r2   # 提供 load_config() / put_object() / list_objects()

# waline 管理员令牌：与 kaoqing.html / _archiver.py 同款混淆（避免明文被随手抓取）。
# 环境变量 WALINE_ADMIN_TOKEN 可覆盖。
TK_SEED = '8kQ~zL#'
TK_OBF  = 'CA4WRzEWZlo5Og8xCkpdHgZHLhh8Xg8CGhgdYggKIkgeKFVUPT0VDn0ObkUAM1R1aVElYDcAGWpyAh4XGQtBUCEoGw=='


def _tk_deobf():
    import base64
    b = base64.b64decode(TK_OBF)
    s = ''.join(chr(b[i] ^ ord(TK_SEED[i % len(TK_SEED)])) for i in range(len(b)))
    return s[::-1]


def load_cfg():
    cfg = {
        "waline_server": os.environ.get("WALINE_SERVER", "https://waline.snowhoo.net"),
        "waline_admin_token": os.environ.get("WALINE_ADMIN_TOKEN", _tk_deobf()),
    }
    p = os.path.join(HERE, "poller_config.json")
    if os.path.exists(p):
        try:
            cfg.update(json.load(open(p, encoding="utf-8")))
        except Exception as e:
            print("[WARN] poller_config.json:", e)
    return cfg


CFG = load_cfg()
WALINE_SERVER = (CFG["waline_server"] or "https://waline.snowhoo.net").rstrip("/")
TOKEN = CFG["waline_admin_token"] or ""

ARCHIVE_REQ_PATH = "/kaoqing/archive-request"   # 前端「归档并汇总」按钮写入的请求通道
BAT = os.path.join(HERE, "_1a2m3w4s.bat")        # 完整流水线：归档→建表→写表→发邮件
LOCK = os.path.join(HERE, "_C_request.lock")      # 并发锁


# ----------------------------- Waline REST -----------------------------
def waline_req(method, path, *, token=None, params=None, body=None):
    import urllib.request
    import urllib.parse
    url = WALINE_SERVER + path
    q = []
    if params:
        for k, v in params.items():
            q.append("%s=%s" % (k, urllib.parse.quote(str(v), safe="")))
    if token:
        q.append("token=" + urllib.parse.quote(token, safe=""))
    if q:
        url += "?" + "&".join(q)
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _same_url(field, path):
    """评论自带的 url 字段是否等于目标 path（兼容 URL 编码差异）。"""
    if field is None:
        return False
    a = str(field)
    if a == path:
        return True
    try:
        import urllib.parse
        return urllib.parse.unquote(a) == urllib.parse.unquote(path)
    except Exception:
        return False


def list_all_comments():
    """拉取 Waline 整个实例的全部评论（type=list 忽略 url，本就返回全实例），翻完所有分页。"""
    all_c = []
    page = 1
    while True:
        resp = waline_req("GET", "/api/comment",
                          params={"type": "list", "page": page, "pageSize": 100}, token=TOKEN)
        d = resp.get("data") or {}
        arr = d.get("data") or []
        if not arr:
            break
        all_c.extend(arr)
        total_pages = d.get("totalPages") or 0
        if total_pages and page >= total_pages:
            break
        if len(arr) < 100:
            break
        page += 1
    return all_c


def list_archive_requests():
    """列出 /kaoqing/archive-request 下的请求评论（按评论自身 url 精确过滤）。"""
    all_c = list_all_comments()
    matched = [c for c in all_c if _same_url(c.get("url"), ARCHIVE_REQ_PATH)]
    if len(matched) != len(all_c):
        print("[INFO] 接口返回全实例 %d 条 → 按 url 精确过滤后请求通道命中 %d 条"
              % (len(all_c), len(matched)))
    return matched


def delete_request(oid):
    waline_req("DELETE", "/api/comment/%d" % int(oid), token=TOKEN)


# ----------------------------- 主流程 -----------------------------
def run_bat():
    """运行完整流水线 bat；stdin=DEVNULL 避免末尾 pause 卡住。返回 returncode。"""
    if not os.path.exists(BAT):
        print("[ERR] 找不到流水线脚本: %s" % BAT)
        return 2
    print("[RUN] %s" % BAT)
    proc = subprocess.run(
        [r"cmd.exe", "/c", BAT],
        cwd=HERE,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.stdout:
        for line in proc.stdout.splitlines():
            print("   | " + line)
    return proc.returncode


def main():
    if os.path.exists(LOCK):
        print("[SKIP] 另一实例正在运行（锁文件 %s 存在），本次跳过。" % LOCK)
        return 0
    try:
        open(LOCK, "w").close()
        reqs = list_archive_requests()
        if not reqs:
            print("[INFO] 无归档汇总请求，退出。")
            return 0
        print("[INFO] 发现 %d 条归档汇总请求，开始执行流水线…" % len(reqs))
        rc = run_bat()
        if rc != 0:
            print("[WARN] 流水线返回非零(%d)，保留请求记录，下次计划任务将重试。" % rc)
            return 1
        # 成功 → 删除 Waline 中的请求记录（避免重复执行）
        removed = 0
        for c in reqs:
            oid = int(c.get("objectId") or 0)
            try:
                delete_request(oid)
                removed += 1
            except Exception as e:
                print("[WARN] 删除请求评论 #%d 失败: %s" % (oid, e))
        print("[OK] 归档汇总完成，已删除 %d 条请求记录。" % removed)
        return 0
    finally:
        try:
            os.remove(LOCK)
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
