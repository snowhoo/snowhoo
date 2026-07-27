@echo off
cd /d D:\hexo\hexo-bot\DailyNews
echo.
echo ============================
echo   央视新闻每日获取
echo ============================
echo.
"C:\Program Files\Python313\python.exe" DailyNews_CCTV.py %*
echo.
echo [完成] 央视新闻已更新
echo.
echo ============================
echo   检查更新并推送至Git
echo ============================
cd /d D:\hexo
git add -A
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "每日新闻自动更新 %date%"
    git push
    echo [完成] 已推送至远程仓库
) else (
    echo [提示] 无新内容更新
)
echo.
echo 10 秒后自动退出 ...
ping -n 10 127.0.0.1
