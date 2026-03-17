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

# 3. Build Android APK (if Android SDK available)
APK_SRC="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
APK_DEST="src-tauri/target/release/bundle/TaskPad_${V}.apk"
if [ -n "$ANDROID_HOME" ]; then
  echo "--- Building Android APK ---"
  npm run android:build
  if [ -f "$APK_SRC" ]; then
    # Sign the APK
    ZIPALIGN="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/zipalign"
    APKSIGNER="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)/apksigner"
    APK_ALIGNED="${APK_DEST%.apk}-aligned.apk"
    KEYSTORE="$HOME/.tauri/taskpad-android.keystore"
    if [ -f "$KEYSTORE" ]; then
      "$ZIPALIGN" -f 4 "$APK_SRC" "$APK_ALIGNED"
      "$APKSIGNER" sign --ks "$KEYSTORE" --ks-pass pass:taskpad123 --out "$APK_DEST" "$APK_ALIGNED"
      rm -f "$APK_ALIGNED"
      echo "APK signed: $APK_DEST"
    else
      cp "$APK_SRC" "$APK_DEST"
      echo "Warning: No keystore found, APK is unsigned"
    fi
  fi
else
  echo "--- Skipping Android build (ANDROID_HOME not set) ---"
fi

# 4. Inject signatures into endpoint files
echo "--- Injecting signatures ---"
bash scripts/bump-version.sh --post-build "$V"

# 5. Commit & push
echo "--- Committing ---"
git add -A
git commit -m "release: v$V

${NOTES}"
git push

# 6. Create GitHub Release with artifacts
echo "--- Creating GitHub Release ---"
NSIS_ZIP="src-tauri/target/release/bundle/nsis/TaskPad_${V}_x64-setup.nsis.zip"
NSIS_EXE="src-tauri/target/release/bundle/nsis/TaskPad_${V}_x64-setup.exe"

ASSETS=""
[ -f "$NSIS_ZIP" ] && ASSETS="$ASSETS $NSIS_ZIP"
[ -f "$NSIS_EXE" ] && ASSETS="$ASSETS $NSIS_EXE"
[ -f "$APK_DEST" ] && ASSETS="$ASSETS $APK_DEST"

gh release create "v$V" $ASSETS --title "v$V" --notes "${NOTES:-Release v$V}"

echo "=== v$V released! ==="
