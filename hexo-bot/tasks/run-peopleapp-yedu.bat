@echo off
title PeopleApp 人民夜读采集
set "BOT_DIR=%~dp0..\yedu-peopleapp"
set "LOG=%BOT_DIR%\cron.log"
echo [%DATE% %TIME%] ======== 开始 ======== >> "%LOG%"
"C:\Program Files\nodejs\node.exe" "%BOT_DIR%\fetch-peopleapp-yedu.js" >> "%LOG%" 2>&1
echo [%DATE% %TIME%] ======== 结束 ======== >> "%LOG%"
echo. >> "%LOG%"
