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

:: 2. 创建Hexo文章并部署
cd /d "D:\hexo"
hexo generate && hexo deploy

echo [%date% %time%] 任务完成
