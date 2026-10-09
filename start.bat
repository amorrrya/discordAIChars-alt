@echo off
cd /d "%~dp0"
where node >nul 2>nul || set "PATH=%ProgramFiles%\nodejs;%PATH%"
node main
pause
