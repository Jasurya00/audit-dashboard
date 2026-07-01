#!/bin/bash
# Audit Dashboard - Zero-interaction setup
# Run: curl -fsSL https://raw.githubusercontent.com/Jasurya00/audit-dashboard/main/setup.sh | bash

set -e

INSTALL_DIR="$HOME/audit-dashboard"

# Install Node.js silently if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            HOMEBREW_NO_AUTO_UPDATE=1 brew install node 2>/dev/null
        else
            # Install via official pkg (no brew needed)
            curl -fsSL https://nodejs.org/dist/v20.11.0/node-v20.11.0.pkg -o /tmp/node.pkg
            sudo installer -pkg /tmp/node.pkg -target / 2>/dev/null
            rm -f /tmp/node.pkg
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null
        sudo apt-get install -y nodejs 2>/dev/null
    fi
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js installation failed."
    echo "Please install Node.js from https://nodejs.org and re-run this script."
    exit 1
fi

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Downloading Audit Dashboard..."
    git clone https://github.com/Jasurya00/audit-dashboard.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies silently
npm install --silent 2>/dev/null

# Start server
echo ""
echo "=============================="
echo "  Audit Dashboard is starting"
echo "=============================="
echo ""
node server.js
