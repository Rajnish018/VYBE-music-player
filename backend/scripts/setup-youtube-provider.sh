#!/usr/bin/env bash

set -euo pipefail

echo "========================================"
echo "YouTube provider setup"
echo "========================================"

# --------------------------------------------------
# 1. Install yt-dlp + bgutil plugin
# --------------------------------------------------

echo "[YouTube] Installing yt-dlp..."

python3 -m pip install --user --upgrade yt-dlp

export PATH="$HOME/.local/bin:$PATH"

echo "[YouTube] yt-dlp path:"
command -v yt-dlp

echo "[YouTube] yt-dlp version:"
yt-dlp --version

echo "[YouTube] Installing bgutil PO-token plugin..."

python3 -m pip install --user --upgrade \
  bgutil-ytdlp-pot-provider

# --------------------------------------------------
# 2. Provider location
# --------------------------------------------------

PROVIDER_DIR="$(pwd)/youtube-provider"

echo "[YouTube] Provider directory:"
echo "$PROVIDER_DIR"

# --------------------------------------------------
# 3. Clone provider
# --------------------------------------------------

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

# --------------------------------------------------
# 4. Build provider
# --------------------------------------------------

cd "$PROVIDER_DIR/server"

echo "[YouTube] Installing provider dependencies..."

npm ci

echo "[YouTube] Building provider..."

npx tsc

# --------------------------------------------------
# 5. Verify provider build
# --------------------------------------------------

if [ ! -f "$PROVIDER_DIR/server/build/main.js" ]; then
    echo "[YouTube] ERROR: Provider build/main.js was not created"
    exit 1
fi

echo "[YouTube] Provider build verified:"
ls -lh "$PROVIDER_DIR/server/build/main.js"

# --------------------------------------------------
# 6. Verify yt-dlp plugin discovery
# --------------------------------------------------

echo "[YouTube] Checking PO-token provider discovery..."

cd "$(pwd | sed 's#/youtube-provider/server##')"

yt-dlp --verbose \
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
echo "$PROVIDER_DIR/server/build/main.js"#!/usr/bin/env bash

set -euo pipefail

echo "========================================"
echo "YouTube provider setup"
echo "========================================"

# --------------------------------------------------
# 1. Install yt-dlp + bgutil plugin
# --------------------------------------------------

echo "[YouTube] Installing yt-dlp..."

python3 -m pip install --user --upgrade yt-dlp

export PATH="$HOME/.local/bin:$PATH"

echo "[YouTube] yt-dlp path:"
command -v yt-dlp

echo "[YouTube] yt-dlp version:"
yt-dlp --version

echo "[YouTube] Installing bgutil PO-token plugin..."

python3 -m pip install --user --upgrade \
  bgutil-ytdlp-pot-provider

# --------------------------------------------------
# 2. Provider location
# --------------------------------------------------

PROVIDER_DIR="$(pwd)/youtube-provider"

echo "[YouTube] Provider directory:"
echo "$PROVIDER_DIR"

# --------------------------------------------------
# 3. Clone provider
# --------------------------------------------------

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

# --------------------------------------------------
# 4. Build provider
# --------------------------------------------------

cd "$PROVIDER_DIR/server"

echo "[YouTube] Installing provider dependencies..."

npm ci

echo "[YouTube] Building provider..."

npx tsc

# --------------------------------------------------
# 5. Verify provider build
# --------------------------------------------------

if [ ! -f "$PROVIDER_DIR/server/build/main.js" ]; then
    echo "[YouTube] ERROR: Provider build/main.js was not created"
    exit 1
fi

echo "[YouTube] Provider build verified:"
ls -lh "$PROVIDER_DIR/server/build/main.js"

# --------------------------------------------------
# 6. Verify yt-dlp plugin discovery
# --------------------------------------------------

echo "[YouTube] Checking PO-token provider discovery..."

cd "$(pwd | sed 's#/youtube-provider/server##')"

yt-dlp --verbose \
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