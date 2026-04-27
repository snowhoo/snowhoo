@echo off
:: HexoEmailBot 守护脚本
:: 每 10 分钟执行一次，检查进程是否运行，未运行则启动

set SCRIPT_PATH=D:\hexo\hexo-bot\email-bot\email-to-hexo.js
set LOG_FILE=D:\hexo\hexo-bot\email-bot\daemon.log

:: 检查 node 进程是否在运行 email-to-hexo.js
tasklist /FI "IMAGENAME eq node.exe" /FO CSV | findstr "email-to-hexo" >nul 2>&1

:: 另一种方式：用 wmic 检查命令行参数
wmic process where "name='node.exe' and CommandLine like '%email-to-hexo%'" get ProcessId 2>nul | findstr /[0-9]/ >nul

if %errorlevel% equ 0 (
    echo [%date% %time%] 进程已运行 >> "%LOG_FILE%"
    exit /b 0
)

:: 进程未运行，启动它
echo [%date% %time%] 进程未运行，启动服务... >> "%LOG_FILE%"
start /min node "%SCRIPT_PATH%"
exit /b 0