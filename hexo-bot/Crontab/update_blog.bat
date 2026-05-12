@echo off
title TV Data Updater

:: 记录脚本启动时间和状态
echo [%date% %time%] Starting update_blog.bat

:: 1. 跳转到抓取脚本所在目录并运行
cd /d D:\hexo\hexo-bot\Crontab
node fetch_data.js
:: 错误检查
if %errorlevel% neq 0 (
    echo [ERROR] fetch_data.js failed with code %errorlevel%
    goto :end
)
echo [%date% %time%] fetch_data.js completed

:: 2. 将生成的数据复制到 Hexo 仓库目录下
xcopy /y D:\temp\all_movies.json D:\hexo\source\data\
:: 错误检查
if %errorlevel% neq 0 (
    echo [ERROR] xcopy failed
    goto :end
)

:: 3. 转到 Hexo 仓库目录
cd /d D:\hexo

:: 4. Git 操作：拉取、提交、推送
:: git pull --rebase origin source
:: ‘|| echo...’ 的含义是：如果 git pull 失败了，就记录一个错误，但脚本会继续往下执行
:: git add source/data/all_movies.json
:: git commit -m "chore: update movie data from local crontab [skip ci]"
:: git push origin source

:end
echo [%date% %time%] Update script finished