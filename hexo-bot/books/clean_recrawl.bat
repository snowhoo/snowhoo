@echo off
setlocal
cd /d %~dp0
set "SCRIPT=lewx.cc.books.py"
set "UPLOAD=upload_r2.py"
set "PURGE=purge_r2.py"
set "LOG=clean_recrawl.log"
set "CAP=100"
set "DATADIR=data"

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
echo  清空 + 全量重抓（纠正历史抓错数据，仅此一次用，平时别跑）
echo  - 步骤1: 清空本地 data/（删除全部旧正文分片与索引，不可逆）
echo  - 步骤2: 全量重抓每本书前 %CAP% 章正文（全新抓取，已跳过"最新章节"预览区）
echo  - 步骤3: 清空 R2 桶（删除全部旧对象，不可逆）
echo  - 步骤4: 上传全新数据到 R2
echo  - 书很多(上万本)，耗时很长，且若被 lewx.cc 风控限流会中途失败
echo  - 中途失败关掉重跑本脚本即可：已抓部分保留在 data/，会续接（不会重复清空）
echo ============================================================
if /i not "%~1"=="/silent" pause

REM ---- 步骤1: 清空本地 data ----
echo [info] step 1/4: 清空本地 data/ ...
if /i "%~1"=="/silent" echo [%date% %time%] === step 1/4 CLEAR local data/ === >> "%LOG%"
if exist "%DATADIR%" rmdir /s /q "%DATADIR%" >> "%LOG%" 2>&1
mkdir "%DATADIR%" >nul 2>&1
echo [info] data/ 已清空并重建

REM ---- 步骤2: 全量重抓 ----
echo [info] step 2/4: 全量重抓正文 (cap=%CAP%) ...
if /i "%~1"=="/silent" (
  echo [%date% %time%] === step 2/4 FULL content re-crawl (cap=%CAP%) === >> "%LOG%"
  "%PY%" "%SCRIPT%" --content --cap %CAP% --no-mirror >> "%LOG%" 2>&1
) else (
  "%PY%" "%SCRIPT%" --content --cap %CAP% --no-mirror 2>&1
)
if errorlevel 1 (
  echo [ERR] 抓取阶段失败（多半是 lewx.cc 风控限流）。data/ 已抓部分保留，未清 R2、未上传。
  echo        请等限流解除后重新运行本脚本续抓（data 不清空，步骤1会自动跳过已抓的）。
  if /i not "%~1"=="/silent" pause
  exit /b 1
)
echo [info] 抓取完成

REM ---- 步骤3: 清空 R2 ----
echo [info] step 3/4: 清空 R2 桶 ...
if /i "%~1"=="/silent" (
  echo [%date% %time%] === step 3/4 PURGE R2 bucket === >> "%LOG%"
  "%PY%" "%PURGE%" >> "%LOG%" 2>&1
) else (
  "%PY%" "%PURGE%" 2>&1
)
if errorlevel 1 (
  echo [ERR] R2 清空失败，见日志。本地 data 已抓完，可稍后单独跑 upload_r2.py。
  if /i not "%~1"=="/silent" pause
  exit /b 1
)

REM ---- 步骤4: 上传 ----
echo [info] step 4/4: 上传到 R2 ...
if /i "%~1"=="/silent" (
  echo [%date% %time%] === step 4/4 UPLOAD to R2 === >> "%LOG%"
  "%PY%" "%UPLOAD%" >> "%LOG%" 2>&1
) else (
  "%PY%" "%UPLOAD%" 2>&1
)
if errorlevel 1 (
  echo [ERR] 上传失败，见日志。可重跑 upload_r2.py 续传。
  if /i not "%~1"=="/silent" pause
  exit /b 1
)

echo [OK] 清空重抓全部完成。
if /i not "%~1"=="/silent" pause
