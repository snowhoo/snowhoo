@echo off
cd /d D:\hexo
"C:\Program Files\nodejs\node.exe" "D:\hexo\hexo-bot\rmrb-yedu\fetch-yedu.js" >> D:\hexo\hexo-bot\rmrb-yedu\cron.log 2>&1
echo [%date% %time%] ???: %ERRORLEVEL% >> D:\hexo\hexo-bot\rmrb-yedu\cron.log
