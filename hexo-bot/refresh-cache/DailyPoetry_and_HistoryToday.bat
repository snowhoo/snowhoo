@echo off
cd /d D:\hexo
node hexo-bot\refresh-cache\DailyPoetry.js
timeout /t 10
node hexo-bot\refresh-cache\HistoryToday.js
timeout /t 10
