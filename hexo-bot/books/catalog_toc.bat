@echo off
setlocal
cd /d %~dp0
set "SCRIPT=lewx.cc.books.py"
set "UPLOAD=upload_r2.py"
set "LOG=catalog_toc.log"

REM --- locate python (try several common locations) ---
set "PY="
if exist "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY if exist "C:\Program Files\Python313\python.exe" set "PY=C:\Program Files\Python313\python.exe"
if not defined PY if exist "C:\Program Files\Python312\python.exe" set "PY=C:\Program Files\Python312\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [ERR] Python interpreter not found. Install Python 3.10+ or edit PY path in this bat.
  pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo [ERR] script missing: %SCRIPT%
  pause
  exit /b 1
)

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo [info] python = %PY%
echo [info] mode: REBUILD catalog + chapter list (toc), NO content (force, every book re-fetched)
echo [info] log: %LOG%

if /i "%~1"=="/silent" (
  echo [%date% %time%] === step 1/2 catalog + toc rebuild (force, no content) === >> "%LOG%"
  "%PY%" "%SCRIPT%" --force --toc --no-mirror >> "%LOG%" 2>&1
  set /a RC=%errorlevel%
  if not %RC%==0 (
    echo [%date% %time%] === crawl exit code=%RC% (crawl error), abort, not uploaded === >> "%LOG%"
    exit /b %RC%
  )
  "%PY%" -c "import os,glob;print('[info] toc.json on disk =', len(glob.glob(os.path.join('data','*','toc.json'))))" >> "%LOG%" 2>&1
  echo [%date% %time%] === step 2/2 upload index + toc to R2 (skip content) === >> "%LOG%"
  "%PY%" "%UPLOAD%" --toc >> "%LOG%" 2>&1
  echo [%date% %time%] === upload exit=%errorlevel% === >> "%LOG%"
  exit /b 0
)

echo.
echo ====== step 1/2: REBUILD catalog + per-book chapter list (toc), NO content ======
"%PY%" "%SCRIPT%" --force --toc --no-mirror
set /a RC=%errorlevel%
if not %RC%==0 (
  echo.
  echo [ERR] crawl phase exit code=%RC%. Not uploaded; R2 unchanged. See %LOG%
  pause
  exit /b %RC%
)

"%PY%" -c "import os,glob;print('[info] toc.json on disk =', len(glob.glob(os.path.join('data','*','toc.json'))))"
echo.
echo ====== step 2/2: upload index + toc to R2 (NO content) ======
"%PY%" "%UPLOAD%" --toc
set /a RC=%errorlevel%
if not %RC%==0 (
  echo.
  echo [ERR] upload phase exit code=%RC%, see %LOG%
  pause
  exit /b %RC%
)

echo.
echo [DONE] catalog + chapter info rebuilt and uploaded to R2 (NO content).
echo        Content is fetched on demand: click a chapter in the frontend -> queued via
echo        Waline -> books_poller.py crawls+uploads -> frontend shows it.
pause
exit /b 0
