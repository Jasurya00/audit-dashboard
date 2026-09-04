#!/usr/bin/env bash
# Double-click this file to launch the Audit Dashboard.
# It finds Node.js, runs the setup, and opens the dashboard in your browser.

# Always run from the folder this launcher lives in (so double-click works).
cd "$(dirname "$0")" || exit 1

# Locate Node.js (double-clicked apps don't always inherit your shell PATH).
if ! command -v node >/dev/null 2>&1; then
  for p in /usr/local/bin /opt/homebrew/bin /usr/bin "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$p/node" ] && export PATH="$p:$PATH" && break
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Please install it once from https://nodejs.org, then double-click again."
  echo ""
  read -r -p "Press Enter to close..." _
  exit 1
fi

node setup.js

# Keep the window open if the server stops, so users can read any message.
echo ""
read -r -p "Server stopped. Press Enter to close..." _
