@echo off
chcp 65001 >nul
echo ========================================
echo  PeopleApp YEDU Fetcher and Deployer
echo ========================================
echo.

:: Set base path (D:\hexo\hexo-bot\yedu-peopleapp)
set BASE=%~dp0
:: Go to Git repo root (D:\hexo) - base is yedu-peopleapp, parent is hexo-bot, grandparent is hexo
for %%i in ("%BASE:~0,-1%") do set "PARENT=%%~dpi"
for %%i in ("%PARENT:~0,-1%") do set "GRANDPARENT=%%~dpi"
cd /d %GRANDPARENT%

echo Working directory: %CD%
echo.

echo [1/2] Running crawler (outputs directly to source\yedu)...
node "hexo-bot\yedu-peopleapp\fetch-yedu-list.js"
if errorlevel 1 (
    echo.
    echo [ERROR] Crawler failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Git commit and push to source...
git add source/yedu/
git commit -m "update: yedu data"
git push origin source

echo.
echo [Done] All steps completed!
echo.
pause
