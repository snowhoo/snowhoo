@echo off
echo [%date% %time%] ========== 人民日报夜读抓取 ========== >> D:\hexo\hexo-bot\rmrb-yedu\cron.log
cd /d D:\hexo
"C:\Program Files\nodejs\node.exe" "D:\hexo\hexo-bot\rmrb-yedu\fetch-yedu.js" >> D:\hexo\hexo-bot\rmrb-yedu\cron.log 2>&1
echo [%date% %time%] 退出码: %ERRORLEVEL% >> D:\hexo\hexo-bot\rmrb-yedu\cron.log
