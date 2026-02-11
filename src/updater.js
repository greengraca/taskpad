export const isTauri = () => !!(window && window.__TAURI__);

const semverCmp = (a, b) => {
  const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
};

export async function checkForUpdates() {
  if (!isTauri()) return null;

  const { getVersion } = await import('@tauri-apps/api/app');

  const currentVersion = await getVersion();
  const url = import.meta.env.VITE_UPDATE_URL || `${window.location.origin}/version.json`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const latest = await res.json();

  const latestVersion = latest.version;
  const isUpdateAvailable = semverCmp(latestVersion, currentVersion) > 0;

  // Derive download URL: use explicit url from version.json, or strip /version.json from update URL
  const downloadUrl = latest.url || url.replace(/\/version\.json$/, '') || '';

  return {
    isUpdateAvailable,
    currentVersion,
    latestVersion,
    notes: latest.notes || '',
    downloadUrl,
  };
}
