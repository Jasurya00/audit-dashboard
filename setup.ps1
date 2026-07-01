# Audit Dashboard - Zero-interaction setup for Windows
# Run: irm https://raw.githubusercontent.com/Jasurya00/audit-dashboard/main/setup.ps1 | iex

$ErrorActionPreference = "Stop"
$INSTALL_DIR = "$HOME\audit-dashboard"

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js..."
    # Download and install Node.js silently
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $installer = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $installer -UseBasicParsing
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$installer`" /quiet /norestart"
    Remove-Item $installer -Force
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js installation failed."
    Write-Host "Please install Node.js from https://nodejs.org and re-run this script."
    exit 1
}

Write-Host "Node.js $(node --version) found"

# Clone or update repo
if (Test-Path $INSTALL_DIR) {
    Write-Host "Updating existing installation..."
    Set-Location $INSTALL_DIR
    git pull
} else {
    Write-Host "Downloading Audit Dashboard..."
    git clone https://github.com/Jasurya00/audit-dashboard.git $INSTALL_DIR
    Set-Location $INSTALL_DIR
}

# Install dependencies
Write-Host "Installing dependencies..."
npm install --silent 2>$null

Write-Host ""
Write-Host "=============================="
Write-Host "  Audit Dashboard is starting"
Write-Host "=============================="
Write-Host ""

# Start server
node server.js
