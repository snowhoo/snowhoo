#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TVBox 爬虫编排脚本 v2.0
======================
功能:
  1. 生成 15 位时间戳日志文件 (YYYYMMDDHHMMSSf.log)，放在 video-bot 根目录
  2. UTF-8 日志，彻底解决乱码
  3. 调用爬虫 + Git Push，全程日志记录
  4. Push 失败时重试并记录详细错误

用法:
  python run.py                  # 完整运行
  python run.py --test           # 测试模式
  python run.py --site 站点名     # 爬指定站点
"""

import os
import sys
import subprocess
import time
import io
from datetime import datetime

# ── 路径配置 ──────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 日志直接放在 video-bot 根目录
CRAWLER_SCRIPT = os.path.join(BASE_DIR, 'tvbox-crawler-optimized.py')
HEXO_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', '..'))

# Git 配置
GIT_USER_NAME = 'snowhoo'
GIT_USER_EMAIL = 'snowhoo@example.com'
GIT_REMOTE = 'origin'
GIT_BRANCH = 'source'
GIT_DATA_PATH = 'source/js/sevencolor/3/data'
GIT_COMMIT_MSG = 'chore: auto-update TVBox video data'

# Push 重试配置
PUSH_MAX_RETRIES = 3
PUSH_RETRY_DELAY = 10  # 秒


def generate_log_filename():
    """生成 15 位数字时间戳日志文件名: YYYYMMDDHHMMSSf"""
    now = datetime.now()
    base = now.strftime('%Y%m%d%H%M%S')  # 14 digits
    tenth = now.microsecond // 100000      # 1 digit (0-9)
    return f'{base}{tenth}.log'            # 15-digit prefix + .log


def setup_utf8_stdout():
    """为 Windows CMD 设置 UTF-8 输出"""
    if sys.platform == 'win32':
        # 重新配置 stdout 为 UTF-8
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding='utf-8', errors='replace'
        )
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding='utf-8', errors='replace'
        )


class TeeLogger:
    """同时输出到控制台和日志文件（UTF-8 编码）"""

    def __init__(self, log_path):
        self.log_path = log_path
        self.log_file = open(log_path, 'w', encoding='utf-8')
        self.stdout = sys.stdout
        self.stderr = sys.stderr

    def write(self, message):
        self.stdout.write(message)
        self.log_file.write(message)

    def flush(self):
        self.stdout.flush()
        self.log_file.flush()

    def close(self):
        self.log_file.close()

    def log(self, *args, sep=' ', end='\n'):
        """便捷 log 方法"""
        msg = sep.join(str(a) for a in args) + end
        self.write(msg)
        self.flush()

    def __call__(self, *args, **kwargs):
        """支持直接调用 logger(msg) 等同于 logger.log(msg)"""
        self.log(*args, **kwargs)


def run_cmd(cmd, cwd=None, timeout=120, log=None):
    """
    执行命令并实时输出到 log。
    返回 (returncode, stdout_text, stderr_text)
    """
    if log is None:
        log = _default_log

    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'

    log(f'[CMD] {cmd}', end='')
    if cwd:
        log(f'  (cwd={cwd})', end='')
    log()

    try:
        proc = subprocess.Popen(
            cmd,
            shell=True,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            encoding='utf-8',
            errors='replace',
        )

        stdout_lines = []
        stderr_lines = []

        # 实时读取 stdout
        for line in proc.stdout:
            line = line.rstrip('\n')
            log(line)
            stdout_lines.append(line)

        proc.wait(timeout=timeout)

        stderr_text = proc.stderr.read()
        if stderr_text.strip():
            log(f'[STDERR] {stderr_text.strip()}')

        return proc.returncode, '\n'.join(stdout_lines), stderr_text

    except subprocess.TimeoutExpired:
        proc.kill()
        log(f'[ERROR] 命令超时 ({timeout}s)')
        return -1, '', 'Timeout'
    except Exception as e:
        log(f'[ERROR] 命令执行失败: {e}')
        return -1, '', str(e)


def git_push(log):
    """执行 Git Push，带重试和详细错误捕获"""
    log('─' * 50)
    log('[GIT] 开始 Git Push 流程...')

    # 1. 配置 Git 用户信息
    run_cmd(f'git config user.name "{GIT_USER_NAME}"', cwd=HEXO_DIR, log=log)
    run_cmd(f'git config user.email "{GIT_USER_EMAIL}"', cwd=HEXO_DIR, log=log)

    # 2. 检查是否有变化
    rc, stdout, stderr = run_cmd(
        f'git diff --quiet -- "{GIT_DATA_PATH}"',
        cwd=HEXO_DIR,
        log=log,
    )

    if rc == 0:
        log('[GIT] 数据无变化，跳过 Push')
        return True

    log('[GIT] 检测到数据变化，准备提交...')

    # 3. git add
    rc, stdout, stderr = run_cmd(
        f'git add "{GIT_DATA_PATH}"',
        cwd=HEXO_DIR,
        log=log,
    )
    if rc != 0:
        log(f'[GIT] ❌ git add 失败: {stderr}')
        return False

    # 4. git commit
    rc, stdout, stderr = run_cmd(
        f'git commit -m "{GIT_COMMIT_MSG}"',
        cwd=HEXO_DIR,
        log=log,
    )
    if rc != 0:
        log(f'[GIT] ⚠️  git commit 返回 {rc}: {stderr}')
        # commit 可能因为"nothing to commit"而失败，这不影响 push
        if 'nothing to commit' in stderr.lower() or 'nothing to commit' in stdout.lower():
            log('[GIT] 无新数据需要提交')
            return True

    # 5. git push（带重试）
    log(f'[GIT] Push 到 {GIT_REMOTE}/{GIT_BRANCH}（最多重试 {PUSH_MAX_RETRIES} 次）...')

    push_cmd = f'git push {GIT_REMOTE} {GIT_BRANCH}'

    for attempt in range(1, PUSH_MAX_RETRIES + 1):
        log(f'[GIT] Push 尝试 {attempt}/{PUSH_MAX_RETRIES}...')

        try:
            proc = subprocess.Popen(
                push_cmd,
                shell=True,
                cwd=HEXO_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding='utf-8',
                errors='replace',
            )

            stdout_text, stderr_text = proc.communicate(timeout=300)

            if stdout_text.strip():
                log(stdout_text.strip())
            if stderr_text.strip():
                log(f'[GIT STDERR] {stderr_text.strip()}')

            if proc.returncode == 0:
                log('[GIT] ✅ Push 成功！')
                return True

            # 分析失败原因
            combined = (stdout_text + stderr_text).lower()
            if 'permission denied' in combined or 'could not read from remote' in combined:
                log('[GIT] ❌ SSH 认证失败，不再重试')
                return False
            if 'non-fast-forward' in combined:
                log('[GIT] ❌ 非快进推送（远程有新提交），不再重试')
                return False
            if 'failed to push' in combined or 'error:' in combined:
                log(f'[GIT] ⚠️  Push 失败 (code={proc.returncode})，{PUSH_RETRY_DELAY}秒后重试...')
                if attempt < PUSH_MAX_RETRIES:
                    time.sleep(PUSH_RETRY_DELAY)
                    continue
            else:
                log(f'[GIT] ⚠️  Push 返回非零 (code={proc.returncode})')

        except subprocess.TimeoutExpired:
            proc.kill()
            log(f'[GIT] ⚠️  Push 超时，{PUSH_RETRY_DELAY}秒后重试...')
            if attempt < PUSH_MAX_RETRIES:
                time.sleep(PUSH_RETRY_DELAY)
                continue
        except Exception as e:
            log(f'[GIT] ❌ Push 异常: {e}')
            if attempt < PUSH_MAX_RETRIES:
                time.sleep(PUSH_RETRY_DELAY)
                continue

    log('[GIT] ❌ Push 最终失败（已重试全部次数）')
    return False


def main():
    """主流程"""
    # 1. 生成日志文件名（15位时间戳），直接放在 video-bot 根目录
    log_filename = generate_log_filename()
    log_path = os.path.join(BASE_DIR, log_filename)

    # 2. 设置 UTF-8 输出
    setup_utf8_stdout()

    # 3. 初始化 TeeLogger（双写控制台 + 文件）
    logger = TeeLogger(log_path)
    global _default_log
    _default_log = logger

    start_time = datetime.now()
    logger.log('=' * 60)
    logger.log(f'  TVBox 爬虫编排 v2.0')
    logger.log(f'  开始时间: {start_time.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]}')
    logger.log(f'  日志文件: {log_path}')
    logger.log('=' * 60)

    success = True

    try:
        # 4. 运行爬虫
        logger.log('─' * 50)
        logger.log('[CRAWL] 开始爬取...')

        # 传递命令行参数给爬虫
        args = sys.argv[1:]
        rc, stdout, stderr = run_cmd(
            f'python "{CRAWLER_SCRIPT}" {" ".join(args)}',
            cwd=BASE_DIR,
            timeout=3600,  # 1 小时超时
            log=logger,
        )

        if rc != 0:
            logger.log(f'[CRAWL] ❌ 爬虫失败 (exit code={rc})')
            success = False
        else:
            logger.log('[CRAWL] ✅ 爬虫完成')

        # 5. Git Push
        push_ok = git_push(logger)
        if not push_ok:
            success = False

    except KeyboardInterrupt:
        logger.log('\n[ABORT] 用户中断')
        success = False
    except Exception as e:
        import traceback
        logger.log(f'[FATAL] 未捕获异常: {e}')
        logger.log(traceback.format_exc())
        success = False

    # 6. 收尾
    end_time = datetime.now()
    elapsed = end_time - start_time
    logger.log('=' * 60)
    logger.log(f'  结束时间: {end_time.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]}')
    logger.log(f'  总耗时: {str(elapsed).split(".")[0]}')
    logger.log(f'  结果: {"✅ 成功" if success else "❌ 失败"}')
    logger.log(f'  日志: {log_path}')
    logger.log('=' * 60)

    logger.close()
    return 0 if success else 1


if __name__ == '__main__':
    _default_log = None
    sys.exit(main())
