#!/bin/bash
# Usage: ./scripts/bump-version.sh 1.4.9
V="$1"
if [ -z "$V" ]; then echo "Usage: bump-version.sh <version>"; exit 1; fi
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$V\"/" package.json public/version.json src-tauri/tauri.conf.json
sed -i "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v$V/" src/App.jsx
echo "Bumped to $V"
