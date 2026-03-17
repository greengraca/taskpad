#!/bin/bash
# Usage: ./scripts/bump-version.sh <version> [notes]
#        ./scripts/bump-version.sh --post-build <version>
set -e

if [ "$1" = "--post-build" ]; then
  V="$2"
  if [ -z "$V" ]; then echo "Usage: bump-version.sh --post-build <version>"; exit 1; fi

  BUNDLE_DIR="src-tauri/target/release/bundle"

  # Update each updater endpoint with signature from .sig files
  for target_dir in public/update/*/; do
    target=$(basename "$target_dir")
    sig_file=""

    case "$target" in
      windows-x86_64) sig_file=$(find "$BUNDLE_DIR/nsis" -name "*.nsis.zip.sig" 2>/dev/null | head -1) ;;
      darwin-aarch64|darwin-x86_64) sig_file=$(find "$BUNDLE_DIR/macos" -name "*.tar.gz.sig" 2>/dev/null | head -1) ;;
      linux-x86_64) sig_file=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage.tar.gz.sig" 2>/dev/null | head -1) ;;
    esac

    if [ -n "$sig_file" ] && [ -f "$sig_file" ]; then
      sig=$(cat "$sig_file")
      # Update the signature in the endpoint JSON
      sed -i "s|\"signature\": \"[^\"]*\"|\"signature\": \"$sig\"|" "${target_dir}latest.json"
      echo "Updated signature for $target"
    else
      echo "Warning: No .sig file found for $target"
    fi
  done

  echo "Post-build signatures updated for v$V"
  exit 0
fi

V="$1"
NOTES="$2"
if [ -z "$V" ]; then echo "Usage: bump-version.sh <version> [notes]"; exit 1; fi

# Update version in all config files
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$V\"/" package.json public/version.json src-tauri/tauri.conf.json
sed -i "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v$V/" src/App.jsx

# Update notes if provided
if [ -n "$NOTES" ]; then
  sed -i "s|\"notes\": \"[^\"]*\"|\"notes\": \"$NOTES\"|" public/version.json
fi

# Update updater endpoint files
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BASE_URL="https://github.com/greengraca/taskpad/releases/download/v${V}"
for target_dir in public/update/*/; do
  target=$(basename "$target_dir")
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$V\"/" "${target_dir}latest.json"
  sed -i "s/\"pub_date\": \"[^\"]*\"/\"pub_date\": \"$DATE\"/" "${target_dir}latest.json"
  if [ -n "$NOTES" ]; then
    sed -i "s|\"notes\": \"[^\"]*\"|\"notes\": \"$NOTES\"|" "${target_dir}latest.json"
  fi

  # Update download URL per target
  case "$target" in
    windows-x86_64) sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${BASE_URL}/TaskPad_${V}_x64-setup.nsis.zip\"|" "${target_dir}latest.json" ;;
    darwin-aarch64) sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${BASE_URL}/TaskPad_${V}_aarch64.app.tar.gz\"|" "${target_dir}latest.json" ;;
    darwin-x86_64)  sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${BASE_URL}/TaskPad_${V}_x64.app.tar.gz\"|" "${target_dir}latest.json" ;;
    linux-x86_64)   sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${BASE_URL}/TaskPad_${V}_amd64.AppImage.tar.gz\"|" "${target_dir}latest.json" ;;
  esac
done

# Update android APK URL
APK_URL="https://github.com/greengraca/taskpad/releases/download/v${V}/TaskPad_${V}.apk"
sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${APK_URL}\"|" public/version.json

echo "Bumped to v$V"
