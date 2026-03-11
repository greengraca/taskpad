# Shared Notes for Team Projects

Personal notes that can be optionally shared with team project members, with per-note permission control.

## Core Concept

Notes remain personal (`/users/{uid}/notes/{noteId}`). The author can link a note to a team project for their own organization, and separately choose to share it with the team. Sharing visibility is controlled per team project with three states: Private, View, Edit. Sharing requires linking — a note must be linked to a team project before it can be shared. Unlinking auto-unshares.

## Data Model

### Personal note doc — additions

Add to the note doc at `/users/{uid}/notes/{noteId}`:

```
{
  ...existing fields,
  teamIds: string[],         // team project IDs the note is shared with
  sharedWithUids: string[],  // UIDs of team members who can read (denormalized for Firestore rules)
  editableByUids: string[]   // UIDs of team members who can edit (denormalized for Firestore rules)
}
```

- `teamIds` tracks which teams the note is shared with (for cleanup lookups).
- `sharedWithUids` / `editableByUids` are denormalized from team membership. These are the fields Firestore rules actually check — avoids the limitation that rules cannot iterate arrays with cross-document `get()` calls.
- These arrays must be updated when: sharing is toggled, team membership changes (member added/removed).

### Shared note registry — new subcollection

`/projects/{teamId}/sharedNotes/{noteId}`:

```
{
  ownerUid: string,
  permission: "view" | "edit",
  sharedAt: Timestamp
}
```

Doc ID matches note ID. Only the note author can create/update/delete these docs. Team members can read them to discover available shared notes.

### No changes to

- Team project docs (`/projects/{teamId}`)
- Team task docs (`/projects/{teamId}/tasks/{taskId}`)
- Existing note fields (projectIds, tags, links, etc.)

## Firestore Security Rules

Uses the existing `isProjectMember(projectId)` helper in `firestore.rules`.

### `/users/{uid}/notes/{noteId}`

- **read**: `request.auth.uid == uid` OR `request.auth.uid in resource.data.sharedWithUids`
- **write**: `request.auth.uid == uid` OR `request.auth.uid in resource.data.editableByUids`

Simple array membership checks — no cross-document reads needed.

### `/projects/{teamId}/sharedNotes/{noteId}`

- **read**: `isProjectMember(teamId)`
- **create**: `request.auth.uid == request.resource.data.ownerUid && isProjectMember(teamId)`
- **update/delete**: `request.auth.uid == resource.data.ownerUid && isProjectMember(teamId)`

## Sync Layer (sync.js)

### New functions

| Function | Purpose |
|----------|---------|
| `shareNoteWithTeam({ noteId, teamId, permission })` | **Batched write**: create/update registry doc + update note's `teamIds[]`, `sharedWithUids[]`, `editableByUids[]` |
| `unshareNoteFromTeam({ noteId, teamId })` | **Batched write**: delete registry doc + remove teamId from `teamIds[]`, remove team member UIDs from `sharedWithUids[]`/`editableByUids[]` |
| `subscribeSharedNotes(teamId, cb)` | Real-time listener on `/projects/{teamId}/sharedNotes` |
| `subscribeSharedNoteContent(ownerUid, noteId, cb)` | Real-time listener on a shared note doc for live updates while viewing |
| `updateSharedNote({ ownerUid, noteId, patch })` | Update another user's note (edit permission required) |

All share/unshare operations use `writeBatch` for atomicity between the registry doc and note doc updates.

### Existing functions — changes

- `deletePersonalNote` must be updated to also delete all registry entries for that note. Uses `teamIds[]` on the note to find which teams to clean up. Batched write.
- `addNoteProject` / `removeNoteProject` continue to manage `projectIds[]` for linking. Linking does not imply sharing. Removing a team project from `projectIds[]` triggers `unshareNoteFromTeam` if the note was shared with that team.

### Team membership change handling

When a team member is added or removed, any notes shared with that team need their `sharedWithUids` / `editableByUids` arrays updated. This is handled by iterating the team's `sharedNotes` registry and updating each note doc. Called from the existing team member management functions.

## UI — Author's Note Editor

### Team projects in the project picker

The existing "+ Project" dropdown now includes team projects alongside personal ones. Team projects are visually distinguished (e.g., team icon or different badge color).

### Per-team-project sharing control

Next to each linked team project badge in the editor, a control shows the current sharing state:

- **Private** (lock icon) — default. Linked for your organization, team can't see it.
- **View** (eye icon) — team members can read the note.
- **Edit** (pencil icon) — team members can read and edit the note.

Clicking the icon opens a small popover or cycles through states.

### Unlinking behavior

Unlinking a team project from a note automatically unshares it if it was shared.

## UI — Team Member's View

### Notes bar in team project tab

The existing notes bar above the task list shows shared notes from team members:

- Author's own linked notes appear as today
- Shared notes from others show with author nickname/avatar and permission indicator (eye or pencil icon)

### Opening a shared note

Clicking a shared note chip switches to the Notes tab and opens the note:

- **View-only**: textarea disabled, formatting bar hidden. Banner: "Shared by {nickname} — view only"
- **Editable**: normal editing, banner: "Shared by {nickname} — you can edit"
- Editor toolbar shows author identity (nickname + avatar)

### Wikilinks in shared notes

- Links to other notes shared with the same team project: clickable, opens that note
- Links to private notes: rendered as a link, clicking shows toast "This note is private"

### Shared notes in Notes tab sidebar

Shared notes from others appear in a separate section at the bottom of the notes list, grouped by team project. Labeled "Shared with {Project Name}".

## State Management (App.jsx)

### New state

| State | Type | Purpose |
|-------|------|---------|
| `sharedNotesMap` | `Map<teamId, registryEntry[]>` | Registry entries per team project |
| `openSharedNote` | `{ ownerUid, noteId, teamId, permission } \| null` | Currently open shared note metadata |
| `sharedNoteContent` | `{ title, content, tags, links } \| null` | Content of currently open shared note |

### Subscription lifecycle

- Subscribe to `/projects/{teamId}/sharedNotes` alongside existing team task subscriptions (~line 711). Track unsubscribe functions in a `sharedNotesUnsubs` Map, cleaned up in `cleanTeamListeners()`.
- When a shared note is opened, start `subscribeSharedNoteContent`. Tear down on close/navigate away. Handle errors gracefully (note deleted, access revoked) by closing the editor and showing a toast.
- Editable shared notes use the same 800ms debounce, calling `updateSharedNote`.

### No cross-user list subscription

Never subscribe to another user's full notes collection. Only read individual note docs explicitly shared via the registry.

## Edge Cases

### Author deletes a shared note
`deletePersonalNote` is updated to batch-delete all registry entries (using `teamIds[]` to find them). Team members' `subscribeSharedNotes` listeners fire and remove the note from their UI.

### Author leaves or is removed from a team
All notes the author shared with that team are automatically unshared. The team member removal flow calls `unshareNoteFromTeam` for each of the author's shared notes in that team.

### Team member is removed
They lose access naturally (removed from `sharedWithUids`/`editableByUids` on note docs). Active `subscribeSharedNoteContent` listeners will error — client handles this by closing the shared note and showing a toast.

### Concurrent edits on editable notes
Last-write-wins, same as the existing personal notes system. Collaborative editing (OT/CRDT) is out of scope. If two users edit simultaneously, the last save wins. A future enhancement could add `updatedAt` conflict detection.

### Orphaned registry docs
If a registry doc exists but the note doc is gone (e.g., partial failure), the client handles "note not found" gracefully and offers to clean up the orphaned registry entry.

## Firestore Indexes

No custom composite indexes required. `subscribeSharedNotes` queries a single subcollection without ordering or filtering beyond the default. If ordering by `sharedAt` is added later, a single-field index on `sharedAt` suffices (auto-created by Firestore).
