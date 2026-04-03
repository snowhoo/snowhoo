@echo off
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"D:\hexo\hexo-bot\email-cron.ps1\"' -WindowStyle Hidden"
