# Audit Dashboard - Zero-interaction setup for Windows
# Run: irm https://raw.githubusercontent.com/Jasurya00/audit-dashboard/main/setup.ps1 | iex

$ErrorActionPreference = "Stop"
$INSTALL_DIR = "$HOME\audit-dashboard"
$NODE_DIR = "$HOME\node-portable"

# Check if Node.js is installed
$nodeExists = $false
try {
    $null = Get-Command node -ErrorAction Stop
    $nodeExists = $true
} catch {}

if (-not $nodeExists) {
    # Check if portable node exists
    if (Test-Path "$NODE_DIR\node.exe") {
        $env:PATH = "$NODE_DIR;$env:PATH"
        $nodeExists = $true
    }
}

if (-not $nodeExists) {
    Write-Host "Node.js not found. Downloading portable version (no admin needed)..."
    $nodeZip = "$env:TEMP\node.zip"
    $nodeVersion = "v20.11.0"
    $nodeUrl = "https://nodejs.org/dist/$nodeVersion/node-$nodeVersion-win-x64.zip"
    
    Write-Host "Downloading Node.js $nodeVersion..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip -UseBasicParsing
    
    Write-Host "Extracting..."
    if (Test-Path "$env:TEMP\node-extract") { Remove-Item "$env:TEMP\node-extract" -Recurse -Force }
    Expand-Archive -Path $nodeZip -DestinationPath "$env:TEMP\node-extract" -Force
    
    # Move to permanent location
    if (Test-Path $NODE_DIR) { Remove-Item $NODE_DIR -Recurse -Force }
    Move-Item "$env:TEMP\node-extract\node-$nodeVersion-win-x64" $NODE_DIR
    
    # Clean up
    Remove-Item $nodeZip -Force -ErrorAction SilentlyContinue
    Remove-Item "$env:TEMP\node-extract" -Recurse -Force -ErrorAction SilentlyContinue
    
    # Add to PATH for this session
    $env:PATH = "$NODE_DIR;$env:PATH"
}

# Verify node works
try {
    $nodeVer = & node --version
    Write-Host "Node.js $nodeVer ready"
} catch {
    Write-Host "ERROR: Node.js setup failed."
    Write-Host "Please install Node.js manually from https://nodejs.org and re-run this script."
    exit 1
}

# Clone or update repo
if (Test-Path $INSTALL_DIR) {
    Write-Host "Updating existing installation..."
    Set-Location $INSTALL_DIR
    & git pull
} else {
    Write-Host "Downloading Audit Dashboard..."
    & git clone https://github.com/Jasurya00/audit-dashboard.git $INSTALL_DIR
    Set-Location $INSTALL_DIR
}

# Install dependencies
Write-Host "Installing dependencies..."
& "$NODE_DIR\npm.cmd" install --silent 2>$null
if ($LASTEXITCODE -ne 0) {
    & npm install --silent 2>$null
}

Write-Host ""
Write-Host "=============================="
Write-Host "  Audit Dashboard is starting"
Write-Host "=============================="
Write-Host ""

# Start server
& node server.js
