@echo off
chcp 65001 >nul
cd /d "D:\hexo\hexo-bot\holiday-publish"

if "%~1"=="" (
  echo 用法: run-holiday-task.bat [劳动节^|端午节^|国庆节^|中秋节]
  exit /b 1
)

set HOLIDAY=%~1
echo [%date% %time%] 开始执行 %HOLIDAY% 文章发布任务

:: 1. 生成图片
powershell -ExecutionPolicy Bypass -File "generate_holiday_images.ps1" -HolidayName "%HOLIDAY%"
if errorlevel 1 (
  echo 图片生成失败
  exit /b 1
)

:: 确保 node 在 PATH 中（计划任务兼容）
set PATH=C:\PROGRA~1\nodejs;%PATH%

:: 2. 创建 Hexo 文章
cd /d "D:\hexo\hexo-bot\holiday-publish"
node create-holiday-post.js "%HOLIDAY%"
if errorlevel 1 (
  echo 文章创建失败
  exit /b 1
)

:: 3. 提交并推送到 GitHub
echo 正在提交并推送...
cd /d "D:\hexo"
git add source\_posts\*.md
git commit -m "auto: %HOLIDAY% festival post"
git push origin source

echo [%date% %time%] 任务完成
