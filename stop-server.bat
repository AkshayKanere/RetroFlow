@echo off
echo Stopping RetroFlow server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001.*LISTENING"') do (
    echo Killing process %%a on port 3001
    taskkill /F /PID %%a >nul 2>&1
)
echo Server stopped.
