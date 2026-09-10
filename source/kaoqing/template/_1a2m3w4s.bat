@echo off
REM 1a2m3w4s.bat - kaoqing monthly pipeline: archive -> new sheet -> write data -> send mail
cd /d %~dp0

echo [1/4] archiving kaoqing records to R2 ...
py _archiver.py
if errorlevel 1 (
    echo [FAIL] _archiver.py failed. Aborted.
    goto :end
)

echo [2/4] creating new month sheets from R2 archive ...
py _M_NewM.py --from-archive
if errorlevel 1 (
    echo [FAIL] _M_NewM.py failed. Aborted.
    goto :end
)

echo [3/4] writing archived data into summary workbook ...
py _W_Data.py --r2
if errorlevel 1 (
    echo [FAIL] _W_Data.py failed. Aborted.
    goto :end
)

echo [4/4] sending summary workbook by email ...
py _S_Mail.py
if errorlevel 1 (
    echo [FAIL] _S_Mail.py failed.
)

:end
echo.
echo Done. Press any key to close.
pause
