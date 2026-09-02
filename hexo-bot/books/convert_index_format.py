#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把现有 index_cat_*.json 就地转换为「精简新格式」，无需重新抓取。

转换规则（与 lewx.cc.books.py 的 build_meta -> make_index_entry 输出完全一致）：
  - 去掉 tags / book_url / file 三个冗余字段
  - category 去掉 "类别：" 前缀
  - cover 去掉站点固定前缀，改存相对路径 /uploads/allimg/...
  - 其余字段（id/title/author/status/intro/chapter_count/has_content/content_chapters/crawled_at）原样保留
同时按 category 重新分桶，重建 index_meta.json 的 categories 映射。
"""
import os
import re
import json

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://www.lewx.cc"
DATA = os.path.join(HERE, "data")

PREFIXES = ("https://www.lewx.cc", "http://www.lewx.cc")


def convert_entry(e):
    cover = e.get("cover") or ""
    for pre in PREFIXES:
        if cover.startswith(pre):
            cover = cover[len(pre):]
            break
    cat = re.sub(r"^类别[：:]\s*", "", (e.get("category") or "").strip())
    # 内部短键 meta（对应 build_meta 产物）
    meta = {
        "id": e.get("id"),
        "t": e.get("title"),
        "a": e.get("author"),
        "c": cat,
        "s": e.get("status"),
        "cv": cover,
        "i": e.get("intro"),
        "n": e.get("chapter_count"),
        "hc": e.get("has_content"),
        "nc": e.get("content_chapters"),
        "at": e.get("crawled_at"),
    }
    # 对应 make_index_entry(meta)
    return {
        "id": meta["id"],
        "title": meta["t"],
        "author": meta["a"],
        "cover": meta["cv"],
        "category": (meta["c"] or "").strip() or "未分类",
        "status": meta["s"],
        "intro": (meta["i"] or "")[:300],
        "chapter_count": meta["n"],
        "has_content": bool(meta["hc"]),
        "content_chapters": meta["nc"],
        "crawled_at": meta["at"],
    }


def main():
    if not os.path.isdir(DATA):
        print("[ERR] 数据目录不存在:", DATA)
        return
    entries = []
    dropped = set()
    i = 0
    while True:
        fn = os.path.join(DATA, "index_cat_%d.json" % i)
        if not os.path.exists(fn):
            break
        arr = json.load(open(fn, encoding="utf-8"))
        for e in arr:
            if not e or not e.get("id"):
                continue
            before = set(e.keys())
            ne = convert_entry(e)
            dropped |= (before - set(ne.keys()))
            entries.append(ne)
        i += 1
    if not entries:
        print("[WARN] 未找到任何 index_cat_*.json，无需转换。")
        return

    # 重新分桶（与 _write_splits 一致：按 category 排序，每个 category 一本书排序）
    groups = {}
    for e in entries:
        groups.setdefault((e["category"] or "").strip() or "未分类", []).append(e)
    cats = sorted(groups.keys())
    for idx, c in enumerate(cats):
        arr = sorted(groups[c], key=lambda x: (x.get("title") or ""))
        with open(os.path.join(DATA, "index_cat_%d.json" % idx), "w", encoding="utf-8") as f:
            json.dump(arr, f, ensure_ascii=False)
        print("  index_cat_%d.json  <- %s (%d 本)" % (idx, c, len(arr)))

    # 清理多余的 index_cat_*.json
    for fn in os.listdir(DATA):
        if fn.startswith("index_cat_") and fn.endswith(".json"):
            num = fn[len("index_cat_"):-len(".json")]
            if num.isdigit() and int(num) >= len(cats):
                try:
                    os.remove(os.path.join(DATA, fn))
                    print("  清理多余文件:", fn)
                except OSError:
                    pass

    # 重建 index_meta.json
    meta_path = os.path.join(DATA, "index_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        meta = json.load(open(meta_path, encoding="utf-8"))
    meta["categories"] = [
        {"name": c, "file": "index_cat_%d.json" % idx, "count": len(groups[c])}
        for idx, c in enumerate(cats)
    ]
    meta["total"] = len(entries)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)

    print("[DONE] 共转换 %d 本书；删除的冗余字段: %s" % (len(entries), sorted(dropped)))
    print("[INFO] 分类数: %d，分类名: %s" % (len(cats), cats))


if __name__ == "__main__":
    main()
