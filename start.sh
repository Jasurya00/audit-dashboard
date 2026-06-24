#!/bin/bash

# Audit Dashboard - One-click launcher
# Works on macOS and Linux without any pre-installed dependencies

set -e

echo "🚀 Starting Audit Dashboard setup..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "📦 Node.js not found. Installing..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo "Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install node
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y nodejs npm
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs npm
        else
            echo "❌ Could not install Node.js automatically."
            echo "Please install Node.js manually from https://nodejs.org"
            exit 1
        fi
    fi

    if ! command -v node &> /dev/null; then
        echo "❌ Node.js installation failed. Please install manually from https://nodejs.org"
        exit 1
    fi
fi

echo "✅ Node.js $(node --version) found"

# Navigate to script directory
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "✅ Dependencies ready"
echo "🌐 Launching Audit Dashboard..."
echo ""

# Start the server
node server.js
