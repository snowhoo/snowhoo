@echo off
setlocal
cd /d %~dp0
set "SCRIPT=clean_shards_noise.py"
set "LOG=clean_noise.log"

REM --- locate python (portable: PATH -> %USERPROFILE% -> %ProgramFiles% / %LOCALAPPDATA%) ---
REM No hard-coded user name, drive, or Python version: works after moving to another machine.
set "PY="
for /f "delims=" %%P in ('where python 2^>nul') do if not defined PY set "PY=%%P"
if defined PY (
  "%PY%" -c "import sys" >nul 2>&1
  if errorlevel 1 set "PY="
)
if not defined PY for /d %%V in ("%USERPROFILE%\.workbuddy\binaries\python\versions\*") do if exist "%%V\python.exe" if not defined PY set "PY=%%V\python.exe"
if not defined PY for /d %%V in ("%ProgramFiles%\Python3*") do if exist "%%V\python.exe" if not defined PY set "PY=%%V\python.exe"
if not defined PY for /d %%V in ("%LOCALAPPDATA%\Programs\Python\Python3*") do if exist "%%V\python.exe" if not defined PY set "PY=%%V\python.exe"
if not defined PY (
  echo [ERR] python interpreter not found. Install Python 3.10+ or check PATH.
  pause
  exit /b 1
)
echo [info] using python: %PY%

chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo [info] step: strip footer noise from content shards (live). Log also at %LOG%
echo.

"%PY%" "%SCRIPT%" %*

echo.
echo [info] finished. Full log at %LOG%
echo [info] NOTE: this bat only cleans local shards. Upload separately with: python upload_r2.py
pause
