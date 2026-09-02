@echo off
REM keep window open on double-click:
REM   re-launch in its OWN detached cmd /k window (start gives it a separate console
REM   that survives the launcher's exit). Passing _reenter as %1 prevents infinite loops.
if "%~1"=="" (
    start "" cmd /k "%~f0" _reenter
    exit /b
)
setlocal
cd /d %~dp0

REM === catalog_toc.bat : INCREMENTAL catalog + chapter list (toc), NO content ===
REM All output is written LIVE to catalog_toc.log.
REM Double-click opens a SEPARATE window that STAYS OPEN when done (close it manually).
REM If you still see it vanish, open a terminal here and run:  catalog_toc.bat _reenter

echo [%date% %time%] === catalog_toc.bat START === > "catalog_toc.log"

set "SCRIPT=lewx.cc.books.py"
set "UPLOAD=upload_r2.py"
set "LOG=catalog_toc.log"

REM --- locate python ---
set "PY="
if exist "C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe" set "PY=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if not defined PY if exist "C:\Program Files\Python313\python.exe" set "PY=C:\Program Files\Python313\python.exe"
if not defined PY if exist "C:\Program Files\Python312\python.exe" set "PY=C:\Program Files\Python312\python.exe"
if not defined PY python --version >nul 2>&1 && set "PY=python"
if not defined PY (
  echo [ERR] Python interpreter not found.
  goto FINISH
)
if not exist "%SCRIPT%" (
  echo [ERR] script missing: %SCRIPT%
  goto FINISH
)

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo ============================================================
echo  INCREMENTAL catalog + chapter list (toc). NO content.
echo  Re-scans the 213-page library, so it takes SEVERAL MINUTES.
echo  All progress is saved to: %LOG%
echo  This window stays open when done (close it manually).
echo ============================================================
echo.

echo [%date% %time%] === step 1/2 incremental catalog + toc === >> "%LOG%"
echo [step 1/2] incremental catalog + toc crawl ... (see %LOG% for live detail)
"%PY%" "%SCRIPT%" --toc --no-mirror 2>&1 | "%PY%" -u tee.py "%LOG%"
set /a RC=%errorlevel%
echo [%date% %time%] crawl exit=%RC% >> "%LOG%"
if not %RC%==0 (
  echo [ERR] crawl phase exit=%RC%. Usually lewx.cc is rate-limiting this IP.
  echo       Wait a few hours, or switch network, then run this bat again.
  goto FINISH
)

echo [%date% %time%] === count toc.json on disk === >> "%LOG%"
"%PY%" -c "import os,glob;print('[info] toc.json on disk =', len(glob.glob(os.path.join('data','*','toc.json'))))" >> "%LOG%" 2>&1
echo.

echo [%date% %time%] === step 2/2 upload index + toc to R2 === >> "%LOG%"
echo [step 2/2] upload index + toc to R2 (skip content) ...
"%PY%" "%UPLOAD%" --toc 2>&1 | "%PY%" -u tee.py "%LOG%"
set /a RC=%errorlevel%
echo [%date% %time%] upload exit=%RC% >> "%LOG%"
if not %RC%==0 (
  echo [ERR] upload phase exit=%RC% - see %LOG%.
  goto FINISH
)

echo [DONE] incremental catalog + chapter info crawled and uploaded. No content.
echo        Content is fetched on demand: open a chapter in the frontend ->
echo        Waline queue -> books_poller.py crawls+uploads -> frontend shows it.
echo        Manual full rebuild: python lewx.cc.books.py --force --toc --no-mirror

:FINISH
echo [%date% %time%] === catalog_toc.bat END, RC=%RC% === >> "%LOG%"
echo.
echo ===== DONE. Full log saved to: %LOG% =====
echo ===== This window stays open -- close it manually when ready. =====
endlocal
