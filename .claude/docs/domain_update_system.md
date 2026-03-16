# Domain: Update System

## Platform Detection Flow

```
window.__TAURI__ → isTauri() (updater.js)
  ├─ true → platform() (@tauri-apps/plugin-os) → isAndroid() / isDesktop()
  └─ false → isPWA()
```

Three update paths based on platform. All share the same UI banner in `App.jsx`.

## Desktop Update Flow (Tauri updater plugin)

```
App launch → checkForUpdates (updater.js:checkDesktopUpdate)
  → check() (@tauri-apps/plugin-updater) → calls endpoint in tauri.conf.json
  → endpoint returns { version, url, signature } (public/update/{target}/latest.json)
  → semver compare → if newer → setUpdateInfo (App.jsx)
  → user clicks Update → downloadAndInstall (updater.js:downloadDesktopUpdate)
  → signature verified → installed → relaunch() (@tauri-apps/plugin-process)
```

**Endpoint config**: `tauri.conf.json` → `plugins.updater.endpoints` with `{{target}}/{{current_version}}` placeholders. Vercel rewrite (`vercel.json`) maps any version to `latest.json`.

**Signing**: Artifacts signed at build time via `TAURI_SIGNING_PRIVATE_KEY` env var. Public key in `tauri.conf.json` → `plugins.updater.pubkey`.

## Android Update Flow (Custom)

```
App launch → checkForUpdates (updater.js:checkAndroidUpdate)
  → fetch version.json (public/version.json) → semver compare
  → if newer → setUpdateInfo (App.jsx)
  → user clicks Update → invoke('download_apk') (Rust: src-tauri/src/android_update.rs)
  → downloads to app cache dir → emits 'apk-download-progress' events
  → user clicks Install → invoke('plugin:apk-installer|installApk') (Kotlin: ApkInstallerPlugin.kt)
  → FileProvider content:// URI → ACTION_VIEW intent → Android package installer
```

## PWA Update Flow (Service Worker)

```
Vite deploys new version → service worker detects change
  → fires 'sw-update-available' event (App.jsx listener)
  → swUpdate banner shown → user clicks Refresh → window.__swUpdate__()
```

Handled entirely by `vite-plugin-pwa` (`registerType: 'prompt'`). No custom code.

## Data Stores Touched

| Store | Owner | Access | Used by |
|-------|-------|--------|---------|
| `public/version.json` | bump-version.sh | read (Android) | Android update check |
| `public/update/{target}/latest.json` | bump-version.sh | read (desktop) | Tauri updater plugin |
| `~/.tauri/taskpad.key` | developer | build-time signing | `tauri build` |

## Cross-Domain Connections

- **Update system → App.jsx**: `updateInfo`, `updateProgress`, `updateError` state drives banner UI
- **Update system → bump-version.sh**: Script updates version in all config files + endpoint JSONs
- **NOT connected**: Update system is independent of Firebase sync, tasks, notes

## Gotchas

- Windows: `downloadAndInstall()` exits the app during NSIS install — `relaunch()` is unreachable
- Android: `file://` URIs blocked on API 24+ — must use FileProvider for `content://` URI
- Tauri updater requires signed artifacts — unsigned builds won't trigger updates
- `version.json` is for Android only; desktop uses per-target endpoint JSONs
