#!/usr/bin/env bash
# Install SSL redirect shim for CodexBar GNOME extension (Antigravity support)
set -euo pipefail

SHIM_DIR="$HOME/.codexbar"
mkdir -p "$SHIM_DIR"

echo "Downloading cert_redirect.c from GitHub..."
curl -fsSL https://raw.githubusercontent.com/InledGroup/codexbar-gnome/main/shim/cert_redirect.c -o "$SHIM_DIR/cert_redirect.c"

echo "Compiling SSL redirect shim..."
COMPILER=""
for cmd in gcc clang cc; do
    if command -v "$cmd" >/dev/null 2>&1; then
        COMPILER="$cmd"
        break
    fi
done

if [[ -z "$COMPILER" ]]; then
    echo "Error: No C compiler (gcc/clang/cc) found. Please install gcc or clang and retry."
    exit 1
fi

if "$COMPILER" -shared -fPIC -o "$SHIM_DIR/cert_redirect.so" "$SHIM_DIR/cert_redirect.c" -ldl; then
    echo "Successfully compiled and installed: $SHIM_DIR/cert_redirect.so"
    rm -f "$SHIM_DIR/cert_redirect.c"
else
    echo "Error: Failed to compile the SSL redirect shim."
    exit 1
fi
