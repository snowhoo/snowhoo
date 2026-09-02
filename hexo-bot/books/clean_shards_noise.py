# -*- coding: utf-8 -*-
"""
批量清理已抓取正文分片里的站点注入噪音（与 lewx.cc.books.py 的 FOOTER_MARKERS 规则一致）。
- 噪音类型：.ntp CSS、正文尾部广告（下载阅读器/求收藏/求点赞…）、if(isMobile()){…}" JS 注入块
- 记录格式为 "标题\n正文"，只对正文部分做尾部截断，避免误伤标题
- 只重写真正含噪音的分片，幂等（重复跑无副作用）
用法：
  python clean_shards_noise.py            # 实际清理
  python clean_shards_noise.py --dry-run  # 仅统计，不写盘
"""
import os, re, json, sys, ast, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
LOG_PATH = os.path.join(HERE, "clean_noise.log")


# 同时把输出写到控制台 + clean_noise.log（不依赖外部 tee，避免 bat 管道崩溃）
class _Tee:
    def __init__(self, *streams):
        self.streams = streams
    def write(self, s):
        for st in self.streams:
            try:
                st.write(s)
            except Exception:
                pass
    def flush(self):
        for st in self.streams:
            try:
                st.flush()
            except Exception:
                pass


def _setup_tee():
    try:
        f = open(LOG_PATH, "a", encoding="utf-8")
    except Exception:
        return
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    f.write("\n===== clean run %s =====\n" % ts)
    f.flush()
    sys.stdout = _Tee(sys.stdout, f)

# 从爬虫脚本里抽取 FOOTER_MARKERS，保证与抓取时用的规则同步
def load_footer_markers():
    src = open(os.path.join(HERE, "lewx.cc.books.py"), encoding="utf-8").read()
    m = re.search(r"FOOTER_MARKERS\s*=\s*\((.*?)\)\s*\n", src, re.S)
    if not m:
        raise RuntimeError("未能从 lewx.cc.books.py 解析 FOOTER_MARKERS")
    return ast.literal_eval("(" + m.group(1) + ")")

FOOTER_MARKERS = load_footer_markers()

NTP1 = re.compile(r"\.ntp\*?\{[^}]*\}")
NTP2 = re.compile(r"\.ntp;n;}")
ISMOBILE = re.compile(r"if\(isMobile\(\)\)\s*\{.*?\}\s*\"", re.S)


def has_noise(body):
    if NTP1.search(body) or NTP2.search(body) or ISMOBILE.search(body):
        return True
    for mk in FOOTER_MARKERS:
        if mk in body:
            return True
    return False


def clean_body(body):
    body = NTP1.sub("", body)
    body = NTP2.sub("", body)
    cut = len(body)
    for mk in FOOTER_MARKERS:
        i = body.find(mk)
        if i != -1 and i < cut:
            cut = i
    if cut < len(body):
        body = body[:cut]
    body = ISMOBILE.sub("", body)
    return body.strip()


def clean_record(rec):
    if "\n" in rec:
        title, body = rec.split("\n", 1)
    else:
        title, body = rec, ""
    if not has_noise(body):
        return rec, False
    new_body = clean_body(body)
    return (title + "\n" + new_body) if new_body else title, True


def main():
    _setup_tee()
    dry = "--dry-run" in sys.argv
    files = []
    for root, _, fns in os.walk(DATA_DIR):
        for fn in fns:
            if fn.startswith("c") and fn.endswith(".json"):
                files.append(os.path.join(root, fn))
    files.sort()
    print("[INFO] 发现分片文件 %d 个（dry-run=%s）" % (len(files), dry))

    total_files = 0
    total_recs = 0
    total_changed = 0
    total_bytes_saved = 0

    for fp in files:
        try:
            arr = json.load(open(fp, encoding="utf-8"))
        except Exception as e:
            print("  [WARN] 读取失败 %s : %s" % (fp, e))
            continue
        if not isinstance(arr, list):
            continue
        total_files += 1
        new_arr = []
        changed_any = False
        for rec in arr:
            total_recs += 1
            if not isinstance(rec, str):
                new_arr.append(rec)
                continue
            nr, changed = clean_record(rec)
            if changed:
                changed_any = True
                total_changed += 1
                total_bytes_saved += (len(rec.encode("utf-8")) - len(nr.encode("utf-8")))
            new_arr.append(nr)
        if changed_any and not dry:
            json.dump(new_arr, open(fp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print("[RESULT] 扫描分片文件 %d 个，记录 %d 条" % (total_files, total_recs))
    print("[RESULT] 含噪音记录 %d 条%s" % (total_changed, "（已清理并写回）" if not dry else "（未写盘）"))
    if not dry:
        print("[RESULT] 估计减少字节 %d (%.2f MB)" % (total_bytes_saved, total_bytes_saved / 1048576.0))
    print("[DONE]")


if __name__ == "__main__":
    main()
