@echo off
echo Restarting RetroFlow server...
call "%~dp0stop-server.bat"
timeout /t 2 /nobreak >nul
call "%~dp0start-server.bat"
