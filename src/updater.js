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
    await invoke('plugin:apk-installer|installApk', { path });
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
