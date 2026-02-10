// ============================================================
// FIREBASE SETUP — Follow the README to get these values
// ============================================================
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use an existing one)
// 3. Go to Project Settings → General → Your apps → Add web app
// 4. Copy the config values below
// 5. Enable Firestore in Build → Firestore Database → Create database
// 6. Enable Email/Password Auth in Build → Authentication → Sign-in method
// ============================================================

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD6g1Laotwvv01dDcLb4iNZE-ySq6BCVPo",
  authDomain: "taskpad-76210.firebaseapp.com",
  projectId: "taskpad-76210",
  storageBucket: "taskpad-76210.firebasestorage.app",
  messagingSenderId: "165523587560",
  appId: "1:165523587560:web:04cae1d27380f97792645d"
};

// Check if Firebase is configured
export const isFirebaseConfigured = () => {
  return firebaseConfig.apiKey !== "YOUR_API_KEY";
};

let app, db, auth;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

export { db, auth };

// Auth helpers
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
