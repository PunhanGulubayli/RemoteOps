@echo off
title RemoteOps
cd /d "%~dp0"
echo.
echo   RemoteOps baslatiliyor...
echo   Tarayici acilacak: http://localhost:8000/
echo.
echo   Kapatmak icin bu pencerede Ctrl+C
echo.
start "" http://localhost:8000/
python -m uvicorn server.main:app --port 8000
pause
