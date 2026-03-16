# Notes Feature Reference

CSS selectors for notes UI follow `.notes-*` naming — search `src/styles.css` for specifics.

## Keyboard Shortcuts (Edit Mode)

| Shortcut | Action | Format applied |
|----------|--------|----------------|
| `Ctrl/Cmd + B` | Bold | `**text**` |
| `Ctrl/Cmd + I` | Italic | `*text*` |
| `Ctrl/Cmd + K` | Insert link | `[text](url)` |
| `` Ctrl/Cmd + ` `` | Code | `` `text` `` or fenced block |
| `Ctrl/Cmd + E` | Toggle edit/preview | Switches `noteView` state |

`Ctrl+E` is registered as a global `window` keydown listener (active when a note is open). The other shortcuts are handled via `onKeyDown` on the notes textarea. All call `applyFormat(type)` except `Ctrl+E`.

## JS Helpers — `src/markdown.js`

| Export | Signature | Purpose |
|--------|-----------|---------|
| `parseMarkdown` | `(content: string) => string` | Preprocesses wikilinks/tags, runs `marked`, strips scripts |
| `extractLinks` | `(content: string) => string[]` | Returns unique `[[wikilink]]` targets |
| `extractTags` | `(content: string) => string[]` | Returns unique `#tag` names (lowercase) |

## JS Helpers — `src/sync.js`

| Export | Signature | Purpose |
|--------|-----------|---------|
| `subscribePersonalNotes` | `(cb) => unsubscribe` | Real-time listener on `/users/{uid}/notes` ordered by `updatedAt desc` |
| `createPersonalNote` | `({ title, content, tags, links, pinned, dailyDate }) => id` | Creates note doc, returns ID |
| `updatePersonalNote` | `({ noteId, patch }) => void` | Partial update with `updatedAt` |
| `deletePersonalNote` | `({ noteId }) => void` | Deletes note doc |

## App.jsx State & Callbacks

| State/Ref | Type | Purpose |
|-----------|------|---------|
| `notesList` | `Note[]` | All user notes from Firestore listener |
| `activeNote` | `string\|null` | ID of note being edited, `null` = list view |
| `noteView` | `'edit'\|'preview'` | Editor toggle |
| `noteSearch` | `string` | Search filter text |
| `noteDraft` | `{ title, content }` | Local draft for active note |
| `noteSaveRef` | `Ref<timeout>` | 800ms debounce timer |
| `noteDeleteConfirm` | `boolean` | Delete confirmation state |

| Callback | Purpose |
|----------|---------|
| `saveNote(noteId, title, content)` | Debounced save (800ms), re-extracts tags/links |
| `createNote(opts?)` | Creates note, opens editor. `opts: { title, content, dailyDate }` |
| `openDailyNote()` | Finds today's daily note or creates one |
| `handleNoteClick(noteId)` | Opens existing note in editor |
| `handleWikilinkClick(noteName)` | Navigates to note by title, creates if missing |
| `handleDeleteNote()` | Deletes active note, returns to list |

| Memo | Purpose |
|------|---------|
| `backlinks` | Notes whose `links[]` contains active note's title |
| `filteredNotes` | Notes matching `noteSearch` by title/content/tags |

## Constants

| Name | Value | Location |
|------|-------|----------|
| `NOTES_ID` | `'__notes__'` | `src/App.jsx:34` |
| Notes accent | `#a78bfa` | Nav tab, CSS selectors |

## Firestore Rules

```
/users/{userId}/notes/{noteId} — owner read/write only
```
