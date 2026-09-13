@echo off
cd /d %~dp0
schtasks /create /tn "KaoqinArchiveRequest" /ru SYSTEM /tr "D:\hexo\source\kaoqing\template\_C_run.bat" /sc monthly /mo LASTDAY /M "*" /st 09:00 /ri 60 /du 009:00 /f
pause
