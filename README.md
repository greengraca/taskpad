# TaskPad

Lightweight minimalist task manager with inbox/project workflow, live drag-and-drop, and website shortcuts.

## Desktop App (Tauri) — Recommended

Builds a native ~5MB `.exe` / `.app` / `.AppImage`.

### Prerequisites
1. [Node.js](https://nodejs.org/) v18+
2. [Rust](https://rustup.rs/) — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. Linux only: `sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

### Build
```bash
npm install
npm run tauri:build
```
Output: `src-tauri/target/release/bundle/`

### Dev
```bash
npm run tauri:dev
```

## Web / PWA (optional)
```bash
npm install
npm run dev          # local dev
npx vercel --prod    # deploy
```

### Cross-device sync (Firebase)
1) Configure Firebase in `src/firebase.js`
2) Enable Firestore + Email/Password auth in Firebase Console
3) Run the app, click **sync**, and sign in (same account on desktop + mobile)

## Shortcuts
- Enter — save task | Escape — cancel edit
- Double-click tab — rename | Right-click tab — options
- Hold shortcut icon 0.6s — unlock drag reorder
