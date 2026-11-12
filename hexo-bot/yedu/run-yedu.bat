@echo off
chcp 65001 >nul

cd /d "%~dp0"

REM crawl + update index.html + git push
set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" yedu-crawl-and-push.js
