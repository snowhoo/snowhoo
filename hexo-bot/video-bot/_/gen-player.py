#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
清理旧文件（不再生成 index.html 和 all.js）
数据直接输出为 data/*.js，由 Hexo 项目中的 index.html 加载
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, 'playable', 'data')

# 删除旧的 index.html 和 all.js
for fname in ['index.html', 'all.js']:
    fpath = os.path.join(DATA_DIR, fname)
    if os.path.exists(fpath):
        os.remove(fpath)
        print(f'已删除旧文件: {fname}')

# 删除旧的 .json 文件（只保留 .js）
if os.path.isdir(DATA_DIR):
    for f in os.listdir(DATA_DIR):
        if f.endswith('.json'):
            os.remove(os.path.join(DATA_DIR, f))

print('gen-player.py 已停用，数据文件已切换为纯 .js 格式')