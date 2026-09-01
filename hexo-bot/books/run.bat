@echo off
chcp 65001 >nul
cd /d %~dp0
if /i "%~1"=="/silent" set SILENT=1

REM Force Python UTF-8 stdio so Chinese prints correctly under cmd (console is 65001 above)
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

set "PY="
if exist "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY if exist "C:\Program Files\Python313\python.exe" set "PY=C:\Program Files\Python313\python.exe"
if not defined PY if exist "C:\Program Files\Python312\python.exe" set "PY=C:\Program Files\Python312\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
    echo [books] python interpreter not found. Install Python 3.10+, or edit PY in this bat.
    if not defined SILENT pause
    exit /b 1
)
echo [books] using python: %PY%

echo [books] 1/2 incremental crawl lewx.cc -^> local data/...
"%PY%" lewx.cc.books.py --no-mirror
if %errorlevel% neq 0 (
    echo [books] crawler failed, exit code %errorlevel%
    if not defined SILENT (
        echo Press any key to close...
        pause
    )
    exit /b %errorlevel%
)

echo [books] 2/2 upload data/ to Cloudflare R2 public bucket (frontend reads it, no GitHub push)...
"%PY%" upload_r2.py
if %errorlevel% neq 0 (
    echo [books] upload failed, exit code %errorlevel%
    if not defined SILENT (
        echo Press any key to close...
        pause
    )
    exit /b %errorlevel%
)

echo [books] Done. Data uploaded to R2; frontend reads it live. No repo push needed.
if not defined SILENT (
    echo Press any key to close...
    pause
)
