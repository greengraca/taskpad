import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

// Vite envs (work on Vercel + local builds)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = () => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
};

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  // Enable offline persistence for PWA reliability
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence unavailable: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not supported by this browser');
    }
  });
}

export { db };

export const subscribeAuth = (cb) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
};

export const signUpEmail = async (email, password) => {
  if (!auth) throw new Error('Firebase not configured');
  await createUserWithEmailAndPassword(auth, email, password);
};

export const signInEmail = async (email, password) => {
  if (!auth) throw new Error('Firebase not configured');
  await signInWithEmailAndPassword(auth, email, password);
};

export const signOutUser = async () => {
  if (!auth) throw new Error('Firebase not configured');
  await signOut(auth);
};
