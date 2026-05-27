@echo off
chcp 65001 >nul
setlocal
title TVBox Crawl

set "BOT_DIR=%~dp0"
set "HEXO_DIR=D:\hexo"
set "LOG=%BOT_DIR%crawl-log.txt"
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;%PATH%"
set "HOME=%USERPROFILE%"
set "PYTHONIOENCODING=utf-8"

echo ========================================
echo TVBox Crawl - %DATE% %TIME%
echo ========================================
echo [%DATE% %TIME%] START >> "%LOG%"

cd /d "%BOT_DIR%"
python tvbox-crawler-optimized.py
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] CRAWL FAILED >> "%LOG%"
    echo CRAWL FAILED!
    pause
    exit /b 1
)
echo [%DATE% %TIME%] CRAWL DONE >> "%LOG%"

REM Git push
cd /d "%HEXO_DIR%"
git diff --quiet -- "source/video"
if %ERRORLEVEL% EQU 1 (
    echo Pushing...
    echo [%DATE% %TIME%] Pushing >> "%LOG%"
    git add "source/video"
    git commit -m "chore: auto-update TVBox video data"
    git push origin source
    if %ERRORLEVEL% EQU 0 (
        echo [%DATE% %TIME%] PUSH OK >> "%LOG%"
    ) else (
        echo [%DATE% %TIME%] PUSH FAILED >> "%LOG%"
    )
) else (
    echo No changes, skip push.
    echo [%DATE% %TIME%] No changes >> "%LOG%"
)

echo [%DATE% %TIME%] DONE >> "%LOG%"
echo ========================================
echo Done! Log: %LOG%
echo ========================================
pause
