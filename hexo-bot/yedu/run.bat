@echo off
chcp 65001 >nul

REM 切换到脚本目录
cd /d "%~dp0"

REM 复制 index.html 到 Hexo 源目录
set HEXO_SOURCE=D:\hexo\source
set HEXO_YEDU=%HEXO_SOURCE%\yedu

copy /Y "%~dp0index.html" "%HEXO_YEDU%\index.html"

REM 运行爬虫
node fetch-yedu-list.js

REM Git 提交并推送
cd /d %HEXO_SOURCE%
git add -A
git commit -m "update yedu %date% %time%"
git push origin source
