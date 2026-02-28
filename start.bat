@echo off
title SteamPay Dev Servers
echo Starting SteamPay backend + frontend...
echo.

:: Kill any existing node processes on port 4000 and 8080
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":4000 "') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 "') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

:: Backend
start "SteamPay Backend :4000" cmd /k "cd /d %~dp0server && node index.js"

:: Wait 2s for backend to start
timeout /t 2 /nobreak >nul

:: Frontend
start "SteamPay Frontend :8080" cmd /k "cd /d %~dp0 && set CI=true && npx vite --host"

echo.
echo ============================================================
echo   Backend  : http://localhost:4000
echo   Frontend : http://localhost:8080
echo.
echo   Phone    : http://192.168.40.156:8080
echo   Backend  : http://192.168.40.156:4000
echo ============================================================
echo.
echo Both server windows opened. Close them to stop.
pause
