@echo off
REM Double-click this file to launch the Audit Dashboard.
REM It finds Node.js, runs the setup, and opens the dashboard in your browser.

cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed. Please install it once from https://nodejs.org, then double-click again.
    echo.
    start https://nodejs.org/en/download/
    pause
    exit /b 1
)

node setup.js

echo.
echo Server stopped.
pause
