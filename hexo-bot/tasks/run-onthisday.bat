@echo off
chcp 65001 >nul
title OnThisDay

set BOT_DIR=%~dp0..\onthisday
set LOG=%BOT_DIR%\cron.log

echo [%DATE% %TIME%] ======== START ======== >> "%LOG%"
"C:\Program Files\nodejs\node.exe" "%BOT_DIR%\fetch-onthisday.js" >> "%LOG%" 2>&1
echo [%DATE% %TIME%] ======== DONE ======== >> "%LOG%"
echo. >> "%LOG%"
