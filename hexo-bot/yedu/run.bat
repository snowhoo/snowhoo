@echo off
chcp 65001 >nul

cd /d "%~dp0"

REM step1: crawl
call node fetch-yedu-list.js
if %errorlevel% neq 0 goto end

REM step2: generate index.html
call node write-html.js
if %errorlevel% neq 0 goto end

REM step3: git push (only yedu dir, not everything)
cd /d D:\hexo\source
git add yedu/index.html yedu/data yedu/images
git commit -m "update yedu %date% %time%"
git push origin source

:end
pause