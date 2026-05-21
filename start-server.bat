@echo off
echo Starting RetroFlow server...
cd /d "%~dp0server"
node --env-file=../.env index.js
