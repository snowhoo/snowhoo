#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""数据源解析检查 — 仅解析，不爬数据"""

import importlib.util
import sys
import os
import traceback
from datetime import datetime

# UTF-8 输出
try:
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
except Exception:
    # 非交互环境（如任务调度）时 buffer 可能不可用，直接忽略
    pass

try:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ts = datetime.now().strftime('%Y%m%d%H%M%S') + str(datetime.now().microsecond // 100000)
    logpath = os.path.join(BASE_DIR, f'{ts}-source-check.log')

    spec = importlib.util.spec_from_file_location(
        'crawler', os.path.join(BASE_DIR, 'tvbox-crawler-optimized.py')
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    with open(logpath, 'w', encoding='utf-8') as logfile:
        # Tee: 同步输出到控制台和日志文件
        class Tee:
            def __init__(self, a, b):
                self.a = a
                self.b = b
            def write(self, s):
                self.a.write(s)
                self.b.write(s)
            def flush(self):
                self.a.flush()
                self.b.flush()

        saved = sys.stdout
        sys.stdout = Tee(saved, logfile)

        print('数据源解析检查')
        print('=' * 60)

        sites = mod.collect_cmsv10_sites()

        print()
        print('站点列表:')
        for i, s in enumerate(sites, 1):
            tag = '[直接源]' if s.get('is_direct') else '[API]'
            print(f'  {i:2d}. {tag} {s["name"]:30s}  api={s["api"][:80]}')

        print()
        print(f'共 {len(sites)} 个站点')
        print()
        print(f'日志: {logpath}')

        sys.stdout = saved

except Exception as e:
    print(f'错误: {e}')
    traceback.print_exc()
    input('按任意键退出...')
