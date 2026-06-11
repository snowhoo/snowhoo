@echo off
chcp 65001 >nul
echo ============================================
echo  照见苏州 - 文章数据更新脚本
echo ============================================

set SCRIPTS_DIR=%~dp0
set OUTPUT_DIR=D:\hexo\source\js\sevencolor\1

echo 脚本目录: %SCRIPTS_DIR%
echo 输出目录: %OUTPUT_DIR%
echo.

cd /d "%SCRIPTS_DIR%"

echo [1/2] 正在爬取增量文章...
python album_scraper.py --incremental --outdir "%OUTPUT_DIR%"

echo.
echo [2/2] 复制 index.html 到输出目录...
copy /Y "%SCRIPTS_DIR%index.html" "%OUTPUT_DIR%\zjsz.html" >nul

echo.
echo ============ 完成！============
echo 输出文件:
echo   %OUTPUT_DIR%\zjsz.html
echo   %OUTPUT_DIR%\data.js
echo.
pause
