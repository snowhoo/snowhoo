# -*- coding: utf-8 -*-
"""
修复已抓取但章节顺序错乱的分片数据。
问题：lewx.cc 部分书章节名用中文数字（"第四千五百二十七章"），旧脚本无法解析序号，
导致章节按详情页"最新在前"的混乱顺序原样存入 cNN.json。
本脚本：读取每本书 cNN.json，按标题里的章节序号（中文/阿拉伯）升序重排，按 SHARD 重新分片写回。
幂等：顺序本就正确的书重写后不变。无需联网。

用法：
  python reindex_shards.py            # 全量重排 data/ 下所有有分片的书
  python reindex_shards.py 556830    # 只重排指定书（可多个 id）
"""
import json
import os
import re
import sys
import glob

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SHARD = 50

_CN_NUM = {'零':0,'一':1,'壹':1,'二':2,'两':2,'贰':2,'三':3,'叁':3,'四':4,'肆':4,
           '五':5,'伍':5,'六':6,'陆':6,'七':7,'柒':7,'八':8,'捌':8,'九':9,'玖':9,
           '十':10,'拾':10,'百':100,'佰':100,'千':1000,'仟':1000,'万':10000,'萬':10000}

def cn2num(s):
    total = 0
    cur = 0
    num = 0
    for ch in s:
        v = _CN_NUM.get(ch)
        if v is None:
            return None
        if v < 10:
            num = v
        elif v < 10000:
            if num == 0:
                num = 1
            cur += num * v
            num = 0
        else:  # 万
            if num == 0:
                num = 1
            cur += num
            total += cur * 10000
            cur = 0
            num = 0
    total += cur + num
    return total

def title_idx(ch):
    t = ch.split("\n", 1)[0]
    m = re.search(r"第\s*(\d+)\s*章", t)
    if m:
        return int(m.group(1))
    m = re.search(r"第\s*([零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟萬]+)\s*章", t)
    if m:
        return cn2num(m.group(1))
    return None

def reindex(bid):
    d = os.path.join(DATA_DIR, str(bid))
    if not os.path.isdir(d):
        return False
    shards = sorted(glob.glob(os.path.join(d, "c*.json")))
    if not shards:
        return False
    all_ch = []
    for f in shards:
        try:
            arr = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print("  [WARN] %s 读取失败: %s" % (f, e))
            return False
        if not isinstance(arr, list):
            return False
        all_ch.extend(arr)
    if not all_ch:
        return False
    all_ch.sort(key=lambda c: (0, title_idx(c)) if title_idx(c) is not None else (1, 0))
    need = (len(all_ch) + SHARD - 1) // SHARD
    for i in range(0, len(all_ch), SHARD):
        part = all_ch[i:i + SHARD]
        out = os.path.join(d, "c%02d.json" % (i // SHARD + 1))
        with open(out, "w", encoding="utf-8") as fp:
            json.dump(part, fp, ensure_ascii=False)
    # 删除多余的旧分片
    for extra in range(need + 1, 999):
        ef = os.path.join(d, "c%02d.json" % extra)
        if os.path.exists(ef):
            os.remove(ef)
        else:
            break
    print("reindex %s: %d 章 -> %d 分片" % (bid, len(all_ch), need))
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        for b in sys.argv[1:]:
            reindex(b)
    else:
        count = 0
        for b in sorted(os.listdir(DATA_DIR)):
            if reindex(b):
                count += 1
        print("完成，共重排 %d 本。" % count)
