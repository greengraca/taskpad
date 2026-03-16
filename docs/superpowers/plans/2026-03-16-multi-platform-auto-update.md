# Multi-Platform + Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate TaskPad from Tauri 1.x (remote webview) to Tauri 2.0 (local bundle) with Android support and auto-update system.

**Architecture:** One React codebase builds to three targets: desktop (Tauri 2.0), Android (Tauri 2.0 mobile), and web (PWA on Vercel). Desktop uses Tauri's updater plugin with signed artifacts. Android uses a custom Rust command to download APKs and trigger install intents. PWA update flow is unchanged.

**Tech Stack:** React 18, Vite 5, Tauri 2.0, tauri-plugin-updater, tauri-plugin-shell, tauri-plugin-os, tauri-plugin-process, Firebase Firestore

**Spec:** `docs/superpowers/specs/2026-03-16-multi-platform-auto-update-design.md`

---

## Chunk 1: Tauri 1.x → 2.x Migration (Desktop)

### Task 1: Update npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall Tauri 1.x npm packages**

```bash
npm uninstall @tauri-apps/api @tauri-apps/cli
```

- [ ] **Step 2: Install Tauri 2.0 npm packages**

```bash
npm install @tauri-apps/api@^2.0.0
npm install -D @tauri-apps/cli@^2.0.0
npm install @tauri-apps/plugin-updater@^2.0.0 @tauri-apps/plugin-shell@^2.0.0 @tauri-apps/plugin-os@^2.0.0 @tauri-apps/plugin-process@^2.0.0
```

- [ ] **Step 3: Add android scripts to package.json**

Add these scripts to `package.json`:
```json
"android:dev": "tauri android dev",
"android:build": "tauri android build"
```

- [ ] **Step 4: Verify package.json looks correct**

Run: `cat package.json`
Expected: `@tauri-apps/api` at `^2.0.0`, `@tauri-apps/cli` at `^2.0.0`, four plugin packages in dependencies, android scripts present.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade Tauri npm deps from 1.x to 2.0"
```

---

### Task 2: Migrate Tauri Rust dependencies (`Cargo.toml`)

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Update Cargo.toml**

Replace the full contents of `src-tauri/Cargo.toml` with:

```toml
[package]
name = "taskpad"
version = "1.0.0"
description = "A lightweight minimalist task manager"
authors = ["you"]
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-os = "2"
tauri-plugin-process = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]
tauri-plugin-updater = "2"

[features]
custom-protocol = ["tauri/custom-protocol"]
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore: upgrade Cargo deps to Tauri 2.0 with plugins"
```

---

### Task 3: Migrate `main.rs` to Tauri 2.0 builder API

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Update main.rs**

Replace the full contents of `src-tauri/src/main.rs` with:

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

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

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "chore: migrate main.rs to Tauri 2.0 builder with plugins"
```

---

### Task 4: Migrate `tauri.conf.json` to Tauri 2.0 schema

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Replace tauri.conf.json**

Replace the full contents of `src-tauri/tauri.conf.json` with:

```json
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
    "windows": [
      {
        "url": "index.html",
        "fullscreen": false,
        "resizable": true,
        "title": "TaskPad",
        "width": 780,
        "height": 780,
        "minWidth": 480,
        "minHeight": 500,
        "center": true
      }
    ]
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
      "endpoints": [
        "https://taskpad-phi.vercel.app/update/{{target}}/{{current_version}}"
      ],
      "pubkey": ""
    }
  }
}
```

Key changes from Tauri 1.x:
- `package.productName` / `package.version` → root-level `productName` / `version`
- `tauri.bundle.identifier` → root-level `identifier`
- `build.devPath` → `build.devUrl`
- `build.distDir` → `build.frontendDist`
- `tauri.allowlist` → removed (replaced by capabilities)
- `tauri.windows` → `app.windows`
- `tauri.security` → `app.security`
- `tauri.bundle` → root-level `bundle`
- Window `url` → `"index.html"` (local bundle instead of remote Vercel URL)
- CSP simplified (removed `https://taskpad-phi.vercel.app` references)
- `plugins.updater` added with endpoint and pubkey (pubkey filled in after key generation)

- [ ] **Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: migrate tauri.conf.json to Tauri 2.0 schema"
```

---

### Task 5: Add Tauri 2.0 capabilities

**Files:**
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Create capabilities directory and file**

Create `src-tauri/capabilities/default.json`:

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

- [ ] **Step 2: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat: add Tauri 2.0 capabilities (replaces allowlist)"
```

---

### Task 6: Verify build.rs and desktop compilation

- [ ] **Step 1: Verify build.rs exists and is correct**

Check `src-tauri/build.rs` exists and contains:
```rust
fn main() {
    tauri_build::build()
}
```

This should already exist from Tauri 1.x. If not, create it. The Tauri 2.0 `tauri_build::build()` API is the same.

- [ ] **Step 2: Run Cargo check**

```bash
cd src-tauri && cargo check
```

Expected: compilation succeeds with no errors (warnings are OK).

If there are compilation errors, fix them before proceeding. Common issues:
- Missing `use` statements in Rust
- Plugin API changes between Tauri 2.0 minor versions (check Tauri docs)

- [ ] **Step 2: Test dev mode**

```bash
npm run tauri:dev
```

Expected: App opens in a desktop window, loads the local React app (not the Vercel URL). Test that basic functionality works (create a task, switch tabs).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve Tauri 2.0 migration compilation issues"
```

Only commit this if step 1 or 2 required fixes.

---

## Chunk 2: Auto-Update System (Desktop)

### Task 7: Generate signing keys

- [ ] **Step 1: Generate Tauri updater keypair**

```bash
npx tauri signer generate -w ~/.tauri/taskpad.key
```

This generates:
- `~/.tauri/taskpad.key` — private key (NEVER commit this)
- Prints the public key to stdout

- [ ] **Step 2: Copy the public key into tauri.conf.json**

Edit `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` → paste the public key string.

- [ ] **Step 3: Commit the config change**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: add updater public key to config"
```

---

### Task 8: Create updater endpoint static files and Vercel rewrite

**Files:**
- Create: `public/update/windows-x86_64/latest.json`
- Create: `public/update/darwin-aarch64/latest.json`
- Create: `public/update/darwin-x86_64/latest.json`
- Create: `public/update/linux-x86_64/latest.json`
- Create: `vercel.json`

- [ ] **Step 1: Create endpoint directories and placeholder files**

Each file follows the Tauri updater response format. Create them with placeholder content:

`public/update/windows-x86_64/latest.json`:
```json
{
  "version": "1.11.3",
  "notes": "",
  "pub_date": "2026-03-16T00:00:00Z",
  "url": "https://taskpad-phi.vercel.app/releases/TaskPad_1.11.3_x64-setup.nsis.zip",
  "signature": ""
}
```

Create the same structure at each of the four paths. Adjust the `url` field per target:
- `windows-x86_64`: `...TaskPad_VERSION_x64-setup.nsis.zip`
- `darwin-aarch64`: `...TaskPad_VERSION_aarch64.app.tar.gz`
- `darwin-x86_64`: `...TaskPad_VERSION_x64.app.tar.gz`
- `linux-x86_64`: `...TaskPad_VERSION_amd64.AppImage.tar.gz`

(The exact filenames will match what `tauri build` produces. Adjust after first build.)

- [ ] **Step 2: Create vercel.json with rewrite rule**

The Tauri updater plugin requests `/update/windows-x86_64/1.11.3` (with the version in the path). Vercel needs to rewrite this to the static `latest.json` file.

Create `vercel.json` at project root:

```json
{
  "rewrites": [
    {
      "source": "/update/:target/:version",
      "destination": "/update/:target/latest.json"
    }
  ]
}
```

This makes any request to `/update/<target>/<any-version>` serve the `latest.json` file for that target.

- [ ] **Step 3: Commit**

```bash
git add public/update/ vercel.json
git commit -m "feat: add Tauri updater endpoint files and Vercel rewrite"
```

---

### Task 9: Rewrite `updater.js` with platform-aware update logic

**Files:**
- Modify: `src/updater.js`

- [ ] **Step 1: Replace updater.js**

Replace the full contents of `src/updater.js` with:

```js
// Platform detection
export const isTauri = () => !!(window && window.__TAURI__);
export const isPWA = () => !isTauri();

let _platform = null;
async function getPlatform() {
  if (_platform) return _platform;
  if (!isTauri()) return (_platform = 'web');
  try {
    const { platform } = await import('@tauri-apps/plugin-os');
    _platform = await platform();
  } catch {
    _platform = 'unknown';
  }
  return _platform;
}

export const isAndroid = async () => (await getPlatform()) === 'android';
export const isDesktop = async () => {
  const p = await getPlatform();
  return isTauri() && p !== 'android';
};

const semverCmp = (a, b) => {
  const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
};

// ─── Desktop update (Tauri updater plugin) ───

let _desktopUpdate = null; // cached Update object

async function checkDesktopUpdate() {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update?.available) {
      _desktopUpdate = update;
      return {
        isUpdateAvailable: true,
        currentVersion: update.currentVersion,
        latestVersion: update.version,
        notes: update.body || '',
        platform: 'desktop',
      };
    }
  } catch (e) {
    console.warn('Desktop update check failed:', e);
  }
  return null;
}

export async function downloadDesktopUpdate(onProgress) {
  if (!_desktopUpdate) return false;
  try {
    let downloaded = 0;
    let total = 0;
    await _desktopUpdate.downloadAndInstall((event) => {
      if (event.event === 'Started' && event.data?.contentLength) {
        total = event.data.contentLength;
      } else if (event.event === 'Progress' && event.data?.chunkLength) {
        downloaded += event.data.chunkLength;
        if (onProgress && total > 0) {
          onProgress(Math.round((downloaded / total) * 100));
        }
      } else if (event.event === 'Finished') {
        if (onProgress) onProgress(100);
      }
    });
    return true;
  } catch (e) {
    console.warn('Desktop update download failed:', e);
    return false;
  }
}

export async function relaunchDesktop() {
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.warn('Relaunch failed:', e);
  }
}

// ─── Android update (custom via version.json) ───

async function checkAndroidUpdate() {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    const currentVersion = await getVersion();
    const url = import.meta.env.VITE_UPDATE_URL || `${window.location.origin}/version.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const latest = await res.json();

    if (semverCmp(latest.version, currentVersion) > 0) {
      return {
        isUpdateAvailable: true,
        currentVersion,
        latestVersion: latest.version,
        notes: latest.notes || '',
        downloadUrl: latest.android?.url || '',
        platform: 'android',
      };
    }
  } catch (e) {
    console.warn('Android update check failed:', e);
  }
  return null;
}

export async function downloadAndroidUpdate(apkUrl, onProgress) {
  if (!apkUrl) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');

    // Listen for progress events from the Rust download command
    const unlisten = await listen('apk-download-progress', (event) => {
      if (onProgress) onProgress(event.payload);
    });

    // Rust command handles download, emits apk-download-progress events
    const path = await invoke('download_apk', { url: apkUrl });
    unlisten();
    if (onProgress) onProgress(100);
    return path;
  } catch (e) {
    console.warn('Android APK download failed:', e);
    return null;
  }
}

export async function installAndroidApk(path) {
  if (!path) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('install_apk', { path });
    return true;
  } catch (e) {
    console.warn('Android APK install failed:', e);
    return false;
  }
}

// ─── Unified check ───

export async function checkForUpdates() {
  if (!isTauri()) return null;
  if (await isAndroid()) return checkAndroidUpdate();
  return checkDesktopUpdate();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/updater.js
git commit -m "feat: rewrite updater.js with platform-aware desktop/android/PWA logic"
```

---

### Task 10: Update the update banner UI in App.jsx

**Files:**
- Modify: `src/App.jsx` (lines ~491, ~1791-1795, ~2442-2459)

- [ ] **Step 1: Update imports at top of file**

In `src/App.jsx`, change line 16 from:
```js
import { checkForUpdates } from './updater';
```
to:
```js
import { checkForUpdates, downloadDesktopUpdate, relaunchDesktop, downloadAndroidUpdate, installAndroidApk, isPWA } from './updater';
```

- [ ] **Step 2: Add update state variables**

Near line 491, after:
```js
const [updateInfo, setUpdateInfo] = useState(null);
```

Add:
```js
const [updateProgress, setUpdateProgress] = useState(null); // null = not downloading, 0-100 = progress
const [updateError, setUpdateError] = useState(null);
const [apkPath, setApkPath] = useState(null);
```

- [ ] **Step 3: Replace the checkForUpdates effect**

Replace lines ~1791-1795 (the `checkForUpdates` useEffect) with:

```js
useEffect(() => {
  checkForUpdates().then(info => {
    if (info?.isUpdateAvailable) setUpdateInfo(info);
  }).catch(() => {});
}, []);

const handleUpdate = useCallback(async () => {
  if (!updateInfo) return;
  setUpdateError(null);
  setUpdateProgress(0);

  if (updateInfo.platform === 'desktop') {
    const ok = await downloadDesktopUpdate((p) => setUpdateProgress(p));
    if (ok) {
      // On Windows, downloadAndInstall already exits the app.
      // On macOS/Linux, we need to relaunch.
      await relaunchDesktop();
    } else {
      setUpdateError('Download failed. Try again.');
      setUpdateProgress(null);
    }
  } else if (updateInfo.platform === 'android') {
    const path = await downloadAndroidUpdate(updateInfo.downloadUrl, (p) => setUpdateProgress(p));
    if (path) {
      setApkPath(path);
      setUpdateProgress(100);
    } else {
      setUpdateError('Download failed. Try again.');
      setUpdateProgress(null);
    }
  }
}, [updateInfo]);

const handleInstallApk = useCallback(async () => {
  if (apkPath) await installAndroidApk(apkPath);
}, [apkPath]);
```

- [ ] **Step 4: Replace the Tauri update banner JSX**

Replace the existing Tauri update banner (lines ~2442-2449) with:

```jsx
{updateInfo && (
  <div className="update-banner">
    <span>
      {updateProgress === null && `Update v${updateInfo.latestVersion} available${updateInfo.notes ? ` — ${updateInfo.notes}` : ''}`}
      {updateProgress !== null && updateProgress < 100 && `Downloading update... ${updateProgress}%`}
      {updateProgress === 100 && updateInfo.platform === 'android' && 'Download complete — tap Install'}
      {updateProgress === 100 && updateInfo.platform === 'desktop' && 'Installing update...'}
      {updateError && updateError}
    </span>
    <div className="update-actions">
      {updateProgress === null && !updateError && (
        <button className="update-dl" onClick={handleUpdate}>Update</button>
      )}
      {updateProgress === 100 && updateInfo.platform === 'android' && (
        <button className="update-dl" onClick={handleInstallApk}>Install</button>
      )}
      {updateError && (
        <button className="update-dl" onClick={handleUpdate}>Retry</button>
      )}
      <button className="update-x" onClick={() => { setUpdateInfo(null); setUpdateProgress(null); setUpdateError(null); }}>×</button>
    </div>
  </div>
)}
```

The existing `swUpdate` banner (lines ~2451-2458) stays unchanged — it handles PWA updates.

- [ ] **Step 5: No extra CSS needed**

The progress is displayed as text in the banner (`Downloading update... 42%`). The existing `.update-banner` styles are sufficient.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: update banner with download progress for desktop/android"
```

---

### Task 11: Test desktop update flow end-to-end

- [ ] **Step 1: Build the desktop app**

```bash
npm run tauri:build
```

Expected: Build succeeds. Produces installer in `src-tauri/target/release/bundle/`. Also produces `.sig` files if `TAURI_SIGNING_PRIVATE_KEY` env var is set.

- [ ] **Step 2: Verify the app launches and loads locally**

Run the built app. It should:
- Show the React UI (not a blank page or Vercel URL)
- Show "TaskPad v1.11.3" in the header
- Basic functionality works (create task, switch tabs)

- [ ] **Step 3: Test update check (no update available)**

The updater endpoint files have the same version as the app, so no update banner should appear.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve desktop build issues"
```

Only commit if fixes were needed.

---

## Chunk 3: Android Support

### Task 12: Initialize Tauri Android target

- [ ] **Step 1: Prerequisites check**

Ensure Android SDK, NDK, and Java are installed. The `ANDROID_HOME` and `JAVA_HOME` env vars must be set.

```bash
echo $ANDROID_HOME
echo $JAVA_HOME
```

If not set, install Android Studio and configure the environment before continuing.

- [ ] **Step 2: Initialize Android project**

```bash
npx tauri android init
```

Expected: Creates `src-tauri/gen/android/` directory with a Gradle project.

- [ ] **Step 3: Commit generated files**

```bash
git add src-tauri/gen/android/
git commit -m "feat: initialize Tauri Android project"
```

---

### Task 13: Add Android-specific Rust commands for APK update

**Files:**
- Create: `src-tauri/src/android_update.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add reqwest dependency for HTTP downloads**

In `src-tauri/Cargo.toml`, add under `[dependencies]`:

```toml
[target.'cfg(target_os = "android")'.dependencies]
reqwest = { version = "0.12", features = ["stream"] }
futures-util = "0.3"
```

- [ ] **Step 2: Create android_update.rs**

Create `src-tauri/src/android_update.rs`:

```rust
#[cfg(target_os = "android")]
pub mod commands {
    use tauri::{AppHandle, command, Emitter};
    use std::io::Write;

    #[command]
    pub async fn download_apk(app: AppHandle, url: String) -> Result<String, String> {
        use futures_util::StreamExt;

        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("Download request failed: {e}"))?;

        let total = response.content_length().unwrap_or(0);
        let cache_dir = app.path().app_cache_dir()
            .map_err(|e| format!("No cache dir: {e}"))?;
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Cannot create cache dir: {e}"))?;

        let file_path = cache_dir.join("update.apk");
        let mut file = std::fs::File::create(&file_path)
            .map_err(|e| format!("Cannot create file: {e}"))?;

        let mut downloaded: u64 = 0;
        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download stream error: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("File write error: {e}"))?;
            downloaded += chunk.len() as u64;
            if total > 0 {
                let progress = (downloaded as f64 / total as f64 * 100.0) as u32;
                let _ = app.emit("apk-download-progress", progress);
            }
        }

        Ok(file_path.to_string_lossy().to_string())
    }

}
```

Note: `install_apk` is NOT in Rust — it's handled by a Kotlin plugin (see Task 13b). Only the download command is in Rust.

- [ ] **Step 3: Register Android commands in main.rs**

In `src-tauri/src/main.rs`, add at the top:

```rust
#[cfg(target_os = "android")]
mod android_update;
```

Then update `main.rs` to register the Android commands. The full updated `main.rs` becomes:

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[cfg(target_os = "android")]
mod android_update;

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(target_os = "android")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            android_update::commands::download_apk
        ]);
    }

    builder
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running TaskPad");
}
```

The `#[cfg(target_os = "android")]` ensures the commands only compile for Android. On desktop, no custom invoke handler is registered.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/android_update.rs src-tauri/src/main.rs src-tauri/Cargo.toml
git commit -m "feat: add Android APK download and install Rust commands"
```

---

### Task 13b: Create Kotlin helper for APK installation

**Files:**
- Create: `src-tauri/gen/android/app/src/main/java/com/taskpad/app/ApkInstallerPlugin.kt`
- Create: `src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
- Modify: `src-tauri/src/main.rs` (register the plugin on Android)

On Android 7+ (API 24+), `file://` URIs are blocked for cross-app sharing. Installing an APK requires:
1. A `FileProvider` to convert the file path to a `content://` URI
2. An `ACTION_VIEW` intent with the content URI and APK MIME type

This is best done in Kotlin since it's native Android API.

- [ ] **Step 1: Create file_paths.xml**

Create `src-tauri/gen/android/app/src/main/res/xml/file_paths.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="apk_cache" path="." />
</paths>
```

This tells FileProvider to share files from the app's cache directory.

- [ ] **Step 2: Add FileProvider to AndroidManifest.xml**

In `AndroidManifest.xml`, inside the `<application>` tag, add:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

- [ ] **Step 3: Create ApkInstallerPlugin.kt**

Create `src-tauri/gen/android/app/src/main/java/com/taskpad/app/ApkInstallerPlugin.kt`:

```kotlin
package com.taskpad.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import java.io.File

@TauriPlugin
class ApkInstallerPlugin(private val activity: android.app.Activity) : Plugin(activity) {

    @Command
    fun installApk(invoke: Invoke) {
        val path = invoke.getString("path") ?: run {
            invoke.reject("No path provided")
            return
        }

        try {
            val file = File(path)
            val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(
                    activity,
                    "${activity.packageName}.fileprovider",
                    file
                )
            } else {
                Uri.fromFile(file)
            }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(intent)
            invoke.resolve()
        } catch (e: Exception) {
            invoke.reject("Failed to install APK: ${e.message}")
        }
    }
}
```

- [ ] **Step 4: Register the Kotlin plugin in main.rs**

In `src-tauri/src/main.rs`, the Android plugin is registered via Tauri's mobile plugin system. Update the `#[cfg(target_os = "android")]` block:

The plugin is automatically discovered by Tauri's Android plugin system when it has the `@TauriPlugin` annotation and is in the app's source directory. However, you may need to register it in the Tauri Android activity. Check the generated `MainActivity.kt` in `src-tauri/gen/android/app/src/main/java/com/taskpad/app/` and add:

```kotlin
import com.taskpad.app.ApkInstallerPlugin

// In onCreate or the plugin registration method:
registerPlugin(ApkInstallerPlugin::class.java)
```

- [ ] **Step 5: Update updater.js install function**

In `src/updater.js`, update `installAndroidApk` to call the Kotlin plugin:

```js
export async function installAndroidApk(path) {
  if (!path) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:apk-installer|installApk', { path });
    return true;
  } catch (e) {
    console.warn('Android APK install failed:', e);
    return false;
  }
}
```

Note: The invoke command format for Tauri plugins is `plugin:<plugin-name>|<command>`.

- [ ] **Step 6: Add androidx.core dependency**

In `src-tauri/gen/android/app/build.gradle.kts`, add to the `dependencies` block:

```kotlin
implementation("androidx.core:core-ktx:1.12.0")
```

- [ ] **Step 7: Commit**

```bash
git add src-tauri/gen/android/ src-tauri/src/main.rs src/updater.js
git commit -m "feat: add Kotlin APK installer plugin with FileProvider for Android 7+"
```

---

### Task 14: Add Android permissions

**Files:**
- Modify: `src-tauri/gen/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add required permissions**

In the `AndroidManifest.xml`, add inside the `<manifest>` tag (before `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/gen/android/
git commit -m "feat: add Android permissions for internet and APK install"
```

---

### Task 15: Test Android build

- [ ] **Step 1: Build Android APK**

```bash
npm run android:build
```

Expected: Build succeeds, produces APK in `src-tauri/gen/android/app/build/outputs/apk/`.

- [ ] **Step 2: Test on emulator or device**

Install the APK on an Android emulator or device. Verify:
- App opens and shows the React UI
- Basic functionality works (create task, switch tabs)
- Firebase sync works (if configured)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve Android build issues"
```

Only commit if fixes were needed.

---

## Chunk 4: Update version.json and bump-version.sh

### Task 16: Extend version.json format

**Files:**
- Modify: `public/version.json`

- [ ] **Step 1: Update version.json**

Replace `public/version.json` with:

```json
{
  "version": "1.11.3",
  "notes": "Notes feature - markdown editing with wikilinks and backlinks",
  "android": {
    "url": ""
  }
}
```

The top-level `url` field is removed (was empty, unused). The `android.url` field will be populated during releases with the APK download URL.

- [ ] **Step 2: Commit**

```bash
git add public/version.json
git commit -m "feat: extend version.json with android download URL"
```

---

### Task 17: Update bump-version.sh for new file structure

**Files:**
- Modify: `scripts/bump-version.sh`

- [ ] **Step 1: Replace bump-version.sh**

Replace `scripts/bump-version.sh` with:

```bash
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
BASE_URL="https://taskpad-phi.vercel.app/releases"
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
sed -i "s|\"url\": \"[^\"]*\"|\"url\": \"${BASE_URL}/TaskPad_${V}.apk\"|" public/version.json

echo "Bumped to v$V"
```

- [ ] **Step 2: Commit**

```bash
git add scripts/bump-version.sh
git commit -m "feat: extend bump-version.sh for updater endpoints and post-build signatures"
```

---

## Chunk 5: Version Bump and Final Verification

### Task 18: Bump version to 1.12.0

- [ ] **Step 1: Run bump script**

```bash
bash scripts/bump-version.sh 1.12.0 "Multi-platform support with auto-updates"
```

- [ ] **Step 2: Verify version updated in all files**

Check that `1.12.0` appears in:
- `package.json`
- `public/version.json`
- `src-tauri/tauri.conf.json`
- `src/App.jsx` (version string)
- All `public/update/*/latest.json` files

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: bump version to 1.12.0 — multi-platform with auto-updates"
```

---

### Task 19: Final desktop build and verification

- [ ] **Step 1: Build desktop app**

```bash
TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/taskpad.key) npm run tauri:build
```

Expected: Build produces signed installer + `.sig` files.

- [ ] **Step 2: Run post-build signature update**

```bash
bash scripts/bump-version.sh --post-build 1.12.0
```

Expected: Updater endpoint JSON files are updated with signatures.

- [ ] **Step 3: Verify built app**

Launch the built desktop app and verify:
- App loads locally (not from Vercel URL)
- Shows "TaskPad v1.12.0"
- No update banner (version matches)
- All existing features work

- [ ] **Step 4: Commit endpoint files with signatures**

```bash
git add public/update/
git commit -m "chore: update endpoint files with build signatures"
```

---

### Task 20: Final Android build and verification

- [ ] **Step 1: Build Android APK**

```bash
npm run android:build
```

- [ ] **Step 2: Install and test on device/emulator**

Verify:
- App opens and shows React UI
- Shows "TaskPad v1.12.0"
- Firebase sync works
- No update banner

- [ ] **Step 3: Deploy to Vercel**

```bash
npx vercel --prod
```

This deploys the PWA + the updater endpoint JSON files + version.json.

- [ ] **Step 4: Verify PWA still works**

Open the Vercel URL in a browser. Verify the app loads and functions correctly.
