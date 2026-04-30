@echo off
echo [%date% %time%] ========== 人民日报夜读抓取 ========== >> D:\hexo\scripts\rmrb-yedu\cron.log
cd /d D:\hexo
C:\PROGRA~1\nodejs\node.exe scripts\rmrb-yedu\fetch-yedu.js >> D:\hexo\scripts\rmrb-yedu\cron.log 2>&1
echo [%date% %time%] 退出码: %ERRORLEVEL% >> D:\hexo\scripts\rmrb-yedu\cron.log
