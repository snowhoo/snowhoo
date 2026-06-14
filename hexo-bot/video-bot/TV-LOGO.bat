@echo off
chcp 65001 >nul
title TV-LOGO Downloader
cd /d "%~dp0"
echo ================================================
echo Downloading live channel logos...
echo Save to: source\js\sevencolor\3\data\TV-LOGO\
echo ================================================
echo.
python -X utf8 TV-LOGO.py
echo.
echo ================================================
if %ERRORLEVEL% EQU 0 (echo Done!) else (echo Error!)
echo ================================================
pause
