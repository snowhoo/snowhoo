@echo off
chcp 65001 >nul

cd /d "%~dp0"

REM crawl + update index.html + git push
call node yedu-crawl-and-push.js
