#!/usr/bin/env bash
# Build the client and copy the resulting dist into the server folder.
# Usage: ./build-and-deploy.sh
#!/bin/zsh
set -e

echo "--- Building client ---"
cd client
npm install
npm run build

echo "--- Preparing server ---"
cd ../server
npm install

echo "--- Copying client build to server ---"
rm -rf dist
cp -r ../client/dist ./

echo "--- Starting server ---"
node server.js
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$ROOT_DIR/client"
SERVER_DIR="$ROOT_DIR/server"
BUILD_DIR="$CLIENT_DIR/dist"
TARGET_DIR="$SERVER_DIR/dist"

echo "[build-and-deploy] root: $ROOT_DIR"

if [ ! -d "$CLIENT_DIR" ]; then
  echo "Client folder not found: $CLIENT_DIR" >&2
  exit 1
fi

cd "$CLIENT_DIR"

if [ ! -f package.json ]; then
  echo "No package.json in $CLIENT_DIR, can't run build" >&2
  exit 1
fi

echo "[build-and-deploy] running npm run build in $CLIENT_DIR"
npm run build

if [ ! -d "$BUILD_DIR" ]; then
  echo "Build output not found: $BUILD_DIR" >&2
  exit 1
fi

# Remove old target and copy new build
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

echo "[build-and-deploy] copying build files to $TARGET_DIR"
# copy all files preserving attributes; dotfiles included
cp -a "$BUILD_DIR/." "$TARGET_DIR/"

echo "[build-and-deploy] done. Files copied to $TARGET_DIR"

# optional: list files copied (first lines)
ls -la "$TARGET_DIR" | sed -n '1,50p'

exit 0
