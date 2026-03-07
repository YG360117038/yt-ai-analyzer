#!/usr/bin/env bash
# Render.com build script
# Bu script Render dashboard'da Build Command olarak ayarlanir:
#   chmod +x render-build.sh && ./render-build.sh

set -e

echo "=== Installing Node dependencies ==="
npm install

echo "=== Installing Python3 & pip ==="
apt-get update && apt-get install -y python3 python3-pip

echo "=== Installing yt-dlp ==="
pip3 install --break-system-packages yt-dlp

echo "=== Verifying installations ==="
python3 --version
yt-dlp --version

echo "=== Build complete ==="
