#!/bin/bash
# Usage: ./scripts/bump-version.sh 1.4.9 "Release notes here"
V="$1"
NOTES="$2"
if [ -z "$V" ]; then echo "Usage: bump-version.sh <version> [notes]"; exit 1; fi
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$V\"/" package.json public/version.json src-tauri/tauri.conf.json
sed -i "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v$V/" src/App.jsx
if [ -n "$NOTES" ]; then
  sed -i "s/\"notes\": \"[^\"]*\"/\"notes\": \"$NOTES\"/" public/version.json
fi
echo "Bumped to $V"
