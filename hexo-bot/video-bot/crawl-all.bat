@echo off
chcp 65001 >nul
setlocal
title TVBox Crawl

REM ── 环境配置 ──────────────────────────────────────────
set "BOT_DIR=%~dp0"
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;%PATH%"
set "HOME=%USERPROFILE%"
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

REM ── 进入项目目录并运行编排脚本 ──────────────────────────
cd /d "%BOT_DIR%"
python run.py %*
if %ERRORLEVEL% NEQ 0 (
    echo 运行出错，检查上方日志
)

REM ── 无论成败都暂停以便查看 ─────────────────────────────
pause
exit /b %ERRORLEVEL%
