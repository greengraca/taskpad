# Architectural Patterns & Design Decisions

## 1. Monolithic Component with Helper Components

The entire UI is a single `App()` function (`src/App.jsx:411`, ~950 lines). Smaller components (`TaskLine` at line 236, `ShortcutIcon` at line 163, `InsertZone` at line 399) are defined in the same file and receive all data via props. There is no component directory or file-per-component structure.

**Why**: Keeps the app simple — no prop-drilling through deep trees, no context providers. Everything shares scope within `App()`.

## 2. Optimistic State with Debounced Cloud Save

The `up()` function (`src/App.jsx:498`) is the central state updater:
- Takes a function `fn(prev) => next`
- Calls `setData()` immediately (optimistic)
- Debounces `saveToCloud()` by 400ms

All personal data mutations flow through `up()`. Team task mutations bypass it and call `sync.js` functions directly (e.g., `createTeamTask`, `updateTeamTask`).

## 3. Dual Storage: localStorage + Firestore

- `loadLocal()` / `saveLocal()` in `sync.js:34-43` handle localStorage persistence
- `initSync()` (`sync.js:70`) sets up Firestore `onSnapshot` listeners
- On load: local data displayed first, then Firestore data overwrites when it arrives
- Unauthenticated users get local-only mode; auth unlocks cloud sync

## 4. Real-time Team Sync via Subscription Map

Team projects use per-project Firestore listeners:
- `subscribeTeamTasks(teamId, cb)` (`sync.js:282`) creates an `onSnapshot` listener per team
- `subscribeTeamProject(teamId, cb)` (`sync.js:263`) listens for project metadata changes
- Listeners are tracked and cleaned up via `cleanTeamListeners()` (`sync.js:61`)
- Team task state is managed separately from personal task state in `App.jsx`

## 5. Custom Drag-and-Drop Hooks

Two hooks handle all reordering without any library:
- `useDragReorder(items, onReorder)` (`src/App.jsx:63`) — vertical drag for tasks
- `useHDragReorder(items, onReorder)` (`src/App.jsx:114`) — horizontal drag for tabs/shortcuts

Both use:
- Pre-computed element heights/widths for offset calculation
- CSS `transform` for animation (no DOM reflow)
- `onPointerDown` / `onPointerMove` / `onPointerUp` event flow
- Touch support with `preventDefault` to avoid scroll interference

## 6. Multi-Select with Drag Selection

Task selection supports three modes:
- **Click**: Ctrl+Click toggles individual task selection
- **Drag-select**: Pointer drag across tasks selects a range (`dragSelectRef` in App.jsx)
- **Keyboard**: Ctrl+A selects all visible tasks

The `dragSelectRef` tracks `active` and `justEnded` states to prevent ghost clicks after drag selection ends. Selected tasks support batch copy and batch delete.

## 7. Long-Press Pattern (Mobile)

Mobile interactions use timed press detection:
- Tasks: 500ms long-press to enter selection mode (with haptic via `navigator.vibrate`)
- Tabs: 600ms hold for context menu (iOS-compatible, avoids native callout)
- Shortcuts: 120ms threshold before showing unlock ring animation

Implemented via `setTimeout` in `onPointerDown` / `onTouchStart`, cleared on move/up.

## 8. Modal Pattern

All modals (auth, invite, shortcut edit, team settings) follow the same structure:
- Backdrop div with click-to-dismiss
- Centered modal container
- State-driven visibility via boolean flags (e.g., `showAuth`, `showTeamSettings`)
- No portal usage — modals render inline within `App()`

## 9. Smart Task Routing

Tasks auto-route to projects based on text content (`src/App.jsx`):
- Each project has optional `keywords` array
- On task creation, text is matched against project names and keywords (case-insensitive)
- Matched tasks go directly to the project; unmatched tasks go to Inbox
- Tasks track their `origin` ('inbox' or project ID) for filtering

## 10. Firestore Security Model

Security rules (`firestore.rules`) enforce:
- Personal data: only the owning user can read/write `/users/{uid}`
- Team projects: only `memberUids[]` can read; mutations scoped by role
- Owner-only: project deletion, member removal
- Non-owners can update only `nicknames` and `avatars` maps
- Invites: creator can write, recipient (matched by email) can update status

## 11. PWA Lifecycle

- Service worker via `vite-plugin-pwa` with `prompt` registration (`vite.config.js`)
- `reconnectFirestore()` (`sync.js:367`) called on `visibilitychange` to restore network after PWA backgrounding
- Offline: cached assets serve immediately; Firestore persistence handles data
- Update flows: see `.claude/docs/domain_update_system.md`
