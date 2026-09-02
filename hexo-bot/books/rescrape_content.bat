@echo off
setlocal
cd /d %~dp0
set "SCRIPT=lewx.cc.books.py"
set "UPLOAD=upload_r2.py"
set "LOG=rescrape_content.log"
set "CAP=100"

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

echo ============================================================
echo  全量重抓正文（纠正历史抓错数据，仅此一次用，平时别跑）
echo  - 会强制重抓每一本书的前 %CAP% 章正文（--force 把已抓进度归零）
echo  - 书很多(上万本)，耗时很长，且极易触发 lewx.cc 风控限流
echo  - 若中途失败，关掉重跑本脚本即可，已正确抓的会续接
echo ============================================================
if /i not "%~1"=="/silent" pause

echo [info] using python: %PY%
echo [info] mode: FORCE re-crawl first %CAP% chapters + upload to R2

if /i "%~1"=="/silent" (
  echo [%date% %time%] === step 1/2 FORCE content re-crawl (cap=%CAP%) === >> "%LOG%"
  "%PY%" "%SCRIPT%" --content --cap %CAP% --no-mirror --force >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo [%date% %time%] === crawl FAILED (exit=%errorlevel%) === >> "%LOG%"
    exit /b 1
  )
  echo [%date% %time%] === step 2/2 upload data/ to Cloudflare R2 === >> "%LOG%"
  "%PY%" "%UPLOAD%" >> "%LOG%" 2>&1
  echo [%date% %time%] === upload exit=%errorlevel% === >> "%LOG%"
) else (
  echo [info] step 1/2: FORCE re-crawl (cap=%CAP%) - live progress below; full log at:
  echo %LOG%
  "%PY%" "%SCRIPT%" --content --cap %CAP% --no-mirror --force 2>&1
  if errorlevel 1 (
    echo [ERR] 抓取阶段失败（多半是 lewx.cc 风控限流）。请等限流解除后重跑本脚本续抓。未上传。
    pause
    exit /b 1
  )
  echo [info] step 2/2: uploading to R2 (live)...
  "%PY%" "%UPLOAD%" 2>&1
)

if /i not "%~1"=="/silent" pause
