@echo off
REM Audit Dashboard - One-click launcher for Windows

echo Starting Audit Dashboard setup...

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js not found. Installing...
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/en/download/
    echo.
    echo After installing, close this window and run start.bat again.
    pause
    start https://nodejs.org/en/download/
    exit /b 1
)

echo Node.js found: 
node --version

REM Navigate to script directory
cd /d "%~dp0"

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Dependencies ready
echo Launching Audit Dashboard...
echo.

REM Start the server
node server.js

pause
