@echo off
title Discord AI Chars (local)
cd /d "%~dp0"
where node >nul 2>nul || set "PATH=%ProgramFiles%\nodejs;%PATH%"
set RUN_LOCAL=true
node main
pause
