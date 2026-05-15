@echo off
title TVBox Full Crawl

set "BOT_DIR=%~dp0"
set "PYTHON=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
set "HEXO_DIR=D:\hexo"
set "LOG=%BOT_DIR%crawl-log.txt"
set "GIT=C:\Program Files\Git\cmd\git.exe"
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;%PATH%"
set "HOME=%USERPROFILE%"
set "PYTHONIOENCODING=utf-8"

echo ========================================
echo TVBox Full Crawl - %DATE% %TIME%
echo Dir: %BOT_DIR%
echo ========================================
echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== START ======== >> "%LOG%"

cd /d "%BOT_DIR%"

echo Running tvbox-crawler-optimized.py...
echo [%DATE% %TIME%] Running tvbox-crawler-optimized.py... >> "%LOG%"
"%PYTHON%" tvbox-crawler-optimized.py
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] CRAWL FAILED >> "%LOG%"
) else (
    echo [%DATE% %TIME%] CRAWL DONE >> "%LOG%"
)

cd /d "%HEXO_DIR%"

git diff --quiet -- "source/video"
if %ERRORLEVEL% EQU 1 (
    echo [%DATE% %TIME%] Pushing changes... >> "%LOG%"
    git add "source/video"
    git commit -m "chore: auto-update TVBox video data" >> "%LOG%" 2>&1
    git push origin source >> "%LOG%" 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [%DATE% %TIME%] PUSH OK >> "%LOG%"
    ) else (
        echo [%DATE% %TIME%] PUSH FAILED >> "%LOG%"
    )
) else (
    echo [%DATE% %TIME%] No changes, skip push >> "%LOG%"
)

echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== DONE ======== >> "%LOG%"
echo ========================================
echo Done! Log: %LOG%
echo ========================================
