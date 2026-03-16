# TaskPad

Lightweight, real-time task manager with team collaboration. Ships as **PWA** (Vercel), **desktop** (Tauri), and **Android** (Tauri mobile, planned).

## Tech Stack

- **Frontend**: React 18 + Vite 5 (no TypeScript)
- **Styling**: Plain CSS with custom properties for theming (`src/styles.css`)
- **Database**: Firebase Firestore (real-time sync) + Firebase Auth (email/password)
- **Desktop**: Tauri (Rust shell) — migration from 1.x to 2.0 in progress
- **Mobile**: Tauri 2.0 Android (planned, see spec/plan below)
- **PWA**: vite-plugin-pwa with Workbox caching

## Project Structure

```
src/
  main.jsx         - Entry point, renders App into DOM
  App.jsx          - Monolithic React component + helper components (TaskLine, ShortcutIcon, InsertZone)
  firebase.js      - Firebase init, auth helpers
  sync.js          - All Firestore CRUD, real-time listeners, team operations
  markdown.js      - Markdown parsing (marked), wikilink/tag extraction
  crypto.js        - Encryption/decryption utilities for team vaults
  updater.js       - Tauri desktop update checker
  styles.css       - All styles, CSS custom properties for theming
src-tauri/         - Tauri desktop wrapper (Rust)
public/
  avatars/         - Pixel art avatar SVGs
  shortcuts/       - Default shortcut icons
firestore.rules    - Firestore security rules
```

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build -> dist/
npm run preview      # Preview production build
npm run tauri:dev    # Tauri desktop dev mode
npm run tauri:build  # Build native desktop app
npm run android:dev  # Android dev (emulator/device) — after Tauri 2.0 migration
npm run android:build # Android APK — after Tauri 2.0 migration
npx vercel --prod    # Deploy PWA to Vercel
```

## Key Architecture

- **Single-component app**: Nearly all UI in `App()` in `src/App.jsx`. No router, no state library.
- **State pattern**: `up()` wraps `setState` + 400ms debounced cloud save. Local-first, optimistic.
- **Sync layer**: `src/sync.js` for all Firestore CRUD. Team tasks use separate subscriptions.
- See `.claude/docs/architectural_patterns.md` for detailed patterns (drag-and-drop, modals, multi-select, etc.)

## Version Control
Every change/commit should come accompanied with the relevant files/places where version needs to be bumped. Bump it accordingly with the size of the feature add or fix.

## Data Model

Personal data stored at `/users/{uid}/taskpad`. Team projects at `/projects/{teamId}` with subcollection `/tasks/{taskId}`. Invites at `/invites/{id}`. See `firestore.rules` for access control.

Core shape: `{ projects[], tasks[], shortcuts[], scOrder[], activeTab, showSc }`

Notes stored as Firestore subcollection `/users/{uid}/notes/{noteId}`:
```
{ title, content, tags[], links[], pinned, dailyDate, createdAt, updatedAt }
```

## Conventions

- IDs generated via `genId()`: `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`
- Colors from `TAB_COLORS` array in `src/App.jsx`
- Inbox is a virtual project with ID `__inbox__` (`INBOX_ID`)
- Notes is a virtual tab with ID `__notes__` (`NOTES_ID`)
- Firebase config via Vite env vars (`VITE_FIREBASE_*`), checked at runtime by `isFirebaseConfigured()` in `src/firebase.js`
- Team task operations go through dedicated functions in `sync.js` (not through `up()`)
- Notes operations go through `sync.js`: `subscribePersonalNotes`, `createPersonalNote`, `updatePersonalNote`, `deletePersonalNote`

## Additional Documentation

Check these files for deeper context when relevant:

| Topic | File |
|-------|------|
| Architectural patterns & design decisions | `.claude/docs/architectural_patterns.md` |
| Notes feature: selectors, helpers, markup | `.claude/docs/notes_reference.md` |
| Update system: platform detection, download, install flows | `.claude/docs/domain_update_system.md` |
| Multi-platform migration spec (Tauri 2.0 + Android) | `docs/superpowers/specs/2026-03-16-multi-platform-auto-update-design.md` |
| Multi-platform implementation plan (20 tasks) | `docs/superpowers/plans/2026-03-16-multi-platform-auto-update.md` |
