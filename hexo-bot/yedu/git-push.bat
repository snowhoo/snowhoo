@echo off
chcp 65001 >nul
git -C D:\hexo\hexo-bot\yedu add -A
git -C D:\hexo\hexo-bot\yedu commit -m "fix compress layout"
git -C D:\hexo\hexo-bot\yedu push origin main