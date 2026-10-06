#!/usr/bin/env bash

set -euo pipefail

PROVIDER_DIR="$(pwd)/youtube-provider/server"
PROVIDER_ENTRY="$PROVIDER_DIR/build/main.js"

echo "========================================"
echo "Starting VYBE production"
echo "========================================"

# --------------------------------------------------
# Verify bgutil PO-token provider
# --------------------------------------------------

if [ ! -f "$PROVIDER_ENTRY" ]; then
    echo "[YouTube] ERROR: bgutil provider not built"
    echo "[YouTube] Expected:"
    echo "$PROVIDER_ENTRY"
    exit 1
fi

echo "[YouTube] Provider:"
echo "$PROVIDER_ENTRY"

# --------------------------------------------------
# Start bgutil PO-token provider
# --------------------------------------------------

echo "[YouTube] Starting PO-token provider..."

node "$PROVIDER_ENTRY" &
PROVIDER_PID=$!

cleanup() {
    echo "[YouTube] Stopping PO-token provider..."

    if kill -0 "$PROVIDER_PID" 2>/dev/null; then
        kill "$PROVIDER_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

# --------------------------------------------------
# Wait for provider
# --------------------------------------------------

echo "[YouTube] Waiting for PO-token provider..."

PROVIDER_READY=false

for i in $(seq 1 30); do
    if curl -fsS \
        http://127.0.0.1:4416/ping \
        >/dev/null 2>&1; then

        PROVIDER_READY=true
        echo "[YouTube] PO-token provider is ready"
        break
    fi

    sleep 1
done

# --------------------------------------------------
# Final health check
# --------------------------------------------------

if [ "$PROVIDER_READY" != "true" ]; then
    echo "[YouTube] ERROR: PO-token provider failed to start"

    if kill -0 "$PROVIDER_PID" 2>/dev/null; then
        kill "$PROVIDER_PID" 2>/dev/null || true
    fi

    exit 1
fi

if ! curl -fsS \
    http://127.0.0.1:4416/ping \
    >/dev/null 2>&1; then

    echo "[YouTube] ERROR: PO-token provider health check failed"

    if kill -0 "$PROVIDER_PID" 2>/dev/null; then
        kill "$PROVIDER_PID" 2>/dev/null || true
    fi

    exit 1
fi

echo "[YouTube] PO-token provider health check passed"

# --------------------------------------------------
# Start VYBE backend
# --------------------------------------------------

echo "[Backend] Starting VYBE..."

exec npm start