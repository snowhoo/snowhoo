@echo off
chcp 65001 >nul
echo ========== 人民日报夜读抓取 ==========
echo 手动执行中...
cd /d d:\hexo
node scripts\rmrb-yedu\fetch-yedu.js
echo.
echo 按任意键退出...
pause >nul
