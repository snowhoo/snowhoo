@echo off
chcp 65001 >nul
title TVBox 全量采集

set "BOT_DIR=%~dp0"
set "PYTHON=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
set "LOG=%BOT_DIR%crawl-log.txt"

echo ========================================
echo  TVBox 全量采集
echo  时间: %DATE% %TIME%
echo  目录: %BOT_DIR%
echo ========================================
echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== 开始全量采集 ======== >> "%LOG%"

cd /d "%BOT_DIR%"

"%PYTHON%" tvbox-crawler.py >> "%LOG%" 2>&1

echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== 采集完成 ======== >> "%LOG%"
echo ========================================
echo 完成！日志: %LOG%
echo ========================================
pause
