@echo off
cd /d "%~dp0"
echo AudioText will be available at http://127.0.0.1:3100
echo Keep this window open. Press Ctrl+C to stop.
call npm run dev
pause
