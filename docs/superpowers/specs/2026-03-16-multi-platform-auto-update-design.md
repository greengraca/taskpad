# TaskPad Multi-Platform with Auto-Updates

## Problem

TaskPad currently ships as a PWA (Vercel) and a Tauri 1.x desktop app that loads the remote Vercel URL in a webview. This means:
- Desktop app requires internet to function
- No Android support (Tauri 1.x has no mobile targets)
- Update experience is manual — user must re-download the installer

## Goal

Transform TaskPad into a fully offline-capable, locally-bundled app on desktop and Android, with a unified auto-update system that downloads and installs new versions seamlessly. Keep the PWA for web users.

## Targets

| Platform | Technology | Distribution |
|----------|-----------|-------------|
| Desktop (Win/Mac/Linux) | Tauri 2.0, local bundle | Self-hosted installer + auto-updater |
| Android | Tauri 2.0 mobile | Self-hosted APK + in-app updater |
| Web | Vite PWA (unchanged) | Vercel |

## Architecture

### One Codebase, Three Targets

The React app (`src/`) is the single source of truth. `npm run build` produces `dist/`, which is:
- Bundled into desktop binaries by Tauri
- Bundled into an Android APK by Tauri mobile
- Deployed to Vercel as the PWA

No React code is duplicated or forked per platform. Platform-specific logic lives only in:
- `src-tauri/` — Rust config and capabilities (handles both desktop and Android)
- `src/updater.js` — platform detection + update orchestration

### Files That Change

**Modified:**
- `src-tauri/tauri.conf.json` — new Tauri 2.0 schema (see Config Migration section)
- `src-tauri/Cargo.toml` — updated dependencies (see Cargo Migration section)
- `src-tauri/src/main.rs` — Tauri 2.0 builder API + plugin registration (see main.rs Migration section)
- `package.json` — `@tauri-apps/api` v2, `@tauri-apps/cli` v2, new plugin packages, new scripts
- `src/updater.js` — extended with download/install logic, platform-aware
- `src/App.jsx` — update banner UI component with progress bar (existing app logic unchanged)
- `public/version.json` — extended with per-platform download URLs

**Added:**
- `src-tauri/capabilities/default.json` — Tauri 2.0 permissions (replaces allowlist)
- `src-tauri/gen/android/` — generated Android project (Gradle/Kotlin, not hand-written)

**Unchanged:**
- All React app logic (`src/firebase.js`, `src/sync.js`, `src/markdown.js`, `src/crypto.js`)
- `src/styles.css`, `public/` assets (except `version.json`)
- `vite.config.js` (PWA plugin stays for web users)
- `firestore.rules`

## Tauri 1.x to 2.x Migration

### Config Migration (`tauri.conf.json`)

Tauri 2.0 has a new config schema. Key renames and restructuring:

```jsonc
// BEFORE (Tauri 1.x)
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "package": {
    "productName": "TaskPad",
    "version": "1.11.3"
  },
  "tauri": {
    "allowlist": { ... },
    "bundle": { ... },
    "security": { "csp": "..." },
    "windows": [{ "url": "https://taskpad-phi.vercel.app", ... }]
  }
}

// AFTER (Tauri 2.0)
{
  "productName": "TaskPad",
  "version": "1.11.3",
  "identifier": "com.taskpad.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "security": {
      "csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https: http:; connect-src 'self' https: wss:"
    },
    "windows": [{
      "url": "index.html",
      "fullscreen": false,
      "resizable": true,
      "title": "TaskPad",
      "width": 780,
      "height": 780,
      "minWidth": 480,
      "minHeight": 500,
      "center": true
    }]
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "updater": {
      "endpoints": ["https://taskpad-phi.vercel.app/update/{{target}}/{{current_version}}"],
      "pubkey": "<UPDATER_PUBKEY>"
    }
  }
}
```

Key changes:
- `"package"` keys (`productName`, `version`) move to root level
- `"identifier"` moves to root level
- `"devPath"` → `"devUrl"`, `"distDir"` → `"frontendDist"`
- `"tauri"` section becomes `"app"` (windows, security) + `"bundle"` (moved up) + `"plugins"` (new)
- `"allowlist"` removed entirely — replaced by `capabilities/default.json`
- Window `"url"` changes from remote Vercel URL to local `"index.html"`
- CSP simplified: removed `https://taskpad-phi.vercel.app` references (no longer loading remote content)
- `"decorations"` and `"transparent"` removed (defaults are fine)

### Cargo Migration (`Cargo.toml`)

```toml
# BEFORE (Tauri 1.x)
[build-dependencies]
tauri-build = { version = "1", features = [] }

[dependencies]
tauri = { version = "1", features = ["shell-open"] }

# AFTER (Tauri 2.0)
[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-os = "2"
tauri-plugin-process = "2"

[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-updater = "2"
```

The `"shell-open"` feature flag no longer exists in Tauri 2.0 — it's handled by `tauri-plugin-shell`. The updater plugin is desktop-only (gated by target cfg) since Android uses a custom update flow. `tauri-plugin-os` provides platform detection. `tauri-plugin-process` provides `relaunch()` for post-update restart.

### main.rs Migration

```rust
// BEFORE (Tauri 1.x)
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running TaskPad");
}

// AFTER (Tauri 2.0)
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running TaskPad");
}
```

The updater plugin is registered inside `.setup()` with `#[cfg(desktop)]` so it only loads on desktop targets (not Android). The shell, os, and process plugins are cross-platform and registered directly on the builder.

### Capabilities (`src-tauri/capabilities/default.json`)

Replaces the old `allowlist`:

```json
{
  "identifier": "default",
  "description": "Default capabilities for TaskPad",
  "windows": ["main"],
  "permissions": [
    "shell:allow-open",
    "updater:default",
    "os:default",
    "process:allow-restart",
    "process:allow-exit"
  ]
}
```

### npm Dependencies

```
# Updated
@tauri-apps/api          ^1.5.0  →  ^2.0.0
@tauri-apps/cli          ^1.5.0  →  ^2.0.0

# Added
@tauri-apps/plugin-updater   ^2.0.0   (JS API for Tauri updater — desktop only)
@tauri-apps/plugin-shell     ^2.0.0   (JS API for shell:open)
@tauri-apps/plugin-os        ^2.0.0   (JS API for platform detection)
@tauri-apps/plugin-process   ^2.0.0   (JS API for relaunch() after update)
```

Note: In Tauri 2.0, `@tauri-apps/api` was restructured. The `getVersion()` function moves from `@tauri-apps/api/app` to `@tauri-apps/api/app` (path is preserved but the import internals changed). Verify exact import paths during implementation against the v2 API docs.

## Auto-Update System

### Desktop Update Flow

Uses Tauri 2.0's updater plugin (`tauri-plugin-updater`). This plugin has its own endpoint format and requires signed artifacts.

**Tauri updater endpoint:** The plugin calls a configurable endpoint URL. The endpoint must return JSON:

```json
{
  "version": "1.12.0",
  "notes": "Release notes",
  "pub_date": "2026-03-16T00:00:00Z",
  "url": "https://your-server/TaskPad_1.12.0_x64-setup.nsis.zip",
  "signature": "<base64-encoded-signature>"
}
```

- **Windows**: URL points to `.nsis.zip` (NSIS installer archive, auto-generated by `tauri build`)
- **macOS**: URL points to `.tar.gz` (app bundle archive)
- **Linux**: URL points to `.AppImage.tar.gz`
- **Signature**: Each artifact is signed with a private key at build time. The public key is embedded in `tauri.conf.json` under `plugins.updater.pubkey`.

The endpoint URL in config uses `{{target}}` and `{{current_version}}` placeholders:
```
https://taskpad-phi.vercel.app/update/{{target}}/{{current_version}}
```

This can be a static JSON file per target (e.g., `/update/windows-x86_64/latest.json`) or a dynamic API.

**Update flow:**
1. On app launch → Tauri updater plugin checks the endpoint
2. If newer version → JS receives update event via `@tauri-apps/plugin-updater`
3. Show banner: "New version X.Y.Z available — [Update]"
4. User clicks "Update" → plugin downloads the signed artifact, verifies signature
5. Download progress exposed to JS for progress bar UI
6. Download complete → plugin installs the update. On **macOS/Linux**, call `relaunch()` from `@tauri-apps/plugin-process` to restart. On **Windows**, the NSIS installer auto-exits the app during install and can relaunch it — the app exits as part of the Windows installer flow (this is a platform limitation).

**Code signing is required** for the Tauri updater plugin to function. At build time:
- Generate a keypair: `tauri signer generate -w ~/.tauri/taskpad.key`
- Set env vars `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` during `tauri build`
- The public key goes in `tauri.conf.json` → `plugins.updater.pubkey`
- Each build auto-generates `.sig` files alongside the artifacts

### version.json (For Android + PWA)

The existing `version.json` is extended for Android (not used by the desktop Tauri updater, which has its own endpoint):

```json
{
  "version": "1.12.0",
  "notes": "Release notes here",
  "android": {
    "url": "https://your-server/TaskPad_1.12.0.apk"
  }
}
```

The PWA does not use `version.json` for updates — it uses the service worker registration (`registerType: 'prompt'` in Vite PWA config). The `version` field in `version.json` is only used by the Android in-app updater.

### Android Update Flow (Custom)

Tauri's updater plugin does not support Android. The Android update flow is a custom implementation:

1. On app launch → fetch `version.json` from server
2. Compare semver against app version (via `@tauri-apps/api` → `getVersion()`)
3. If newer → show banner: "New version X.Y.Z available — [Update]"
4. User clicks "Update" → download APK using a custom Tauri Rust command (not webview `fetch`)
5. Show download progress bar
6. Download complete → invoke Android's `ACTION_VIEW` intent with the APK file URI via a Tauri Rust command
7. User taps "Install" in Android's system dialog (OS requirement)

**Android-specific Rust commands needed:**
- `download_apk(url: String) -> Result<String, String>` — downloads the APK to the app's cache directory using Rust HTTP client, emits progress events to the JS frontend. Returns the file path.
- `install_apk(path: String) -> Result<(), String>` — opens the downloaded APK with Android's package installer using `ACTION_VIEW` intent via JNI/Android APIs. Requires the app to request `REQUEST_INSTALL_PACKAGES` permission in `AndroidManifest.xml`.

These commands are added to `main.rs` behind `#[cfg(target_os = "android")]` compilation flags so they don't affect the desktop build.

**Platform detection in JS:**
```js
import { platform } from '@tauri-apps/plugin-os';

export const isTauri = () => !!(window && window.__TAURI__);
export const isAndroid = async () => isTauri() && (await platform()) === 'android';
export const isDesktop = async () => isTauri() && !await isAndroid();
export const isPWA = () => !isTauri();
```

Uses `@tauri-apps/plugin-os` (added as dependency) for reliable platform detection.

### PWA Update Flow (Unchanged)

The existing service worker `prompt` registration continues to work. When Vite deploys a new version to Vercel, the service worker detects the change and the app shows the existing update prompt. No changes needed.

### updater.js API

```js
// Platform detection
isTauri()              // true on desktop + Android Tauri builds
isAndroid()            // true on Android Tauri build (async)
isDesktop()            // true on desktop Tauri build (async)
isPWA()                // true on web/PWA

// Update lifecycle
checkForUpdates()      // desktop: Tauri updater plugin / Android: fetch version.json
downloadUpdate()       // desktop: Tauri plugin / Android: invoke download_apk command
installUpdate()        // desktop: Tauri plugin install + relaunch() / Android: invoke install_apk command
onDownloadProgress(cb) // progress callback for both platforms
```

### Update Banner UI

Single `UpdateBanner` section in `App.jsx`:
- States: hidden → "Update available" → downloading (progress %) → "Restart to apply" (desktop) / "Install" (Android)
- Rendered at top of app, same styling across platforms
- Dismissible (user can skip the update)

### Error Recovery

- **Corrupted download (desktop):** Tauri updater plugin verifies the signature before installing. If verification fails, the update is rejected and the banner shows "Update failed — try again". The app continues running the current version.
- **Corrupted download (Android):** Android's package installer validates the APK. If it's corrupt, the install dialog shows an error. The app continues running the current version.
- **Failed restart (desktop):** Tauri's updater writes the new files before restart. If the new version crashes on launch, the user can re-download the previous version from the server (no automatic rollback — same as current behavior).

## Build Commands

```bash
npm run dev              # Vite dev server
npm run build            # Production build → dist/
npm run tauri:dev        # Desktop dev mode
npm run tauri:build      # Desktop installer (.exe/.dmg/.deb) + .sig files
npm run android:dev      # Android dev (emulator/device)
npm run android:build    # Android APK
npx vercel --prod        # PWA deploy to Vercel
```

Desktop builds require `TAURI_SIGNING_PRIVATE_KEY` env var to be set for artifact signing.

## Distribution

**Desktop:** Release artifacts (signed installers + `.sig` files) and per-target update JSON files are hosted on the server. The Tauri updater plugin fetches the target-specific JSON to check for updates.

**Android:** APK hosted alongside `version.json` on the server. The in-app updater fetches `version.json` to check for updates.

**PWA:** Deployed to Vercel. Service worker handles updates automatically.

**`bump-version.sh` changes:** The script is extended to also update the Tauri updater endpoint JSON files and `version.json` android URL.

**Updater endpoint files:** Static JSON files served from the hosting server, one per target:
- `update/windows-x86_64/latest.json`
- `update/darwin-aarch64/latest.json`
- `update/darwin-x86_64/latest.json`
- `update/linux-x86_64/latest.json`

Each contains the Tauri updater response format (`version`, `notes`, `pub_date`, `url`, `signature`).

Since signatures are only available after `tauri build`, the release process has two phases:
1. `bump-version.sh X.Y.Z` — updates version in `package.json`, `version.json`, `tauri.conf.json`, `src/App.jsx`, and sets the version + download URLs in the endpoint JSON files (signature field left as placeholder)
2. `bump-version.sh --post-build X.Y.Z` — reads `.sig` files from `src-tauri/target/release/bundle/` and injects their contents into the corresponding endpoint JSON files' `signature` fields

**Release process:**
1. Run `bump-version.sh X.Y.Z` (updates version in all files)
2. `npm run tauri:build` (with `TAURI_SIGNING_PRIVATE_KEY` set) for desktop installers
3. `npm run android:build` for APK
4. Run `bump-version.sh --post-build X.Y.Z` (updates endpoint JSONs with signatures)
5. Upload all artifacts + endpoint JSONs to server
6. `npx vercel --prod` for PWA
7. All clients detect the new version on next launch

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Tauri 2.0 breaking changes during migration | Follow official migration guide, test each platform incrementally |
| Android APK sideloading UX | Clear instructions in-app for enabling "Install from unknown sources" |
| Tauri updater signature verification fails | Fall back to manual download link |
| Android JNI/intent code complexity | Isolate in a small Rust module behind `#[cfg(target_os = "android")]` |
| Key management for signing | Document key generation, store private key securely outside repo |

## Out of Scope

- iOS support (can be added later with same Tauri 2.0 setup)
- Google Play Store publishing
- Delta/incremental updates
- Automatic rollback on crash
