@echo off
cd /d D:\hexo
"C:\Program Files\nodejs\node.exe" hexo-bot\refresh-cache\FestivalSolar.js
if %ERRORLEVEL% NEQ 0 (
    echo [ERR] FestivalSolar script failed!
    pause
    exit /b 1
)

git diff --quiet -- "source/js/FestivalSolar/FestivalSolar.json"
if %ERRORLEVEL% EQU 1 (
    echo Pushing...
    git add "source/js/FestivalSolar/FestivalSolar.json"
    git commit -m "chore: auto-update FestivalSolar dates"
    git push origin source
)