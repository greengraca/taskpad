// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

// Read config from Vite env vars (works for Vercel + local builds)
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = () => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
};

let app, db, auth;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export { db, auth };

export const subscribeAuth = (cb) => {
  if (!isFirebaseConfigured()) return () => {};
  return onAuthStateChanged(auth, cb);
};

export const signUpEmail = (email, password) => {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signInEmail = (email, password) => {
  if (!isFirebaseConfigured()) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

export const signOutUser = () => {
  if (!isFirebaseConfigured()) return Promise.resolve();
  return signOut(auth);
};
