#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""无窗口启动 books_poller.py。

由 Windows 计划任务（\Hexo-Bot\BooksPoller）以 pythonw.exe 调用，故不弹 cmd 窗口。
仅做一件事：把 stdout/stderr 重定向追加到 poller.log，再调用 books_poller.main()。
其余逻辑、配置、工作目录全部沿用 books_poller.py 本身。
"""
import os
import sys

HERE = r"D:\hexo\hexo-bot\books"
LOG = os.path.join(HERE, "poller.log")

try:
    # 沿用历史 poller.log 的 GBK 编码，避免中文出现乱码（原 cmd 重定向即 GBK）
    sys.stdout = open(LOG, "a", buffering=1, encoding="gbk")
    sys.stderr = sys.stdout
except Exception:
    pass

os.chdir(HERE)

import books_poller

if __name__ == "__main__":
    try:
        books_poller.main()
    except Exception as e:
        print("[run_poller] 异常:", e)
        raise
