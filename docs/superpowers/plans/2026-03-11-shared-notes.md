# Shared Notes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow personal notes to be optionally shared (view-only or editable) with team project members via a lightweight Firestore registry.

**Architecture:** Notes stay in `/users/{uid}/notes/{noteId}`. A registry subcollection `/projects/{teamId}/sharedNotes/{noteId}` tracks which notes are shared. Denormalized `sharedWithUids[]` and `editableByUids[]` arrays on the note doc enable simple Firestore rules. All share/unshare operations use `writeBatch` for atomicity.

**Tech Stack:** React 18, Firebase Firestore (real-time listeners, batched writes), plain CSS.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `firestore.rules` | Add shared note read/write rules, sharedNotes subcollection rules |
| Modify | `src/sync.js` | Add share/unshare/subscribe functions, update deletePersonalNote |
| Modify | `src/App.jsx` | New state, subscriptions, UI for sharing controls and shared note display |
| Modify | `src/styles.css` | Styles for sharing controls, shared note banner, shared notes section |

---

## Task 1: Firestore Security Rules

**Files:**
- Modify: `firestore.rules:22-24` (note rules), add new block after line 57 (sharedNotes)

- [ ] **Step 1: Update note read/write rules**

In `firestore.rules`, replace the notes rule block:

```javascript
match /notes/{noteId} {
  allow read: if isSignedIn() && (
    request.auth.uid == userId ||
    request.auth.uid in resource.data.sharedWithUids
  );
  allow write: if isSignedIn() && (
    request.auth.uid == userId ||
    request.auth.uid in resource.data.editableByUids
  );
}
```

The `sharedWithUids` check covers both view and edit users. The `editableByUids` check is a subset for write access.

- [ ] **Step 2: Add sharedNotes subcollection rules**

Inside the `match /projects/{projectId}` block, after the vault rules (line 57), add:

```javascript
match /sharedNotes/{noteId} {
  allow read: if isProjectMember(projectId);
  allow create: if isProjectMember(projectId)
    && request.auth.uid == request.resource.data.ownerUid;
  allow update, delete: if isProjectMember(projectId)
    && request.auth.uid == resource.data.ownerUid;
}
```

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore rules for shared notes"
```

---

## Task 2: Sync Layer — Share/Unshare Functions

**Files:**
- Modify: `src/sync.js:475-552` (notes section)

- [ ] **Step 1: Add `shareNoteWithTeam` function**

After `deletePersonalNote` (line 552) in sync.js, add:

```javascript
export const shareNoteWithTeam = async ({ noteId, teamId, permission, teamMemberUids }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  const batch = writeBatch(db);

  // Registry doc
  const regRef = doc(db, 'projects', teamId, 'sharedNotes', noteId);
  // Read note title for denormalization into registry
  const noteSnap = await getDoc(doc(db, 'users', userId, 'notes', noteId));
  const noteTitle = noteSnap.exists() ? (noteSnap.data().title || 'Untitled') : 'Untitled';

  batch.set(regRef, {
    ownerUid: userId,
    permission,
    title: noteTitle,
    sharedAt: serverTimestamp(),
  }, { merge: true });

  // Denormalize UIDs onto note doc
  const noteRef = doc(db, 'users', userId, 'notes', noteId);
  const otherUids = teamMemberUids.filter(uid => uid !== userId);
  const update = {
    teamIds: arrayUnion(teamId),
    updatedAt: serverTimestamp(),
  };
  if (otherUids.length > 0) {
    update.sharedWithUids = arrayUnion(...otherUids);
    if (permission === 'edit') {
      update.editableByUids = arrayUnion(...otherUids);
    }
  }
  batch.update(noteRef, update);

  await batch.commit();
};
```

`teamMemberUids` is passed from the UI, which already has the team project data with `memberUids`.

- [ ] **Step 2: Add `unshareNoteFromTeam` function**

```javascript
export const unshareNoteFromTeam = async ({ noteId, teamId, teamMemberUids }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  const batch = writeBatch(db);

  // Delete registry doc
  const regRef = doc(db, 'projects', teamId, 'sharedNotes', noteId);
  batch.delete(regRef);

  // Remove team member UIDs from note doc
  const noteRef = doc(db, 'users', userId, 'notes', noteId);
  const otherUids = teamMemberUids.filter(uid => uid !== userId);
  if (otherUids.length > 0) {
    batch.update(noteRef, {
      teamIds: arrayRemove(teamId),
      sharedWithUids: arrayRemove(...otherUids),
      editableByUids: arrayRemove(...otherUids),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(noteRef, {
      teamIds: arrayRemove(teamId),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
};
```

- [ ] **Step 3: Add `updateNoteSharePermission` function**

For changing between "view" and "edit" without a full unshare/reshare:

```javascript
export const updateNoteSharePermission = async ({ noteId, teamId, permission, teamMemberUids }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  const batch = writeBatch(db);
  const otherUids = teamMemberUids.filter(uid => uid !== userId);

  // Update registry permission
  batch.update(doc(db, 'projects', teamId, 'sharedNotes', noteId), {
    permission,
    sharedAt: serverTimestamp(),
  });

  // Update note's editableByUids
  const noteRef = doc(db, 'users', userId, 'notes', noteId);
  if (permission === 'edit' && otherUids.length > 0) {
    batch.update(noteRef, {
      editableByUids: arrayUnion(...otherUids),
      updatedAt: serverTimestamp(),
    });
  } else if (permission !== 'edit') {
    // Downgrade from edit to view: remove from editableByUids
    if (otherUids.length > 0) {
      batch.update(noteRef, {
        editableByUids: arrayRemove(...otherUids),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
};
```

- [ ] **Step 4: Commit**

```bash
git add src/sync.js
git commit -m "feat: add share/unshare/permission sync functions"
```

---

## Task 3: Sync Layer — Subscriptions and Shared Note Access

**Files:**
- Modify: `src/sync.js`

- [ ] **Step 1: Add `subscribeSharedNotes` function**

```javascript
export const subscribeSharedNotes = (teamId, cb) => {
  if (!isFirebaseConfigured() || !userId) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'projects', teamId, 'sharedNotes'));
  const unsub = onSnapshot(q, (snap) => {
    const entries = snap.docs.map(d => ({ noteId: d.id, ...d.data() }));
    cb(entries);
  }, (e) => {
    console.warn('Shared notes listener error:', e);
    cb([]);
  });
  return unsub;
};
```

- [ ] **Step 2: Add `subscribeSharedNoteContent` function**

```javascript
export const subscribeSharedNoteContent = (ownerUid, noteId, cb) => {
  if (!isFirebaseConfigured() || !userId) {
    cb(null);
    return () => {};
  }
  const noteRef = doc(db, 'users', ownerUid, 'notes', noteId);
  const unsub = onSnapshot(noteRef, (snap) => {
    if (snap.exists()) {
      cb({ id: snap.id, ...snap.data() });
    } else {
      cb(null); // Note was deleted
    }
  }, (e) => {
    console.warn('Shared note content listener error:', e);
    cb(null);
  });
  return unsub;
};
```

- [ ] **Step 3: Add `updateSharedNote` function**

```javascript
export const updateSharedNote = async ({ ownerUid, noteId, patch }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  await updateDoc(doc(db, 'users', ownerUid, 'notes', noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
};
```

- [ ] **Step 4: Update `deletePersonalNote` to clean up registry docs**

Replace the existing `deletePersonalNote` function:

```javascript
export const deletePersonalNote = async ({ noteId }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');

  // Read the note to get teamIds for cleanup
  const noteRef = doc(db, 'users', userId, 'notes', noteId);
  const noteSnap = await getDoc(noteRef);
  const teamIds = noteSnap.exists() ? (noteSnap.data().teamIds || []) : [];

  const batch = writeBatch(db);
  batch.delete(noteRef);

  // Delete all registry entries for this note
  for (const tid of teamIds) {
    batch.delete(doc(db, 'projects', tid, 'sharedNotes', noteId));
  }

  await batch.commit();
};
```

- [ ] **Step 5: Commit**

```bash
git add src/sync.js
git commit -m "feat: add shared note subscriptions and cleanup"
```

---

## Task 4: Sync Layer — Team Membership Change Handling

**Files:**
- Modify: `src/sync.js`

When a team member is added or removed, the denormalized `sharedWithUids` / `editableByUids` arrays on all notes shared with that team must be updated. Otherwise new members can't read shared notes, and removed members retain stale access.

- [ ] **Step 1: Add `syncSharedNoteUids` function**

This function recalculates the denormalized UID arrays for all notes shared with a given team. Called when team membership changes are detected.

```javascript
export const syncSharedNoteUids = async ({ teamId, currentMemberUids }) => {
  if (!isFirebaseConfigured() || !userId) return;

  // Get all shared notes for this team
  const sharedSnap = await getDocs(query(collection(db, 'projects', teamId, 'sharedNotes')));
  if (sharedSnap.empty) return;

  const batch = writeBatch(db);
  for (const regDoc of sharedSnap.docs) {
    const { ownerUid, permission } = regDoc.data();
    const otherUids = currentMemberUids.filter(uid => uid !== ownerUid);
    const noteRef = doc(db, 'users', ownerUid, 'notes', regDoc.id);

    // We can only update notes we own (Firestore rules)
    if (ownerUid !== userId) continue;

    // Rebuild the arrays: set sharedWithUids to current team members (minus owner)
    // Note: if the note is shared with multiple teams, we can't simply overwrite —
    // we'd lose UIDs from other teams. Instead, we add new members and rely on
    // unshare flow for removals.
    if (otherUids.length > 0) {
      const update = { sharedWithUids: arrayUnion(...otherUids), updatedAt: serverTimestamp() };
      if (permission === 'edit') {
        update.editableByUids = arrayUnion(...otherUids);
      }
      batch.update(noteRef, update);
    }
  }
  await batch.commit();
};
```

**Limitation:** This only adds new members. For removed members, their UIDs remain in the arrays until the note author explicitly unshares or the team project subscription detects the change and triggers cleanup. Since Firestore rules also check team membership via `isProjectMember`, removed members lose team project access entirely, which prevents them from discovering notes via the registry — so stale UIDs in the arrays are a low-severity issue (they could still read the note doc directly if they had the path, but cannot discover it).

- [ ] **Step 2: Add `cleanRemovedMemberFromNotes` function**

For thorough cleanup when a member is removed:

```javascript
export const cleanRemovedMemberFromNotes = async ({ teamId, removedUid }) => {
  if (!isFirebaseConfigured() || !userId) return;

  // Get all shared notes for this team that we own
  const sharedSnap = await getDocs(query(collection(db, 'projects', teamId, 'sharedNotes')));
  if (sharedSnap.empty) return;

  const batch = writeBatch(db);
  for (const regDoc of sharedSnap.docs) {
    const { ownerUid } = regDoc.data();
    if (ownerUid !== userId) continue;
    const noteRef = doc(db, 'users', ownerUid, 'notes', regDoc.id);
    batch.update(noteRef, {
      sharedWithUids: arrayRemove(removedUid),
      editableByUids: arrayRemove(removedUid),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
};
```

- [ ] **Step 3: Commit**

```bash
git add src/sync.js
git commit -m "feat: sync denormalized UIDs on team membership changes"
```

---

## Task 5: App State and Subscriptions

**Files:**
- Modify: `src/App.jsx:537-553` (note state), `src/App.jsx:710-726` (team subscriptions)

- [ ] **Step 1: Add new state hooks**

After the existing note state hooks (line 552), add:

```javascript
const [sharedNotesMap, setSharedNotesMap] = useState({}); // { [teamId]: registryEntry[] }
const [openSharedNote, setOpenSharedNote] = useState(null); // { ownerUid, noteId, teamId, permission } | null
const [sharedNoteContent, setSharedNoteContent] = useState(null); // { id, title, content, tags, links, ... } | null
```

- [ ] **Step 2: Subscribe to shared notes for each team project**

After the team tasks subscription useEffect (line 726), add:

```javascript
// Subscribe to shared notes for ALL team projects
useEffect(() => {
  if (teamIdsList.length === 0 || !synced) return;
  const unsubs = teamIdsList.map(tid =>
    subscribeSharedNotes(tid, (entries) => {
      setSharedNotesMap(prev => ({ ...prev, [tid]: entries }));
    })
  );
  return () => unsubs.forEach(u => u());
}, [teamIdsKey, synced]);
```

- [ ] **Step 3: Subscribe to shared note content when opening one**

```javascript
// Subscribe to shared note content when viewing one
useEffect(() => {
  if (!openSharedNote) {
    setSharedNoteContent(null);
    return;
  }
  const { ownerUid, noteId } = openSharedNote;
  const unsub = subscribeSharedNoteContent(ownerUid, noteId, (data) => {
    if (!data) {
      // Note was deleted or access revoked
      setOpenSharedNote(null);
      setSharedNoteContent(null);
      return;
    }
    setSharedNoteContent(data);
  });
  return unsub;
}, [openSharedNote?.ownerUid, openSharedNote?.noteId]);
```

- [ ] **Step 4: Detect team membership changes and sync UIDs**

In the existing `subscribeTeamProject` effect (around line 729), add logic to detect membership changes and sync shared note UIDs:

```javascript
// Subscribe directly to the team project doc for nicknames/avatars + membership sync
const prevMemberUidsRef = useRef({});
useEffect(() => {
  if (!isTeamTab || !teamId) return;
  const unsub = subscribeTeamProject(teamId, (projData) => {
    setTeamProjDirect(prev => ({ ...prev, [teamId]: projData }));

    // Detect membership changes for shared notes
    const prevUids = prevMemberUidsRef.current[teamId] || [];
    const currUids = projData?.memberUids || [];
    if (prevUids.length > 0 && prevUids.length !== currUids.length) {
      // New members added — sync their UIDs to shared notes
      const added = currUids.filter(uid => !prevUids.includes(uid));
      if (added.length) {
        syncSharedNoteUids({ teamId, currentMemberUids: currUids }).catch(() => {});
      }
      // Members removed — clean their UIDs from shared notes
      const removed = prevUids.filter(uid => !currUids.includes(uid));
      for (const uid of removed) {
        cleanRemovedMemberFromNotes({ teamId, removedUid: uid }).catch(() => {});
      }
    }
    prevMemberUidsRef.current[teamId] = currUids;
  });
  return unsub;
}, [isTeamTab, teamId]);
```

Note: this replaces the existing `subscribeTeamProject` effect at line 729-735.

- [ ] **Step 5: Add imports**

At the top of App.jsx, add to the sync.js import:

```javascript
import {
  // ... existing imports ...
  shareNoteWithTeam,
  unshareNoteFromTeam,
  updateNoteSharePermission,
  subscribeSharedNotes,
  subscribeSharedNoteContent,
  updateSharedNote,
  syncSharedNoteUids,
  cleanRemovedMemberFromNotes,
} from './sync';
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add shared notes state and subscriptions"
```

---

## Task 6: Author UI — Team Projects in Project Picker

**Files:**
- Modify: `src/App.jsx:2774-2807` (project picker in note editor)

- [ ] **Step 1: Update project picker to include team projects**

Replace the project picker filter at line 2777-2798. Currently it filters `!p.isTeam` — change it to include team projects:

In the linked projects display (line 2777):
```javascript
const linkedProjects = ids.map(id => {
  const personal = projects.find(p => p.id === id && !p.isTeam);
  if (personal) return personal;
  // Check team projects
  const teamProj = projects.find(p => p.isTeam && p.teamId === id);
  if (teamProj) return { ...teamProj, id: teamProj.teamId, isTeam: true };
  return null;
}).filter(Boolean);
```

Compute `linkedIds` from the new `linkedProjects` and build availability from all projects:
```javascript
const linkedIds = new Set(linkedProjects.map(p => p.id));
const allProjects = [
  ...projects.filter(p => !p.isTeam),
  ...projects.filter(p => p.isTeam && p.teamId).map(p => ({ ...p, id: p.teamId, isTeam: true })),
];
const available = allProjects.filter(p => !linkedIds.has(p.id));
```

Show the "+ Project" button when `available.length > 0`, and render the picker:
```javascript
return available.map(p => (
  <button key={p.id} className="notes-proj-picker-item" onMouseDown={e => {
    e.preventDefault();
    linkNoteToProject(activeNote, p.id);
    setProjPicker(false);
  }}>
    <span className="notes-proj-dot" style={{ background: p.color }} />
    {p.isTeam && <span className="notes-proj-team-icon">👥</span>}
    {p.name}
  </button>
));
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: include team projects in note project picker"
```

---

## Task 7: Author UI — Sharing Control Per Team Project

**Files:**
- Modify: `src/App.jsx` (note editor project badges area)
- Modify: `src/styles.css` (sharing control styles)

- [ ] **Step 1: Add sharing state helper**

Near the note state section in App.jsx, add a helper to get a note's sharing state for a given team:

```javascript
const getNoteShareState = useCallback((noteId, teamId) => {
  const entries = sharedNotesMap[teamId] || [];
  const entry = entries.find(e => e.noteId === noteId && e.ownerUid === syncStatus?.user?.uid);
  if (!entry) return 'private';
  return entry.permission; // 'view' or 'edit'
}, [sharedNotesMap, syncStatus?.user?.uid]);
```

- [ ] **Step 2: Add sharing toggle handler**

```javascript
const cycleNoteShareState = useCallback(async (noteId, teamId) => {
  const currentState = getNoteShareState(noteId, teamId);
  const teamProj = projects.find(p => p.isTeam && p.teamId === teamId);
  const teamProjData = teamProjDirect[teamId];
  const memberUids = teamProjData?.memberUids || teamProj?.memberUids || [];

  try {
    if (currentState === 'private') {
      await shareNoteWithTeam({ noteId, teamId, permission: 'view', teamMemberUids: memberUids });
    } else if (currentState === 'view') {
      await updateNoteSharePermission({ noteId, teamId, permission: 'edit', teamMemberUids: memberUids });
    } else {
      // edit -> private (unshare)
      await unshareNoteFromTeam({ noteId, teamId, teamMemberUids: memberUids });
    }
  } catch (e) {
    console.warn('Share toggle failed:', e);
  }
}, [getNoteShareState, projects, teamProjDirect]);
```

- [ ] **Step 3: Update linked project badges for team projects**

In the note editor's linked projects display (around line 2781), update team project badges to show the sharing control:

For each linked project that `isTeam`, render the sharing icon next to the badge:

```jsx
{linkedProjects.map(lp => (
  <span key={lp.id} className="notes-proj-badge" style={{ borderColor: lp.color + '44', color: lp.color }}>
    <span className="notes-proj-dot" style={{ background: lp.color }} />
    {lp.name}
    {lp.isTeam && (() => {
      const shareState = getNoteShareState(activeNote, lp.id);
      return (
        <button
          className={`notes-share-toggle notes-share-${shareState}`}
          onClick={(e) => { e.stopPropagation(); cycleNoteShareState(activeNote, lp.id); }}
          title={shareState === 'private' ? 'Private — click to share (view)' : shareState === 'view' ? 'Shared (view) — click for edit' : 'Shared (edit) — click to unshare'}
        >
          {shareState === 'private' ? '🔒' : shareState === 'view' ? '👁' : '✏️'}
        </button>
      );
    })()}
    <button className="notes-proj-unlink" onClick={() => {
      // If shared, unshare first
      if (lp.isTeam) {
        const shareState = getNoteShareState(activeNote, lp.id);
        if (shareState !== 'private') {
          const teamProj = projects.find(p => p.isTeam && p.teamId === lp.id);
          const tpd = teamProjDirect[lp.id];
          const memberUids = tpd?.memberUids || teamProj?.memberUids || [];
          unshareNoteFromTeam({ noteId: activeNote, teamId: lp.id, teamMemberUids: memberUids }).catch(() => {});
        }
      }
      unlinkNoteFromProject(activeNote, lp.id);
    }}>×</button>
  </span>
))}
```

- [ ] **Step 4: Add CSS for sharing controls**

In `src/styles.css`, add:

```css
.notes-share-toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
  font-size: 11px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.notes-share-toggle:hover { opacity: 1; }
.notes-proj-team-icon {
  font-size: 10px;
  margin-right: 2px;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: add per-team sharing control on note project badges"
```

---

## Task 8: Team Member View — Shared Notes Bar in Project Tab

**Files:**
- Modify: `src/App.jsx:2939-2948` (project notes bar), `src/App.jsx:1869-1876` (projectNotes memo)

- [ ] **Step 1: Update `projectNotes` memo to include shared notes**

Replace the `projectNotes` memo (line 1869):

```javascript
const projectNotes = useMemo(() => {
  if (!data || !activeTab || activeTab === INBOX_ID || activeTab === NOTES_ID) return EMPTY;

  const proj = (data?.projects || []).find(p => p.id === activeTab);

  // Personal project: show own linked notes (existing behavior)
  if (proj && !proj.isTeam) {
    return notesList.filter(n => (n.projectIds || []).includes(activeTab) || n.projectId === activeTab)
      .map(n => ({ ...n, _isOwn: true }));
  }

  // Team project: show own linked notes + shared notes from others
  if (proj?.isTeam && proj.teamId) {
    const tid = proj.teamId;
    const ownNotes = notesList
      .filter(n => (n.projectIds || []).includes(tid))
      .map(n => ({ ...n, _isOwn: true }));

    const sharedEntries = sharedNotesMap[tid] || [];
    const myUid = syncStatus?.user?.uid;
    const otherShared = sharedEntries
      .filter(e => e.ownerUid !== myUid)
      .map(e => ({
        id: e.noteId,
        _isOwn: false,
        _ownerUid: e.ownerUid,
        _permission: e.permission,
        _teamId: tid,
        title: e.title || null, // Denormalized from registry
      }));

    return [...ownNotes, ...otherShared];
  }

  return EMPTY;
}, [notesList, data, sharedNotesMap, syncStatus?.user?.uid]);
```

- [ ] **Step 2: Update notes bar rendering for shared notes**

Replace the project notes bar (line 2939):

```jsx
{projectNotes.length > 0 && (
  <div className="proj-notes-bar">
    <span className="proj-notes-label">📝 Notes</span>
    {projectNotes.map(n => {
      if (n._isOwn) {
        return (
          <button key={n.id} className="proj-notes-chip" onClick={() => { up(p => ({ ...p, activeTab: NOTES_ID })); handleNoteClick(n.id); }}>
            {n.title || 'Untitled'}
          </button>
        );
      }
      // Shared note from another team member
      const teamProj = teamProjDirect[n._teamId];
      const nick = teamProj?.nicknames?.[n._ownerUid] || 'teammate';
      return (
        <button key={`shared-${n.id}`} className="proj-notes-chip proj-notes-shared"
          onClick={() => {
            up(p => ({ ...p, activeTab: NOTES_ID }));
            setOpenSharedNote({ ownerUid: n._ownerUid, noteId: n.id, teamId: n._teamId, permission: n._permission });
            setActiveNote(null);
          }}>
          <span className="proj-notes-chip-author">{nick}</span>
          <span className="proj-notes-chip-perm">{n._permission === 'view' ? '👁' : '✏️'}</span>
          {n.title || '…'}
        </button>
      );
    })}
  </div>
)}
```

Note titles are denormalized into the registry doc at share time for display in chips and list items.

- [ ] **Step 3: Add CSS for shared note chips**

```css
.proj-notes-shared {
  border-style: dashed;
}
.proj-notes-chip-author {
  font-size: 10px;
  opacity: 0.6;
  margin-right: 3px;
}
.proj-notes-chip-perm {
  font-size: 10px;
  margin-right: 2px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: show shared notes in team project notes bar"
```

---

## Task 9: Shared Note Viewer/Editor in Notes Tab

**Files:**
- Modify: `src/App.jsx` (notes editor section, ~line 2690)
- Modify: `src/styles.css`

- [ ] **Step 1: Add shared note save handler**

Near the existing note state hooks, add a separate ref:

```javascript
const sharedNoteSaveRef = useRef(null);
```

Near the existing `saveNote` function, add:

```javascript
const saveSharedNote = useCallback((ownerUid, noteId, title, content) => {
  if (sharedNoteSaveRef.current) clearTimeout(sharedNoteSaveRef.current);
  sharedNoteSaveRef.current = setTimeout(() => {
    const { tags, links } = extractTagsAndLinks(content);
    updateSharedNote({ ownerUid, noteId, patch: { title, content, tags, links } })
      .catch(e => console.warn('Shared note save failed:', e));
  }, 800);
}, []);
```

- [ ] **Step 2: Render shared note editor when `openSharedNote` is set**

In the notes container (line 2690), after `{!activeNote ? (` and before the notes list, add a check for `openSharedNote`:

```jsx
{isNotes ? (
  <>
  <div className="notes-container">
    {openSharedNote ? (
      /* ─── Shared Note View ─── */
      <div className="notes-editor-view">
        <div className="notes-editor-toolbar">
          <button className="notes-back-btn" onClick={() => setOpenSharedNote(null)}>← Back</button>
          {sharedNoteContent && (
            <input className="notes-title-input"
              value={sharedNoteContent.title || ''}
              readOnly={openSharedNote.permission !== 'edit'}
              placeholder="Note title"
              onChange={e => {
                if (openSharedNote.permission !== 'edit') return;
                const title = e.target.value;
                setSharedNoteContent(prev => prev ? { ...prev, title } : prev);
                saveSharedNote(openSharedNote.ownerUid, openSharedNote.noteId, title, sharedNoteContent.content);
              }}
            />
          )}
        </div>
        {(() => {
          const teamProj = teamProjDirect[openSharedNote.teamId];
          const nick = teamProj?.nicknames?.[openSharedNote.ownerUid] || 'teammate';
          const avId = teamProj?.avatars?.[openSharedNote.ownerUid];
          return (
            <div className="shared-note-banner">
              {avId !== undefined && avId !== null && AVATARS[avId] && (
                <img src={AVATARS[avId].src} alt="" className="shared-note-avatar" />
              )}
              <span>Shared by <b>{nick}</b> — {openSharedNote.permission === 'edit' ? 'you can edit' : 'view only'}</span>
            </div>
          );
        })()}
        {!sharedNoteContent ? (
          <div className="notes-empty"><span>Loading...</span></div>
        ) : openSharedNote.permission === 'edit' ? (
          <>
            <div className="notes-view-tabs">
              <button className={`notes-view-tab ${noteView === 'edit' ? 'on' : ''}`} onClick={() => setNoteView('edit')}>Edit</button>
              <button className={`notes-view-tab ${noteView === 'preview' ? 'on' : ''}`} onClick={() => setNoteView('preview')}>Preview</button>
            </div>
            {noteView === 'edit' ? (
              <textarea className="notes-textarea"
                value={sharedNoteContent.content}
                onChange={e => {
                  const content = e.target.value;
                  setSharedNoteContent(prev => prev ? { ...prev, content } : prev);
                  saveSharedNote(openSharedNote.ownerUid, openSharedNote.noteId, sharedNoteContent.title, content);
                }}
              />
            ) : (
              <div className="notes-preview" dangerouslySetInnerHTML={{ __html: parseMarkdown(sharedNoteContent.content || '') }} />
            )}
          </>
        ) : (
          <div className="notes-preview" dangerouslySetInnerHTML={{ __html: parseMarkdown(sharedNoteContent.content || '') }} />
        )}
      </div>
    ) : !activeNote ? (
      /* ─── Notes List View ─── */
      // ... existing list view code ...
```

- [ ] **Step 3: Add shared notes section in list view**

At the bottom of the notes list (after `filteredNotes.map`, before the closing `</div>` of `notes-list-view`), add a section for shared notes from others:

```jsx
{/* Shared notes from team members */}
{(() => {
  const myUid = syncStatus?.user?.uid;
  const teamProjects = projects.filter(p => p.isTeam && p.teamId);
  const sharedSections = teamProjects
    .map(tp => {
      const entries = (sharedNotesMap[tp.teamId] || []).filter(e => e.ownerUid !== myUid);
      if (!entries.length) return null;
      return { project: tp, entries };
    })
    .filter(Boolean);

  if (!sharedSections.length) return null;

  return sharedSections.map(({ project: tp, entries }) => {
    const teamProj = teamProjDirect[tp.teamId];
    return (
      <div key={tp.teamId} className="shared-notes-section">
        <div className="shared-notes-header" style={{ color: tp.color }}>
          👥 Shared with {tp.name}
        </div>
        {entries.map(e => {
          const nick = teamProj?.nicknames?.[e.ownerUid] || 'teammate';
          return (
            <div key={e.noteId} className="notes-item shared-note-item" onClick={() => {
              setOpenSharedNote({ ownerUid: e.ownerUid, noteId: e.noteId, teamId: tp.teamId, permission: e.permission });
              setActiveNote(null);
            }}>
              <div className="notes-item-left">
                <div className="notes-item-info">
                  <span className="notes-item-title">
                    <span className="shared-note-author">{nick}</span>
                    {e.permission === 'view' ? '👁' : '✏️'}
                    {' '}{e.title || 'Untitled'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  });
})()}
```

- [ ] **Step 4: Add CSS for shared note viewer**

```css
.shared-note-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-secondary, #888);
  background: var(--bg-secondary, rgba(255,255,255,0.03));
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
}
.shared-note-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
.shared-notes-section {
  margin-top: 12px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.06));
  padding-top: 8px;
}
.shared-notes-header {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  opacity: 0.7;
}
.shared-note-item {
  border-left: 2px dashed var(--border, rgba(255,255,255,0.1));
}
.shared-note-author {
  font-size: 11px;
  opacity: 0.6;
  margin-right: 4px;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: add shared note viewer/editor and shared notes section in list"
```

---

## Task 10: Wikilink Handling for Shared Notes

**Files:**
- Modify: `src/App.jsx` (wikilink click handler in notes preview)

- [ ] **Step 1: Add toast state and wikilink handler**

Add state for the private note toast:

```javascript
const [privateNoteToast, setPrivateNoteToast] = useState(false);
```

Then add the wikilink click handler for shared notes:

```javascript
// In the shared note preview click handler
const handleSharedNoteWikilinkClick = useCallback((e) => {
  const wl = e.target.closest('[data-wikilink]');
  if (!wl) return;
  const linkTitle = wl.getAttribute('data-wikilink');

  // Check if linked note is also shared with this team
  if (openSharedNote) {
    const teamEntries = sharedNotesMap[openSharedNote.teamId] || [];
    // Look in own notes first
    const ownNote = notesList.find(n => n.title === linkTitle);
    if (ownNote) {
      setOpenSharedNote(null);
      handleNoteClick(ownNote.id);
      return;
    }
    // Check if any shared note has this title (we'd need content for this)
    // For now, show "private" toast since we don't have titles for all shared notes
    // This is a known limitation — can be improved by denormalizing titles to registry
  }

  // Show private note toast via React state
  setPrivateNoteToast(true);
  setTimeout(() => setPrivateNoteToast(false), 2000);
}, [openSharedNote, sharedNotesMap, notesList]);
```

- [ ] **Step 2: Add the click handler to shared note preview divs**

On both the view-only and edit-mode preview divs for shared notes, add:

```jsx
<div className="notes-preview"
  onClick={handleSharedNoteWikilinkClick}
  dangerouslySetInnerHTML={{ __html: parseMarkdown(sharedNoteContent.content || '') }}
/>
```

- [ ] **Step 3: Add toast rendering and CSS**

Render the toast somewhere near the end of the `<main>` element in JSX:

```jsx
{privateNoteToast && (
  <div className="notes-private-toast">This note is private</div>
)}
```

Add CSS:

```css
.notes-private-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elevated, #333);
  color: var(--text-primary, #fff);
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 9999;
  animation: toastFade 2s ease-in-out;
  pointer-events: none;
}
@keyframes toastFade {
  0%, 70% { opacity: 1; }
  100% { opacity: 0; }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/styles.css
git commit -m "feat: handle wikilinks in shared notes with privacy gating"
```

---

## Task 11: Notes List — Show Team Project Badges

**Files:**
- Modify: `src/App.jsx:2736-2741` (note list item project badges)

- [ ] **Step 1: Update note list item to show team project badges**

Currently (line 2738), team projects are filtered out with `!p.isTeam`. Update to include them:

```javascript
{(() => {
  const ids = note.projectIds?.length ? note.projectIds : (note.projectId ? [note.projectId] : []);
  const linked = ids.map(id => {
    const personal = projects.find(p => p.id === id && !p.isTeam);
    if (personal) return personal;
    const team = projects.find(p => p.isTeam && p.teamId === id);
    if (team) return { ...team, id: team.teamId, color: team.color, name: team.name, isTeam: true };
    return null;
  }).filter(Boolean);
  return linked.length ? linked.map(lp => (
    <span key={lp.id} className="notes-item-proj" style={{ color: lp.color, borderColor: lp.color + '44' }}>
      {lp.isTeam && '👥 '}{lp.name}
    </span>
  )) : null;
})()}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: show team project badges on notes in list view"
```

---

## Task 12: Version Bump and Final Commit

**Files:**
- Modify: `package.json`, `public/version.json`, `src-tauri/tauri.conf.json`, `src/App.jsx`

- [ ] **Step 1: Bump version**

```bash
cd /d/taskpad-app && bash scripts/bump-version.sh 1.11.0
```

This is a significant feature addition — minor version bump.

- [ ] **Step 2: Commit version bump**

```bash
git add package.json public/version.json src-tauri/tauri.conf.json src/App.jsx
git commit -m "1.11.0 - Shared notes for team projects"
```

---

## Task 13: Manual Testing Checklist

These are not automated tests — verify manually in the dev environment (`npm run dev`):

- [ ] **Author: Link a note to a team project** — "+ Project" shows team projects with 👥 icon
- [ ] **Author: Cycle sharing states** — Click lock/eye/pencil icon on team badge, verify it cycles Private → View → Edit → Private
- [ ] **Author: Unlink auto-unshares** — Click × on a shared team badge, verify note becomes private
- [ ] **Team member: See shared notes** — Log in as another team member, view the team project, verify shared note chips appear in the notes bar with author name
- [ ] **Team member: Open view-only note** — Click shared note, verify banner says "view only", content is not editable
- [ ] **Team member: Open editable note** — Author sets to "edit", team member can edit and changes sync in real-time
- [ ] **Author deletes shared note** — Delete the note, verify it disappears from team member's view
- [ ] **Wikilinks** — In a shared note, click a wikilink to a private note, verify "This note is private" toast appears
- [ ] **Deploy Firestore rules** — Deploy the updated `firestore.rules` before testing with real Firebase
