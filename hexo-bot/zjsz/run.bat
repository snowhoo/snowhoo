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

echo [1/1] 正在爬取增量文章，输出 data.js ...
python album_scraper.py --incremental --outdir "%OUTPUT_DIR%"

echo.
echo ============ 完成！============
echo 输出文件: %OUTPUT_DIR%\data.js
echo 页面文件: %OUTPUT_DIR%\zjsz.html（保持不变）
echo.
pause
