#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(pwd)"
PROVIDER_DIR="$PROJECT_ROOT/youtube-provider"

echo "========================================"
echo "Setting up YouTube provider"
echo "========================================"

echo "[YouTube] Python:"
python3 --version

echo "[YouTube] pip:"
python3 -m pip --version

echo "[YouTube] Installing yt-dlp..."
python3 -m pip install --upgrade yt-dlp

echo "[YouTube] yt-dlp path:"
command -v yt-dlp

echo "[YouTube] yt-dlp version:"
yt-dlp --version

echo "[YouTube] Installing bgutil PO-token plugin..."
python3 -m pip install --upgrade bgutil-ytdlp-pot-provider

echo "[YouTube] Provider directory:"
echo "$PROVIDER_DIR"

if [ ! -d "$PROVIDER_DIR" ]; then
    echo "[YouTube] Cloning bgutil provider..."

    git clone \
        --depth 1 \
        --branch 2.0.0 \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
        "$PROVIDER_DIR"
else
    echo "[YouTube] Provider already exists"
fi

cd "$PROVIDER_DIR/server"

echo "[YouTube] Installing provider dependencies..."
npm ci

echo "[YouTube] Building provider..."
npx tsc

if [ ! -f "$PROVIDER_DIR/server/build/main.js" ]; then
    echo "[YouTube] ERROR: provider build failed"
    exit 1
fi

echo "[YouTube] Provider build verified:"
echo "$PROVIDER_DIR/server/build/main.js"

cd "$PROJECT_ROOT"

echo "[YouTube] Checking yt-dlp..."
yt-dlp --version

echo "[YouTube] Checking PO-token provider discovery..."

yt-dlp \
    --verbose \
    --skip-download \
    --simulate \
    --js-runtimes node \
    "https://www.youtube.com/watch?v=gdGUeX1i0n0" \
    2>&1 | grep -E \
    "PO Token Providers|bgutil|JS Challenge Providers" \
    || true

echo "========================================"
echo "YouTube provider setup complete"
echo "========================================"