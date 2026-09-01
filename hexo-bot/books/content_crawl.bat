@echo off
setlocal
cd /d %~dp0
set SCRIPT=D:\hexo\hexo-bot\books\lewx.cc.books.py
set LOG=D:\hexo\hexo-bot\books\content_crawl.log

REM --- locate python (try several common locations) ---
set "PY="
if exist "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY if exist "C:\Program Files\Python313\python.exe" set "PY=C:\Program Files\Python313\python.exe"
if not defined PY if exist "C:\Program Files\Python312\python.exe" set "PY=C:\Program Files\Python312\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [ERR] python interpreter not found. Install Python 3.10+ or fix PY in this bat.
  if /i not "%~1"=="/silent" pause
  exit /b 1
)

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo [info] using python: %PY%
echo [%date% %time%] === start content crawl (first 50 chapters, no-mirror) === >> "%LOG%"

if /i "%~1"=="/silent" (
  "%PY%" "%SCRIPT%" --content --cap 50 --no-mirror >> "%LOG%" 2>&1
  set RC=%errorlevel%
  echo [%date% %time%] === content crawl exit=%RC% === >> "%LOG%"
) else (
  echo [info] live progress below; full log also saved at:
  echo %LOG%
  "%PY%" "%SCRIPT%" --content --cap 50 --no-mirror 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%LOG%'"
)
if /i not "%~1"=="/silent" pause
