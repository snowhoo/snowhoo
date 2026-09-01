@echo off
chcp 65001 >nul
cd /d %~dp0

echo [books] 1/2 增量抓取 lewx.cc 小说数据到本地 data/...
rem 数据只走 R2（books.html 读 R2_BASE），不再镜像到 source/app_n/books_data/（那是死目录，浪费 ~1.4GB）
py -3 lewx.cc.books.py --no-mirror
if %errorlevel% neq 0 (
    echo [books] 爬虫执行失败，退出码 %errorlevel%
    exit /b %errorlevel%
)

echo [books] 2/2 上传 data/ 到 Cloudflare R2 公开桶（前端直接读取，不进 GitHub）...
py -3 upload_r2.py
if %errorlevel% neq 0 (
    echo [books] 上传失败，退出码 %errorlevel%
    exit /b %errorlevel%
)

echo [books] 完成。数据已上传 R2，前端实时读取，无需推送仓库数据。
