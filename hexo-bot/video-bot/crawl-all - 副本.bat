@echo off
setlocal enabledelayedexpansion
title TVBox Full Crawl

set "BOT_DIR=%~dp0"
set "PYTHON=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
set "HEXO_DIR=D:\hexo"
set "LOG=%BOT_DIR%crawl-log.txt"
set "GIT=C:\Program Files\Git\cmd\git.exe"
set "PATH=C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;%PATH%"
set "HOME=%USERPROFILE%"
set "PYTHONIOENCODING=utf-8"

echo ========================================
echo TVBox Full Crawl - %DATE% %TIME%
echo Dir: %BOT_DIR%
echo ========================================
echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== START ======== >> "%LOG%"

cd /d "%BOT_DIR%"

echo Running tvbox-crawler-optimized.py...
echo [%DATE% %TIME%] Running tvbox-crawler-optimized.py... >> "%LOG%"
"%PYTHON%" tvbox-crawler-optimized.py
if %ERRORLEVEL% NEQ 0 (
    echo [%DATE% %TIME%] CRAWL FAILED >> "%LOG%"
) else (
    echo [%DATE% %TIME%] CRAWL DONE >> "%LOG%"
)

echo ========================================
echo Copying data files to Hexo source...
echo ========================================

set "DATA_SRC=%BOT_DIR%playable\data"
set "DATA_DST=%HEXO_DIR%\source\video\data"

REM Clear target directory
if exist "%DATA_DST%" (
    echo Clearing target: %DATA_DST%
    rd /s /q "%DATA_DST%"
)
mkdir "%DATA_DST%"

REM Copy data files
echo Copying from %DATA_SRC% to %DATA_DST%
xcopy "%DATA_SRC%\*" "%DATA_DST%\" /Y /Q >nul 2>&1

REM Copy index.html
echo Copying index.html to Hexo source
xcopy "%BOT_DIR%playable\index.html" "%HEXO_DIR%\source\video\" /Y /Q >nul 2>&1

REM Verify: check count and non-zero size
set /a FILES_OK=0
set /a FILES_FAIL=0
for %%F in ("%DATA_SRC%\*.*") do (
    set "SRC=%%F"
    set "DST=%DATA_DST%\%%~nxF"
    if exist "!DST!" (
        if %%~zF gtr 0 (
            set /a FILES_OK+=1
        ) else (
            echo [WARN] Zero-size file: %%~nxF
            set /a FILES_FAIL+=1
        )
    ) else (
        echo [FAIL] Missing: %%~nxF
        set /a FILES_FAIL+=1
    )
)
echo   Verified: !FILES_OK! files OK, !FILES_FAIL! failed

if !FILES_FAIL! gtr 0 (
    echo [%DATE% %TIME%] COPY VERIFICATION FAILED >> "%LOG%"
    echo ========================================
    echo WARNING: File verification failed!
    echo ========================================
    pause
) else (
    echo [%DATE% %TIME%] Copy verified OK >> "%LOG%"
)


echo. >> "%LOG%"
echo [%DATE% %TIME%] ======== DONE ======== >> "%LOG%"
echo ========================================
echo Done! Log: %LOG%
echo ========================================
