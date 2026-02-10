import { db, subscribeAuth, isFirebaseConfigured } from './firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

const LOCAL_KEY = 'taskpad-data';

const DEFAULT_DATA = {
  projects: [{ id: 'p1', name: 'Sample', color: '#4ecdc4', keywords: ['sample'] }],
  tasks: [
    { id: 'w1', text: 'Drag me by the grip on the left', done: false, projectId: '__inbox__', ts: Date.now() },
    { id: 'w2', text: 'Click between tasks to insert new ones', done: false, projectId: '__inbox__', ts: Date.now() },
  ],
  activeTab: '__inbox__',
  scOrder: null,
  showSc: true,
};

// --- Local Storage ---
export const loadLocal = () => {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_DATA;
  } catch {
    return DEFAULT_DATA;
  }
};

export const saveLocal = (data) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Local save failed:', e);
  }
};

// --- Firebase Sync ---
let unsubscribe = null;
let unsubscribeAuth = null;
let userId = null;

export const initSync = (onDataUpdate, onSyncStatus) => {
  // Always render something immediately.
  onDataUpdate(loadLocal());

  if (!isFirebaseConfigured()) {
    onSyncStatus?.(false);
    return;
  }

  // React to sign-in/out without needing a reload.
  unsubscribeAuth = subscribeAuth((user) => {
    userId = user?.uid || null;
    onSyncStatus?.(!!userId);

    // Switch listeners if the user changes.
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (!userId) return;

    const docRef = doc(db, 'users', userId);
    unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data().taskpad;
          if (data) {
            saveLocal(data); // Keep local in sync
            onDataUpdate(data);
          }
        } else {
          // First time for this account — push local data to cloud
          const local = loadLocal();
          setDoc(docRef, { taskpad: local }, { merge: true });
          onDataUpdate(local);
        }
      },
      (error) => {
        console.warn('Firestore listener error:', error);
        onDataUpdate(loadLocal());
      }
    );
  });
};

export const saveToCloud = async (data) => {
  saveLocal(data); // Always save locally first

  if (!isFirebaseConfigured() || !userId) return;

  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, { taskpad: data }, { merge: true });
  } catch (e) {
    console.warn('Cloud save failed (will retry on next change):', e);
  }
};

export const cleanup = () => {
  if (unsubscribe) unsubscribe();
  if (unsubscribeAuth) unsubscribeAuth();
};
