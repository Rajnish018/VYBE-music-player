#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(pwd)"
PROVIDER_DIR="$PROJECT_ROOT/youtube-provider"

# --------------------------------------------------
# Configuration
# --------------------------------------------------

YOUTUBE_TEST_VIDEO_ID="${YOUTUBE_TEST_VIDEO_ID:-S7tYeUBgGHU}"

# Default cookie file location.
# You can override it with:
# COOKIES_FILE=/path/to/cookies.txt
COOKIES_FILE="${COOKIES_FILE:-$PROJECT_ROOT/cookies.txt}"

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
        --branch 2.0.1 \
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

echo "========================================"
echo "[YouTube] PO-token provider diagnostic"
echo "========================================"

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

# --------------------------------------------------
# 10. Check YOUTUBE_PROXY
# --------------------------------------------------

echo "[YouTube] Checking YOUTUBE_PROXY..."

if [ -z "${YOUTUBE_PROXY:-}" ]; then

    echo "[YouTube] WARNING: YOUTUBE_PROXY is not configured"
    echo "[YouTube] Proxy diagnostics will be skipped"

    PROXY_AVAILABLE="false"

else

    echo "[YouTube] YOUTUBE_PROXY is configured"
    echo "[YouTube] Proxy diagnostics enabled"

    PROXY_AVAILABLE="true"

fi

# --------------------------------------------------
# 11. Check cookie file
# --------------------------------------------------

echo "[YouTube] Checking cookie file..."

if [ -f "$COOKIES_FILE" ]; then

    echo "[YouTube] Cookie file:"
    echo "available"

    COOKIES_AVAILABLE="true"

else

    echo "[YouTube] Cookie file:"
    echo "not available"

    echo "[YouTube] Cookie-based diagnostics will be skipped"

    COOKIES_AVAILABLE="false"

fi

# ==================================================
# 12. WITHOUT COOKIES
# ==================================================

if [ "$PROXY_AVAILABLE" = "true" ]; then

    echo
    echo "========================================"
    echo "[YouTube] TEST 1: ANDROID + PROXY + NO COOKIES"
    echo "========================================"

    echo "[YouTube] Video:"
    echo "$YOUTUBE_TEST_VIDEO_ID"

    echo
    echo "[YouTube] Running format discovery..."
    echo "[YouTube] Cookies: DISABLED"
    echo "[YouTube] Proxy: ENABLED"
    echo

    if yt-dlp \
        --js-runtimes node \
        --no-playlist \
        --no-warnings \
        --proxy "$YOUTUBE_PROXY" \
        --extractor-args "youtube:player_client=android" \
        -F \
        "https://www.youtube.com/watch?v=${YOUTUBE_TEST_VIDEO_ID}"; then

        echo
        echo "[YouTube] TEST 1 FORMAT DISCOVERY: SUCCESS"

    else

        echo
        echo "[YouTube] TEST 1 FORMAT DISCOVERY: FAILED"
    fi

    echo
    echo "----------------------------------------"
    echo "[YouTube] TEST 1B: FORMAT 18 URL"
    echo "----------------------------------------"

    echo "[YouTube] Cookies: DISABLED"
    echo "[YouTube] Proxy: ENABLED"
    echo

    NO_COOKIE_URL="$(
        yt-dlp \
            --js-runtimes node \
            --no-playlist \
            --no-warnings \
            --proxy "$YOUTUBE_PROXY" \
            --extractor-args "youtube:player_client=android" \
            -f 18 \
            --get-url \
            "https://www.youtube.com/watch?v=${YOUTUBE_TEST_VIDEO_ID}" \
            2>/tmp/youtube-no-cookie-error.log
    )" || NO_COOKIE_STATUS=$?

    NO_COOKIE_STATUS="${NO_COOKIE_STATUS:-0}"

    if [ "$NO_COOKIE_STATUS" -eq 0 ] && [ -n "$NO_COOKIE_URL" ]; then

        echo "[YouTube] TEST 1B FORMAT 18: SUCCESS"
        echo "[YouTube] Signed media URL generated successfully"

    else

        echo "[YouTube] TEST 1B FORMAT 18: FAILED"
        echo "[YouTube] yt-dlp exit code: $NO_COOKIE_STATUS"

        if [ -s /tmp/youtube-no-cookie-error.log ]; then
            echo "[YouTube] Error summary:"
            tail -n 20 /tmp/youtube-no-cookie-error.log
        fi

    fi

else

    echo
    echo "[YouTube] TEST 1 skipped because YOUTUBE_PROXY is not configured"

fi

# ==================================================
# 13. WITH COOKIES
# ==================================================

if [ "$PROXY_AVAILABLE" = "true" ] && [ "$COOKIES_AVAILABLE" = "true" ]; then

    echo
    echo "========================================"
    echo "[YouTube] TEST 2: ANDROID + PROXY + COOKIES"
    echo "========================================"

    echo "[YouTube] Video:"
    echo "$YOUTUBE_TEST_VIDEO_ID"

    echo
    echo "[YouTube] Running format discovery..."
    echo "[YouTube] Cookies: ENABLED"
    echo "[YouTube] Proxy: ENABLED"
    echo "[YouTube] Cookie contents will NOT be printed"
    echo

    if yt-dlp \
        --js-runtimes node \
        --no-playlist \
        --no-warnings \
        --cookies "$COOKIES_FILE" \
        --proxy "$YOUTUBE_PROXY" \
        --extractor-args "youtube:player_client=android" \
        -F \
        "https://www.youtube.com/watch?v=${YOUTUBE_TEST_VIDEO_ID}"; then

        echo
        echo "[YouTube] TEST 2 FORMAT DISCOVERY: SUCCESS"

    else

        echo
        echo "[YouTube] TEST 2 FORMAT DISCOVERY: FAILED"
    fi

    echo
    echo "----------------------------------------"
    echo "[YouTube] TEST 2B: FORMAT 18 URL"
    echo "----------------------------------------"

    echo "[YouTube] Cookies: ENABLED"
    echo "[YouTube] Proxy: ENABLED"
    echo

    WITH_COOKIE_URL="$(
        yt-dlp \
            --js-runtimes node \
            --no-playlist \
            --no-warnings \
            --cookies "$COOKIES_FILE" \
            --proxy "$YOUTUBE_PROXY" \
            --extractor-args "youtube:player_client=android" \
            -f 18 \
            --get-url \
            "https://www.youtube.com/watch?v=${YOUTUBE_TEST_VIDEO_ID}" \
            2>/tmp/youtube-cookie-error.log
    )" || WITH_COOKIE_STATUS=$?

    WITH_COOKIE_STATUS="${WITH_COOKIE_STATUS:-0}"

    if [ "$WITH_COOKIE_STATUS" -eq 0 ] && [ -n "$WITH_COOKIE_URL" ]; then

        echo "[YouTube] TEST 2B FORMAT 18: SUCCESS"
        echo "[YouTube] Signed media URL generated successfully"

    else

        echo "[YouTube] TEST 2B FORMAT 18: FAILED"
        echo "[YouTube] yt-dlp exit code: $WITH_COOKIE_STATUS"

        if [ -s /tmp/youtube-cookie-error.log ]; then
            echo "[YouTube] Error summary:"
            tail -n 20 /tmp/youtube-cookie-error.log
        fi

    fi

else

    echo
    echo "========================================"
    echo "[YouTube] TEST 2 skipped"
    echo "========================================"

    if [ "$PROXY_AVAILABLE" != "true" ]; then
        echo "[YouTube] Reason: YOUTUBE_PROXY is not configured"
    fi

    if [ "$COOKIES_AVAILABLE" != "true" ]; then
        echo "[YouTube] Reason: cookies.txt is not available"
    fi

fi

# --------------------------------------------------
# 14. Cleanup diagnostic error files
# --------------------------------------------------

rm -f \
    /tmp/youtube-no-cookie-error.log \
    /tmp/youtube-cookie-error.log

# --------------------------------------------------
# 15. Final setup summary
# --------------------------------------------------

echo
echo "========================================"
echo "YouTube provider setup complete"
echo "========================================"

echo "[YouTube] yt-dlp:"
command -v yt-dlp
yt-dlp --version

echo
echo "[YouTube] Provider:"
echo "$PROVIDER_DIR/server/build/main.js"

echo
echo "[YouTube] Proxy:"
if [ "$PROXY_AVAILABLE" = "true" ]; then
    echo "configured"
else
    echo "not configured"
fi

echo
echo "[YouTube] Cookies:"
if [ "$COOKIES_AVAILABLE" = "true" ]; then
    echo "available"
else
    echo "not available"
fi

echo
echo "[YouTube] Diagnostic video:"
echo "$YOUTUBE_TEST_VIDEO_ID"

echo
echo "========================================"
echo "Diagnostic tests finished"
echo "========================================"