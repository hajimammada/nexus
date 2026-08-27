#!/bin/bash
# =========================================================================
# Nexus Universal Home Satellite 1-Line Installer for Android (Termux) & Linux
# Usage: curl -sSL https://nexus.hajimammad.com/satellite.sh | bash
# =========================================================================

set -e

echo -e "\033[1;36m========================================================\033[0m"
echo -e "\033[1;36m📡 Installing Nexus Universal Home Satellite Relay...\033[0m"
echo -e "\033[1;36m========================================================\033[0m"

# 1. Install Node.js if missing
if ! command -v node &> /dev/null; then
    echo -e "\033[1;33mNode.js not found. Installing...\033[0m"
    if command -v pkg &> /dev/null; then
        pkg update -y && pkg install -y nodejs openssh git
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update -y && sudo apt-get install -y nodejs npm openssh-client git
    elif command -v apk &> /dev/null; then
        apk add --no-cache nodejs npm openssh git
    else
        echo "Please install Node.js manually on your system."
        exit 1
    fi
fi

INSTALL_DIR="$HOME/nexus-satellite"
echo -e "\033[1;32m✓ Node.js detected: $(node -v)\033[0m"

# 2. Setup directory & download package
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "\033[1;36mDownloading latest satellite files...\033[0m"
curl -sSL "https://raw.githubusercontent.com/hajimammada/nexus/main/satellite/package.json" -o package.json
curl -sSL "https://raw.githubusercontent.com/hajimammada/nexus/main/satellite/server.js" -o server.js
mkdir -p public
curl -sSL "https://raw.githubusercontent.com/hajimammada/nexus/main/satellite/public/index.html" -o public/index.html

# 3. Install dependencies
echo -e "\033[1;36mInstalling npm dependencies...\033[0m"
npm install --production

# 4. Detect IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "\033[1;32m========================================================\033[0m"
echo -e "\033[1;32m🎉 SATELLITE RELAY READY & STARTING!\033[0m"
echo -e "\033[1;32m========================================================\033[0m"
echo -e "Open on your phone: \033[1;33mhttp://${LOCAL_IP}:5050\033[0m"
echo -e "Enter your PC's 6-digit PIN to link."
echo -e "\033[1;32m========================================================\033[0m"
echo ""

node server.js
