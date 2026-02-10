import { db, subscribeAuth, isFirebaseConfigured } from './firebase';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  addDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  orderBy,
  writeBatch,
} from 'firebase/firestore';

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

let unsubscribeUserDoc = null;
let unsubscribeAuth = null;
let userId = null;
let userEmail = null;

// Team listeners
let unsubInvites = null;
let unsubTeamProjects = null;
let teamTasksUnsubs = new Map();

const cleanTeamListeners = () => {
  if (unsubInvites) { unsubInvites(); unsubInvites = null; }
  if (unsubTeamProjects) { unsubTeamProjects(); unsubTeamProjects = null; }
  for (const u of teamTasksUnsubs.values()) u();
  teamTasksUnsubs = new Map();
};

export const getAuthUser = () => (userId ? { uid: userId, email: userEmail } : null);

export const initSync = (onDataUpdate, onSyncStatus, onInvitesUpdate, onTeamProjectsUpdate) => {
  onDataUpdate(loadLocal());

  if (!isFirebaseConfigured()) {
    onSyncStatus?.({ signedIn: false, user: null });
    return;
  }

  unsubscribeAuth = subscribeAuth((user) => {
    userId = user?.uid || null;
    userEmail = user?.email || null;

    onSyncStatus?.({ signedIn: !!userId, user: userId ? { uid: userId, email: userEmail } : null });

    cleanTeamListeners();

    if (unsubscribeUserDoc) {
      unsubscribeUserDoc();
      unsubscribeUserDoc = null;
    }

    if (!userId) return;

    const docRef = doc(db, 'users', userId);
    unsubscribeUserDoc = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data().taskpad;
          if (data) {
            saveLocal(data);
            onDataUpdate(data);
          }
        } else {
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

    // Invites for this email
    if (userEmail && onInvitesUpdate) {
      const invQ = query(
        collection(db, 'invites'),
        where('toEmail', '==', userEmail),
        where('status', '==', 'pending')
      );
      unsubInvites = onSnapshot(invQ, (snap) => {
        const invites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        onInvitesUpdate(invites);
      }, (e) => {
        console.warn('Invites listener error:', e);
        onInvitesUpdate([]);
      });
    }

    // Team projects where I'm a member
    if (onTeamProjectsUpdate) {
      const projQ = query(
        collection(db, 'projects'),
        where('memberUids', 'array-contains', userId)
      );
      unsubTeamProjects = onSnapshot(projQ, (snap) => {
        const projects = snap.docs.map(d => ({ teamId: d.id, ...d.data() }));
        onTeamProjectsUpdate(projects);
      }, (e) => {
        console.warn('Team projects listener error:', e);
        onTeamProjectsUpdate([]);
      });
    }
  });
};

export const saveToCloud = async (data) => {
  saveLocal(data);
  if (!isFirebaseConfigured() || !userId) return;

  try {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, { taskpad: data }, { merge: true });
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
};

export const cleanup = () => {
  if (unsubscribeUserDoc) unsubscribeUserDoc();
  if (unsubscribeAuth) unsubscribeAuth();
  cleanTeamListeners();
};

// ─── Team Projects ────────────────────────────────────────────────────────────

export const createTeamProject = async ({ name, color }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in to create team projects');

  const payload = {
    name: (name || 'Team Project').trim(),
    color: color || '#38bdf8',
    ownerUid: userId,
    memberUids: [userId],
    memberEmails: userEmail ? [userEmail] : [],
    nicknames: userEmail ? { [userId]: userEmail.split('@')[0] } : { [userId]: 'me' },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'projects'), payload);
  return ref.id;
};

export const sendTeamInvite = async ({ teamId, toEmail }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in to invite');

  const email = (toEmail || '').trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Valid email required');

  await addDoc(collection(db, 'invites'), {
    projectId: teamId,
    fromUid: userId,
    fromEmail: userEmail || null,
    toEmail: email,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
};

export const acceptTeamInvite = async ({ inviteId }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in to accept invites');

  const invRef = doc(db, 'invites', inviteId);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) throw new Error('Invite not found');

  const inv = invSnap.data();
  if (inv.toEmail && userEmail && inv.toEmail.toLowerCase() !== userEmail.toLowerCase())
    throw new Error('Invite does not match this account');

  const projRef = doc(db, 'projects', inv.projectId);
  const projSnap = await getDoc(projRef);
  if (!projSnap.exists()) throw new Error('Project not found');

  const patch = {
    memberUids: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  };
  if (userEmail) patch.memberEmails = arrayUnion(userEmail);
  patch[`nicknames.${userId}`] = userEmail ? userEmail.split('@')[0] : 'me';

  await updateDoc(projRef, patch);
  await updateDoc(invRef, { status: 'accepted', acceptedAt: serverTimestamp() });

  // Add a tab reference in user's taskpad doc
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? (userSnap.data().taskpad || null) : null;
  const local = existing || loadLocal();

  const tabId = `t_${inv.projectId}`;
  const already = Array.isArray(local.projects) && local.projects.some(p => p.id === tabId);

  if (!already) {
    const proj = projSnap.data();
    const next = {
      ...local,
      projects: [
        ...(local.projects || []),
        {
          id: tabId,
          name: proj?.name || 'Team Project',
          color: proj?.color || '#38bdf8',
          keywords: [],
          isTeam: true,
          teamId: inv.projectId,
        }
      ],
    };
    await setDoc(userRef, { taskpad: next }, { merge: true });
    saveLocal(next);
  }
};

export const declineTeamInvite = async ({ inviteId }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in to decline invites');
  await updateDoc(doc(db, 'invites', inviteId), { status: 'declined', declinedAt: serverTimestamp() });
};

export const subscribeTeamTasks = (teamId, cb) => {
  if (!isFirebaseConfigured() || !userId) {
    cb([]);
    return () => {};
  }

  if (teamTasksUnsubs.has(teamId)) {
    teamTasksUnsubs.get(teamId)();
    teamTasksUnsubs.delete(teamId);
  }

  const qy = query(
    collection(db, 'projects', teamId, 'tasks'),
    where('deleted', '==', false),
    orderBy('order', 'asc')
  );

  const unsub = onSnapshot(qy, (snap) => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(tasks);
  }, (e) => {
    console.warn('Team tasks listener error:', e);
    cb([]);
  });

  teamTasksUnsubs.set(teamId, unsub);

  return () => {
    if (teamTasksUnsubs.get(teamId) === unsub) {
      unsub();
      teamTasksUnsubs.delete(teamId);
    }
  };
};

export const createTeamTask = async ({ teamId, text, afterOrder }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in to add team tasks');
  const order = typeof afterOrder === 'number' ? afterOrder + 1 : Date.now();

  const ref = await addDoc(collection(db, 'projects', teamId, 'tasks'), {
    text: (text || '').trim(),
    done: false,
    deleted: false,
    createdByUid: userId,
    createdByEmail: userEmail || null,
    ts: serverTimestamp(),
    order,
  });

  return ref.id;
};

export const updateTeamTask = async ({ teamId, taskId, patch }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  await updateDoc(doc(db, 'projects', teamId, 'tasks', taskId), { ...patch, updatedAt: serverTimestamp() });
};

export const deleteTeamTask = async ({ teamId, taskId }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  await updateDoc(doc(db, 'projects', teamId, 'tasks', taskId), { deleted: true, deletedAt: serverTimestamp() });
};

export const reorderTeamTasks = async ({ teamId, orderedTasks }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  const batch = writeBatch(db);
  orderedTasks.forEach((t, idx) => {
    batch.update(doc(db, 'projects', teamId, 'tasks', t.id), { order: idx });
  });
  await batch.commit();
};

export const updateTeamProject = async ({ teamId, patch }) => {
  if (!isFirebaseConfigured() || !userId) throw new Error('Sign in');
  await updateDoc(doc(db, 'projects', teamId), { ...patch, updatedAt: serverTimestamp() });
};
