@echo off
setlocal
cd /d %~dp0
set "SCRIPT=clean_shards_noise.py"
set "LOG=clean_noise.log"

REM --- locate python (try several common locations) ---
set "PY="
if exist "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY if exist "C:\Program Files\Python313\python.exe" set "PY=C:\Program Files\Python313\python.exe"
if not defined PY if exist "C:\Program Files\Python312\python.exe" set "PY=C:\Program Files\Python312\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [ERR] python interpreter not found. Install Python 3.10+ or fix the path in this bat.
  pause
  exit /b 1
)

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo [info] using python: %PY%
echo [info] step: strip footer noise from content shards (live). Log also at %LOG%
echo.

"%PY%" "%SCRIPT%" %*

echo.
echo [info] finished. Full log at %LOG%
echo [info] NOTE: this bat only cleans local shards. Upload separately with: python upload_r2.py
pause
