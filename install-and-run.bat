@echo off
REM ============================================
REM Audit Dashboard - Windows One-Click Setup
REM Just double-click this file to run
REM ============================================

echo.
echo ==============================
echo   Audit Dashboard Setup
echo ==============================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js found
    goto :CHECK_GIT
)

echo [..] Node.js not found. Installing via winget...
where winget >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    echo [!!] Node.js installed. Please CLOSE this window and double-click this file again.
    pause
    exit /b 0
)

echo [!!] winget not available. Please install Node.js manually:
echo      1. Open your browser
echo      2. Go to https://nodejs.org
echo      3. Download and install the LTS version
echo      4. After install, close this window and double-click this file again
echo.
pause
exit /b 1

:CHECK_GIT
REM Check if Git is installed
where git >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Git found
    goto :CLONE
)

echo [..] Git not found. Installing via winget...
where winget >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    winget install Git.Git --silent --accept-package-agreements --accept-source-agreements
    echo [!!] Git installed. Please CLOSE this window and double-click this file again.
    pause
    exit /b 0
)

echo [!!] winget not available. Please install Git manually:
echo      1. Open your browser
echo      2. Go to https://git-scm.com/download/win
echo      3. Download and install
echo      4. After install, close this window and double-click this file again
echo.
pause
exit /b 1

:CLONE
cd /d "%USERPROFILE%"

REM Clone or update repo
if exist "audit-dashboard" (
    echo [..] Updating existing installation...
    cd audit-dashboard
    git pull
) else (
    echo [..] Downloading Audit Dashboard...
    git clone https://github.com/Jasurya00/audit-dashboard.git
    cd audit-dashboard
)

REM Install dependencies
echo [..] Installing dependencies...
call npm install

echo.
echo ==============================
echo   Audit Dashboard is starting
echo   Browser will open shortly
echo ==============================
echo.

REM Start server
node server.js
