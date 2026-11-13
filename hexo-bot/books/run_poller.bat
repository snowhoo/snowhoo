@echo off
setlocal
cd /d %~dp0

REM --- run_poller.bat : ONE polling round, then exit ---
REM Called by Windows Task Scheduler (create the task yourself).
REM run_poller.py redirects stdout/stderr to poller.log (GBK) by itself.
REM No hard-coded paths: works after moving the whole project.

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
  echo [ERR] Python interpreter not found. Install Python 3.10+ or check PATH.
  exit /b 1
)
echo [info] using python: %PY%

if not exist "run_poller.py" (
  echo [ERR] script missing: run_poller.py
  exit /b 1
)

"%PY%" run_poller.py
set "RC=%errorlevel%"
echo [info] run_poller.py exit=%RC%
endlocal & exit /b %RC%
