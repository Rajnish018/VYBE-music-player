#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(pwd)"
PROVIDER_DIR="$PROJECT_ROOT/youtube-provider"

echo "========================================"
echo "Setting up YouTube provider"
echo "========================================"

# --------------------------------------------------
# 1. Install yt-dlp
# --------------------------------------------------

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

# --------------------------------------------------
# 2. Install bgutil PO-token plugin
# --------------------------------------------------

echo "[YouTube] Installing bgutil PO-token plugin..."

python3 -m pip install --upgrade \
    bgutil-ytdlp-pot-provider

# --------------------------------------------------
# 3. Provider location
# --------------------------------------------------

echo "[YouTube] Provider directory:"
echo "$PROVIDER_DIR"

# --------------------------------------------------
# 4. Clone provider if incomplete
# --------------------------------------------------

if [ ! -f "$PROVIDER_DIR/server/package.json" ]; then

    echo "[YouTube] Provider source missing/incomplete"
    echo "[YouTube] Cloning bgutil provider..."

    rm -rf "$PROVIDER_DIR"

    git clone \
        --depth 1 \
        --branch 2.0.0 \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git \
        "$PROVIDER_DIR"
else
    echo "[YouTube] Provider source exists"
fi

# --------------------------------------------------
# 5. Install provider dependencies
# --------------------------------------------------

cd "$PROVIDER_DIR/server"

echo "[YouTube] Installing provider dependencies..."

npm install

# --------------------------------------------------
# 6. Build provider
# --------------------------------------------------

echo "[YouTube] Building provider..."

npx tsc

# --------------------------------------------------
# 7. Verify provider build
# --------------------------------------------------

if [ ! -f "$PROVIDER_DIR/server/build/main.js" ]; then
    echo "[YouTube] ERROR: provider build failed"
    exit 1
fi

echo "[YouTube] Provider build verified:"
ls -lh "$PROVIDER_DIR/server/build/main.js"

# --------------------------------------------------
# 8. Verify yt-dlp
# --------------------------------------------------

cd "$PROJECT_ROOT"

echo "[YouTube] Checking yt-dlp..."

command -v yt-dlp
yt-dlp --version

# --------------------------------------------------
# 9. Check PO-token provider discovery
# --------------------------------------------------

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

echo "[YouTube] yt-dlp:"
command -v yt-dlp
yt-dlp --version

echo "[YouTube] Provider:"
echo "$PROVIDER_DIR/server/build/main.js"