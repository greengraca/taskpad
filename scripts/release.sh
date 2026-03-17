#!/bin/bash
# Usage: ./scripts/release.sh <version> [notes]
# Does everything: bump version, build signed desktop, inject signatures, commit, push, deploy, create GitHub release.
set -e

V="$1"
NOTES="${2:-}"
if [ -z "$V" ]; then echo "Usage: release.sh <version> [notes]"; exit 1; fi

# Check required env vars
if [ -z "$TAURI_SIGNING_PRIVATE_KEY" ]; then
  echo "Error: TAURI_SIGNING_PRIVATE_KEY not set"
  echo "Run: export TAURI_SIGNING_PRIVATE_KEY=\$(cat ~/.tauri/taskpad.key)"
  exit 1
fi
if [ -z "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" ]; then
  echo "Error: TAURI_SIGNING_PRIVATE_KEY_PASSWORD not set"
  echo "Run: export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=yourpassword"
  exit 1
fi

echo "=== Releasing v$V ==="

# 1. Bump version
echo "--- Bumping version ---"
bash scripts/bump-version.sh "$V" "$NOTES"

# 2. Build signed desktop app
echo "--- Building desktop app ---"
npm run tauri:build

# 3. Inject signatures into endpoint files
echo "--- Injecting signatures ---"
bash scripts/bump-version.sh --post-build "$V"

# 4. Commit & push
echo "--- Committing ---"
git add -A
git commit -m "release: v$V

${NOTES}"
git push

# 5. Deploy to Vercel (endpoint JSONs + PWA)
echo "--- Deploying to Vercel ---"
npx vercel --prod --yes

# 6. Create GitHub Release with artifacts
echo "--- Creating GitHub Release ---"
NSIS_ZIP="src-tauri/target/release/bundle/nsis/TaskPad_${V}_x64-setup.nsis.zip"
NSIS_EXE="src-tauri/target/release/bundle/nsis/TaskPad_${V}_x64-setup.exe"

ASSETS=""
[ -f "$NSIS_ZIP" ] && ASSETS="$ASSETS $NSIS_ZIP"
[ -f "$NSIS_EXE" ] && ASSETS="$ASSETS $NSIS_EXE"

gh release create "v$V" $ASSETS --title "v$V" --notes "${NOTES:-Release v$V}"

echo "=== v$V released! ==="
