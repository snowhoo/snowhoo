@echo off
chcp 65001 >nul

cd /d "%~dp0"

REM 1. 运行爬虫（数据写入 D:\hexo\source\yedu\data\）
call node fetch-yedu-list.js
if %errorlevel% neq 0 goto end

REM 2. 动态生成 index.html（扫描 data 目录生成文件列表）
call node write-html.js
if %errorlevel% neq 0 goto end

REM 3. Git 提交并推送
cd /d D:\hexo\source
git add -A
git commit -m "update yedu %date% %time%"
git push origin source

:end
pause
