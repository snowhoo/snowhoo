@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
echo ============================================
echo  洞见 - 文章数据更新脚本
echo  参考 yedu 模式，使用 Playwright 提取音频
echo ============================================

set SCRIPTS_DIR=%~dp0
set OUTPUT_DIR=D:\hexo\source\js\sevencolor\1

echo 脚本目录: %SCRIPTS_DIR%
echo 输出目录: %OUTPUT_DIR%
echo.

cd /d "%SCRIPTS_DIR%"

echo [1/2] 正在增量爬取（含音频提取）...
py -3 dongjian_scraper.py --incremental --outdir "%OUTPUT_DIR%"

echo.
echo [2/2] 提交推送 ...
cd /d "D:\hexo"
git add -A source/js/sevencolor/1/
git diff --cached --quiet
if %errorlevel% equ 0 (
  echo 无数据变更，跳过提交
) else (
  git commit -m "dongjian: auto update (%date%)"
  echo 正在推送到 GitHub...
  git push
  echo ✓ 已推送
)

echo.
echo ============ 完成 ============
echo.
