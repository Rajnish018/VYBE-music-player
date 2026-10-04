#!/usr/bin/env bash

set -e

echo "========================================"
echo "YouTube provider setup"
echo "========================================"

# Install/update yt-dlp
python3 -m pip install --user --upgrade yt-dlp

export PATH="$HOME/.local/bin:$PATH"

echo "[YouTube] yt-dlp version:"
yt-dlp --version

# Provider location
PROVIDER_DIR="$HOME/bgutil-ytdlp-pot-provider"

# Clone only if missing
if [ ! -d "$PROVIDER_DIR" ]; then
    echo "[YouTube] Installing bgutil provider..."

    git clone \
      --single-branch \
      --branch 2.0.0 \
      https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
      "$PROVIDER_DIR"
else
    echo "[YouTube] Provider already exists"
fi

# Build provider script
cd "$PROVIDER_DIR/server"

echo "[YouTube] Installing provider dependencies..."
npm ci

echo "[YouTube] Building provider..."
npx tsc

# Install plugin through pip
echo "[YouTube] Installing yt-dlp PO token plugin..."

python3 -m pip install --user --upgrade bgutil-ytdlp-pot-provider

export PATH="$HOME/.local/bin:$PATH"

echo "========================================"
echo "Provider installed"
echo "========================================"

yt-dlp -v \
  "https://www.youtube.com/watch?v=gdGUeX1i0n0" \
  --skip-download \
  2>&1 | grep -E "PO Token Providers|bgutil" || true