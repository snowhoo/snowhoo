@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
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
py -3 album_scraper.py --incremental --outdir "%OUTPUT_DIR%"

echo.
echo [2/2] 检查是否有更新，自动提交推送 ...
cd /d "D:\hexo"
git add -A source/js/sevencolor/1/
git diff --cached --quiet
if %errorlevel% equ 0 (
  echo 无数据变更，跳过提交
) else (
  git commit -m "zjsz: auto update data (%date%)"
  echo 正在推送到 GitHub ...
  git push
  echo ✓ 已推送更新到 GitHub
)

echo.
echo ============ 完成！============
echo 输出目录: %OUTPUT_DIR%\zjsz_data\
echo 数据文件: %OUTPUT_DIR%\zjsz_data\data.js
echo 页面文件: %OUTPUT_DIR%\zjsz.html（保持不变）
echo.