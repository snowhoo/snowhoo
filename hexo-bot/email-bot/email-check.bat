@echo off
:: 检查 email-cron.ps1 是否已在运行，未在运行才启动
powershell -ExecutionPolicy Bypass -Command "if (Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { \$_.CommandLine -like '*email-cron.ps1*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 goto :eof
powershell -ExecutionPolicy Bypass -File "D:\hexo\hexo-bot\email-bot\email-cron.ps1"
