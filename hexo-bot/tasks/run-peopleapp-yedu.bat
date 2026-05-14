@echo off
chcp 65001 >nul
title PeopleAppYeDu

set BOT_DIR=%~dp0..\yedu-peopleapp
set LOG=%BOT_DIR%\cron.log

echo [%DATE% %TIME%] ======== START ======== >> "%LOG%"
"C:\Program Files\nodejs\node.exe" "%BOT_DIR%\fetch-peopleapp-yedu.js" >> "%LOG%" 2>&1
echo [%DATE% %TIME%] ======== DONE ======== >> "%LOG%"
echo. >> "%LOG%"
