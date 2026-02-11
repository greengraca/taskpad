import { useState, useEffect, useRef, useCallback } from 'react';
import { initSync, saveToCloud, cleanup, getAuthUser,
  createTeamProject, sendTeamInvite, acceptTeamInvite, declineTeamInvite,
  subscribeTeamTasks, createTeamTask, updateTeamTask, deleteTeamTask, reorderTeamTasks, updateTeamProject
} from './sync';
import { isFirebaseConfigured, signInEmail, signUpEmail, signOutUser } from './firebase';
import { checkForUpdates } from './updater';

const DEFAULT_SHORTCUTS = [
  { id: 'vc', name: 'Vercel', url: 'https://vercel.com/dashboard', icon: 'https://www.google.com/s2/favicons?domain=vercel.com&sz=64', color: '#fff' },
  { id: 'gh', name: 'GitHub', url: 'https://github.com', icon: '/shortcuts/github.svg', color: '#e6edf3' },
  { id: 'nf', name: 'Netlify', url: 'https://app.netlify.com', icon: 'https://www.google.com/s2/favicons?domain=netlify.com&sz=64', color: '#32e6e2' },
  { id: 'gm', name: 'Gmail', url: 'https://mail.google.com', icon: '/shortcuts/gmail.svg', color: '#ea4335' },
  { id: 'jg', name: 'Portfolio', url: 'https://www.joaograca.work/', icon: '/shortcuts/portfolio.png', color: '#7eb8da' },
  { id: 'fb', name: 'Firebase', url: 'https://console.firebase.google.com/', icon: '/shortcuts/firebase.svg', color: '#fbbf24' },
  { id: 'ae', name: 'AliExpress', url: 'https://www.aliexpress.com', icon: 'https://www.google.com/s2/favicons?domain=aliexpress.com&sz=64', color: '#e43225' },
  { id: 'et', name: 'Etsy', url: 'https://www.etsy.com/your/shops/me/dashboard', icon: 'https://www.google.com/s2/favicons?domain=etsy.com&sz=64', color: '#f1641e' },
  { id: 'db', name: 'MongoDB', url: 'https://cloud.mongodb.com/', icon: 'https://www.google.com/s2/favicons?domain=mongodb.com&sz=64', color: '#00ed64' },
  { id: 'ai', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64', color: '#10a37f' },
  { id: 'cl', name: 'Claude', url: 'https://claude.ai', icon: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=64', color: '#d4a574' },
  { id: 'li', name: 'LinkedIn', url: 'https://www.linkedin.com', icon: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=64', color: '#0a66c2' },
  { id: 'hk', name: 'Heroku', url: 'https://dashboard.heroku.com', icon: 'https://www.google.com/s2/favicons?domain=heroku.com&sz=64', color: '#9e7cc1' },
  { id: 'sf', name: 'Scryfall', url: 'https://scryfall.com', icon: 'https://www.google.com/s2/favicons?domain=scryfall.com&sz=64', color: '#e0a526' },
  { id: 'cm', name: 'Cardmarket', url: 'https://www.cardmarket.com', icon: 'https://www.google.com/s2/favicons?domain=cardmarket.com&sz=64', color: '#1a82c4' },
  { id: 'yt', name: 'YouTube', url: 'https://www.youtube.com', icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64', color: '#ff0000' },
];

const TAB_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#f472b6', '#fb923c', '#ffe66d', '#4ecdc4', '#ff6b6b', '#22c55e', '#60a5fa', '#f59e0b', '#14b8a6'];
const INBOX_ID = '__inbox__';
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const EMPTY = [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_DATA = {
  projects: [{ id: 'p1', name: 'Sample', color: '#4ecdc4', keywords: ['sample'] }],
  tasks: [
    { id: 'w1', text: 'Drag me by the grip on the left ⠿', done: false, projectId: INBOX_ID, origin: 'inbox', ts: Date.now() },
    { id: 'w2', text: 'Click between tasks to insert new ones', done: false, projectId: INBOX_ID, origin: 'inbox', ts: Date.now() },
    { id: 'w3', text: 'Hold a shortcut icon ~0.6s to unlock drag mode', done: false, projectId: INBOX_ID, origin: 'inbox', ts: Date.now() },
  ],
  shortcuts: DEFAULT_SHORTCUTS,
  scOrder: DEFAULT_SHORTCUTS.map(s => s.id),
  showSc: true,
  activeTab: INBOX_ID,
};

// ─── Vertical drag reorder ───
function useDragReorder(items, onReorder) {
  const [dragState, setDragState] = useState(null);
  const [order, setOrder] = useState(null);
  const itemRefs = useRef({});
  const containerRef = useRef(null);
  const heightsRef = useRef([]);

  const onPointerDown = useCallback((e, id) => {
    if (e.button && e.button !== 0) return;
    const idx = items.findIndex(it => it.id === id);
    heightsRef.current = items.map(item => { const el = itemRefs.current[item.id]; return el ? el.getBoundingClientRect().height + 4 : 44; });
    const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    setDragState({ id, startY: y, currentY: y, startIdx: idx });
    setOrder(items.map((_, i) => i));
    e.preventDefault();
  }, [items]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
      setDragState(prev => {
        if (!prev) return prev;
        const delta = y - prev.startY; const heights = heightsRef.current;
        let slots = 0, acc = 0;
        if (delta > 0) { for (let i = prev.startIdx + 1; i < items.length; i++) { acc += heights[i]; if (delta > acc - heights[i] / 2) slots++; else break; } }
        else { for (let i = prev.startIdx - 1; i >= 0; i--) { acc += heights[i]; if (-delta > acc - heights[i] / 2) slots++; else break; } slots = -slots; }
        const newIdx = Math.max(0, Math.min(items.length - 1, prev.startIdx + slots));
        const newOrder = items.map((_, i) => i); const [removed] = newOrder.splice(prev.startIdx, 1); newOrder.splice(newIdx, 0, removed);
        setOrder(newOrder); return { ...prev, currentY: y };
      });
    };
    const onUp = () => { setOrder(prev => { if (prev) onReorder(prev.map(i => items[i])); return null; }); setDragState(null); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [dragState, items, onReorder]);

  const getStyle = useCallback((id) => {
    if (!dragState || !order) return {};
    const origIdx = items.findIndex(it => it.id === id); const newIdx = order.indexOf(origIdx); const heights = heightsRef.current;
    if (id === dragState.id) return { transform: `translateY(${dragState.currentY - dragState.startY}px) scale(1.02)`, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', transition: 'box-shadow 0.2s, transform 0s', position: 'relative', opacity: 0.95 };
    const origPos = heights.slice(0, origIdx).reduce((a, b) => a + b, 0);
    const newPos = order.slice(0, newIdx).reduce((a, i) => a + heights[i], 0);
    return { transform: `translateY(${newPos - origPos}px)`, transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)', position: 'relative', zIndex: 1 };
  }, [dragState, order, items]);

  return { containerRef, itemRefs, onPointerDown, getStyle, isDragging: !!dragState };
}

// ─── Horizontal drag reorder ───
function useHDragReorder(items, onReorder) {
  const [dragState, setDragState] = useState(null);
  const [order, setOrder] = useState(null);
  const itemRefs = useRef({});
  const widthsRef = useRef([]);

  const onPointerDown = useCallback((e, id, forcedX) => {
    if (e?.button && e.button !== 0) return;
    const idx = items.findIndex(it => it.id === id);
    widthsRef.current = items.map(item => { const el = itemRefs.current[item.id]; return el ? el.getBoundingClientRect().width + 8 : 44; });
    const x = forcedX ?? e?.clientX ?? e?.touches?.[0]?.clientX ?? 0;
    setDragState({ id, startX: x, currentX: x, startIdx: idx }); setOrder(items.map((_, i) => i));
    e?.preventDefault?.(); e?.stopPropagation?.();
  }, [items]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
      setDragState(prev => {
        if (!prev) return prev;
        const delta = x - prev.startX; const widths = widthsRef.current;
        let slots = 0, acc = 0;
        if (delta > 0) { for (let i = prev.startIdx + 1; i < items.length; i++) { acc += widths[i]; if (delta > acc - widths[i] / 2) slots++; else break; } }
        else { for (let i = prev.startIdx - 1; i >= 0; i--) { acc += widths[i]; if (-delta > acc - widths[i] / 2) slots++; else break; } slots = -slots; }
        const newIdx = Math.max(0, Math.min(items.length - 1, prev.startIdx + slots));
        const newOrder = items.map((_, i) => i); const [removed] = newOrder.splice(prev.startIdx, 1); newOrder.splice(newIdx, 0, removed);
        setOrder(newOrder); return { ...prev, currentX: x };
      });
    };
    const onUp = () => { setOrder(prev => { if (prev) onReorder(prev.map(i => items[i])); return null; }); setDragState(null); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false }); window.addEventListener('touchend', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onUp); };
  }, [dragState, items, onReorder]);

  const getStyle = useCallback((id) => {
    if (!dragState || !order) return {};
    const origIdx = items.findIndex(it => it.id === id); const newIdx = order.indexOf(origIdx); const widths = widthsRef.current;
    if (id === dragState.id) return { transform: `translateX(${dragState.currentX - dragState.startX}px) scale(1.15)`, zIndex: 100, transition: 'transform 0s', position: 'relative', filter: 'brightness(1.2)' };
    const origPos = widths.slice(0, origIdx).reduce((a, b) => a + b, 0);
    const newPos = order.slice(0, newIdx).reduce((a, i) => a + widths[i], 0);
    return { transform: `translateX(${newPos - origPos}px)`, transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)', position: 'relative', zIndex: 1 };
  }, [dragState, order, items]);

  return { itemRefs, onPointerDown, getStyle, isDragging: !!dragState };
}

// ─── Shortcut Icon (ring after 120ms hold) ───
function ShortcutIcon({ shortcut, unlocked, onUnlock, onDragStart, style, refCb }) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [showRing, setShowRing] = useState(false);
  const animRef = useRef(null);
  const thresholdRef = useRef(null);
  const isDownRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const trackPos = (e) => {
    const x = e?.clientX ?? e?.touches?.[0]?.clientX ?? 0;
    const y = e?.clientY ?? e?.touches?.[0]?.clientY ?? 0;
    lastPosRef.current = { x, y };
  };

  const startHold = (e) => {
    isDownRef.current = true; trackPos(e);
    if (unlocked) { onDragStart(e, lastPosRef.current.x); return; }
    const start = Date.now();
    thresholdRef.current = setTimeout(() => {
      setShowRing(true);
      const tick = () => {
        const pct = Math.min((Date.now() - start) / 600, 1);
        setHoldProgress(pct);
        if (pct >= 1) {
          onUnlock(); setShowRing(false); setHoldProgress(0);
          if (isDownRef.current) {
            const fakeEvt = { button: 0, clientX: lastPosRef.current.x, touches: [{ clientX: lastPosRef.current.x }], preventDefault() {}, stopPropagation() {} };
            onDragStart(fakeEvt, lastPosRef.current.x);
          }
          return;
        }
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
    }, 120);
  };
  const cancelHold = () => {
    isDownRef.current = false;
    if (thresholdRef.current) clearTimeout(thresholdRef.current);
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setShowRing(false); setHoldProgress(0);
  };
  const circ = 2 * Math.PI * 15;

  return (
    <div className="sc-wrap" ref={refCb} style={style}
      onMouseDown={startHold} onMouseMove={trackPos} onMouseUp={cancelHold} onMouseLeave={!unlocked ? cancelHold : undefined}
      onTouchStart={startHold} onTouchMove={trackPos} onTouchEnd={cancelHold}>
      {(showRing || unlocked) && (
        <svg width="36" height="36" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}>
          <circle cx="18" cy="18" r="15" fill="none" stroke={unlocked ? shortcut.color : '#555'} strokeWidth="2"
            strokeDasharray={circ} strokeDashoffset={unlocked ? 0 : circ * (1 - holdProgress)}
            strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }} />
        </svg>
      )}
      <a href={unlocked ? undefined : shortcut.url} target={unlocked ? undefined : '_blank'} rel="noopener noreferrer"
        onClick={e => { if (unlocked || showRing) e.preventDefault(); }} onMouseDown={e => { if (unlocked) e.preventDefault(); }}
        className="sc-icon" title={shortcut.name} style={{ cursor: unlocked ? 'grab' : 'pointer' }}>
        <img src={shortcut.icon} alt="" width="18" height="18" draggable={false}
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
        <span className="sc-fb" style={{ display: 'none', color: shortcut.color }}>{shortcut.name[0]}</span>
      </a>
    </div>
  );
}

// ─── Task Line ───
function TaskLine({ task, allProjects, accentColor, isInbox, isTeam, nicknames, onToggle, onDelete, onChange, onHide, dragHandle, style, refCb }) {
  const [editing, setEditing] = useState(task._new || false);
  const [text, setText] = useState(task.text);
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); if (!task._new) inputRef.current.select(); } }, [editing]);
  useEffect(() => { setText(task.text); }, [task.text]);
  useEffect(() => {
    if (!editing || !inputRef.current) return;
    const el = inputRef.current;
    el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`;
  }, [editing, text]);
  const commit = () => { const t = text.trim(); if (!t && task._new) { onDelete(task.id); return; } if (!t) { setEditing(false); setText(task.text); return; } onChange(task.id, t); setEditing(false); };
  const projLabel = isInbox && task.projectId && task.projectId !== INBOX_ID ? allProjects.find(p => p.id === task.projectId) : null;

  const authorNick = isTeam && nicknames && (task.createdByUid || task.createdByEmail)
    ? (nicknames[task.createdByUid] || task.createdByEmail?.split('@')[0] || null)
    : null;

  const insertBullet = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      const el = e.target; const start = el.selectionStart ?? text.length; const end = el.selectionEnd ?? text.length;
      const bullet = `\n- `; const next = text.slice(0, start) + bullet + text.slice(end);
      setText(next);
      requestAnimationFrame(() => { try { const pos = start + bullet.length; el.selectionStart = el.selectionEnd = pos; } catch {} });
      return true;
    }
    return false;
  };

  const canHide = isInbox && task.projectId !== INBOX_ID && onHide;

  return (
    <div className={`task-row ${task.done ? 'task-done' : ''}`} ref={refCb} style={{ ...style, borderLeftColor: task.done ? '#252525' : accentColor }}>
      <div className="drag-grip" onMouseDown={dragHandle} onTouchStart={dragHandle}>⠿</div>
      <button onClick={() => onToggle(task.id)} className="checkbox">
        <div className="cb-inner" style={{ background: task.done ? accentColor : 'transparent', borderColor: task.done ? accentColor : '#555' }}>
          {task.done && <span className="chk">✓</span>}
        </div>
      </button>
      <div className="task-body" onClick={() => !editing && setEditing(true)}>
        {editing ? (
          <textarea ref={inputRef} className="task-input" rows={1} value={text} onChange={e => setText(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (insertBullet(e)) return; if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditing(false); setText(task.text); } }} />
        ) : (
          <span className="task-text" style={{ whiteSpace: 'pre-wrap' }}>{task.text}</span>
        )}
        {projLabel && <span className="task-tag" style={{ color: projLabel.color, borderColor: projLabel.color + '44' }}>{projLabel.name}</span>}
        {authorNick && <span className="task-author">{authorNick}</span>}
      </div>
      {canHide && (
        <button onClick={() => onHide(task.id)} className="hide-btn" title="Hide from inbox">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        </button>
      )}
      <button onClick={() => onDelete(task.id)} className="del-btn">×</button>
    </div>
  );
}

function InsertZone({ onClick, color }) {
  const [hov, setHov] = useState(false);
  return (
    <div className="ins-zone" onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}>
      <div className="ins-line" style={{ opacity: hov ? 1 : 0, background: color + '40' }}>
        <span className="ins-plus" style={{ color, borderColor: color + '55' }}>+</span>
      </div>
    </div>
  );
}

// ─── Main ───
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingTab, setEditingTab] = useState(null);
  const [editTabName, setEditTabName] = useState('');
  const [scUnlocked, setScUnlocked] = useState(false);
  const editTabRef = useRef(null);
  const saveRef = useRef(null);
  const undoStackRef = useRef([]);
  const newTeamTaskIds = useRef(new Set());

  // Shortcuts modal
  const [scOpen, setScOpen] = useState(false);
  const [scDraft, setScDraft] = useState({ id: null, name: '', url: '', icon: '', color: '#888' });
  const [scErr, setScErr] = useState('');

  // Update popup
  const [updateInfo, setUpdateInfo] = useState(null);

  // Team state
  const [invites, setInvites] = useState([]);
  const [teamProjects, setTeamProjects] = useState([]);
  const [teamTasksMap, setTeamTasksMap] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamErr, setTeamErr] = useState('');
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [nickEditUid, setNickEditUid] = useState(null);
  const [nickEditVal, setNickEditVal] = useState('');

  const projects = data?.projects || EMPTY;
  const tasks = data?.tasks || EMPTY;
  const activeTab = data?.activeTab || INBOX_ID;
  const isInbox = activeTab === INBOX_ID;
  const activeProj = projects.find(p => p.id === activeTab);
  const isTeamTab = !!(activeProj?.isTeam && activeProj?.teamId);
  const teamId = activeProj?.teamId;
  const teamProjData = isTeamTab ? teamProjects.find(tp => tp.teamId === teamId) : null;

  // Inbox: tasks that originated from inbox, unless hidden
  const inboxVisible = tasks.filter(t => {
    const origin = t.origin || (t.projectId === INBOX_ID ? 'inbox' : 'project');
    return origin === 'inbox' && !t.hiddenFromInbox;
  });

  let visible;
  if (isInbox) {
    visible = inboxVisible;
  } else if (isTeamTab) {
    visible = teamTasksMap[teamId] || EMPTY;
  } else {
    visible = tasks.filter(t => t.projectId === activeTab);
  }

  // Sort: active tasks first, done tasks at bottom
  const sortedVisible = [...visible].sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? 1 : -1;
  });

  const accent = isInbox ? '#38bdf8' : (activeProj?.color || '#38bdf8');

  const shortcuts = data?.shortcuts?.length ? data.shortcuts : DEFAULT_SHORTCUTS;
  const scIds = (data?.scOrder?.length ? data.scOrder : shortcuts.map(s => s.id));
  const orderedSc = scIds.map(id => shortcuts.find(s => s.id === id)).filter(Boolean);

  const up = useCallback((fn) => {
    setData(prev => {
      const next = fn(prev);
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => saveToCloud(next), 400);
      return next;
    });
  }, []);

  const reorderVisible = useCallback((newVis) => {
    up(prev => {
      if (!prev) return prev;
      if (prev.activeTab === INBOX_ID) {
        const inboxIds = new Set(newVis.map(t => t.id));
        const otherTasks = prev.tasks.filter(t => !inboxIds.has(t.id));
        const firstInboxIdx = prev.tasks.findIndex(t => {
          const origin = t.origin || (t.projectId === INBOX_ID ? 'inbox' : 'project');
          return origin === 'inbox' && !t.hiddenFromInbox;
        });
        const result = [...otherTasks];
        result.splice(Math.max(0, firstInboxIdx), 0, ...newVis);
        return { ...prev, tasks: result };
      }
      const at = prev.activeTab;
      const others = prev.tasks.filter(t => t.projectId !== at);
      const firstIdx = prev.tasks.findIndex(t => t.projectId === at);
      const result = [...others]; result.splice(Math.max(0, firstIdx), 0, ...newVis);
      return { ...prev, tasks: result };
    });
  }, [up]);

  const reorderTeamVisible = useCallback((newVis) => {
    if (!teamId) return;
    setTeamTasksMap(prev => ({ ...prev, [teamId]: newVis }));
    reorderTeamTasks({ teamId, orderedTasks: newVis }).catch(e => console.warn('Reorder failed:', e));
  }, [teamId]);

  const reorderSc = useCallback((newSc) => up(p => p ? { ...p, scOrder: newSc.map(s => s.id) } : p), [up]);

  const effectiveReorder = isTeamTab ? reorderTeamVisible : reorderVisible;
  const { containerRef, itemRefs: taskRefs, onPointerDown: onTaskDrag, getStyle: getTaskStyle, isDragging: isTaskDragging } = useDragReorder(sortedVisible, effectiveReorder);
  const { itemRefs: scRefs, onPointerDown: onScDrag, getStyle: getScStyle } = useHDragReorder(orderedSc, reorderSc);

  // ─── Init sync ───
  useEffect(() => {
    const normalizeLoaded = (loaded) => {
      const base = loaded && Array.isArray(loaded.tasks) ? { ...DEFAULT_DATA, ...loaded } : { ...DEFAULT_DATA };
      if (Array.isArray(base.tasks)) {
        base.tasks = base.tasks.map(t => t.origin ? t : { ...t, origin: t.projectId === INBOX_ID ? 'inbox' : 'project' });
      }
      const savedShortcuts = Array.isArray(base.shortcuts) && base.shortcuts.length ? base.shortcuts : DEFAULT_SHORTCUTS;
      // Migrate icons: if a default shortcut switched to a local SVG, update saved copy
      const defaultIconById = new Map(DEFAULT_SHORTCUTS.map(d => [d.id, d.icon]));
      const migratedShortcuts = savedShortcuts.map(s => {
        const defIcon = defaultIconById.get(s.id);
        if (defIcon && defIcon.startsWith('/shortcuts/') && s.icon !== defIcon) return { ...s, icon: defIcon };
        return s;
      });
      const byId = new Map(migratedShortcuts.map(s => [s.id, s]));
      const merged = [...migratedShortcuts];
      for (const d of DEFAULT_SHORTCUTS) { if (!byId.has(d.id)) { merged.push(d); byId.set(d.id, d); } }
      let scOrder = Array.isArray(base.scOrder) && base.scOrder.length ? base.scOrder : merged.map(s => s.id);
      scOrder = scOrder.filter(id => byId.has(id));
      const seen = new Set(scOrder); for (const s of merged) if (!seen.has(s.id)) scOrder.push(s.id);
      const next = { ...base, shortcuts: merged, scOrder, showSc: typeof base.showSc === 'boolean' ? base.showSc : true, activeTab: base.activeTab || INBOX_ID };
      if (next.activeTab !== INBOX_ID && !next.projects.some(p => p.id === next.activeTab)) next.activeTab = INBOX_ID;
      return next;
    };

    initSync(
      (loaded) => { setData(normalizeLoaded(loaded)); setLoading(false); },
      (status) => { setSynced(status.signedIn); setAuthUser(status.user); },
      (inv) => setInvites(inv || []),
      (tp) => setTeamProjects(tp || [])
    );
    return cleanup;
  }, []);

  // ─── Subscribe to team tasks ───
  useEffect(() => {
    if (!isTeamTab || !teamId) return;
    const unsub = subscribeTeamTasks(teamId, (tasks) => {
      setTeamTasksMap(prev => ({ ...prev, [teamId]: tasks }));
    });
    return unsub;
  }, [isTeamTab, teamId]);

  // ─── Check for updates ───
  useEffect(() => {
    checkForUpdates().then(info => {
      if (info?.isUpdateAvailable) setUpdateInfo(info);
    }).catch(() => {});
  }, []);

  // ─── Ctrl+Z undo ───
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.target.closest('input, textarea')) {
        e.preventDefault();
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        up(p => {
          const all = [...p.tasks];
          const idx = Math.min(entry._undoIdx ?? all.length, all.length);
          const restored = { ...entry }; delete restored._undoIdx;
          all.splice(idx, 0, restored);
          return { ...p, tasks: all };
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [up]);

  // ─── Auth ───
  const runAuth = async () => {
    setAuthBusy(true); setAuthErr('');
    try {
      const email = authEmail.trim();
      if (!email || authPass.length < 6) throw new Error('Email + password (6+ chars) required');
      if (authMode === 'signup') await signUpEmail(email, authPass);
      else await signInEmail(email, authPass);
      setAuthOpen(false); setAuthPass('');
    } catch (e) { setAuthErr(e?.message || String(e)); } finally { setAuthBusy(false); }
  };
  const runSignOut = async () => {
    setAuthBusy(true); setAuthErr('');
    try { await signOutUser(); setAuthOpen(false); } catch (e) { setAuthErr(e?.message || String(e)); } finally { setAuthBusy(false); }
  };

  useEffect(() => { if (editingTab && editTabRef.current) editTabRef.current.focus(); }, [editingTab]);
  useEffect(() => { const h = () => setContextMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);
  useEffect(() => { if (!scUnlocked) return; const h = (e) => { if (!e.target.closest('.sc-bar')) setScUnlocked(false); }; window.addEventListener('mouseup', h); return () => window.removeEventListener('mouseup', h); }, [scUnlocked]);

  if (loading || !data) return <div className="loading">Loading TaskPad...</div>;

  // ─── Task operations ───

  // Exact word match, case insensitive. "top4" won't match "top" and vice versa.
  const detectProject = (text) => {
    const low = text.toLowerCase();
    for (const p of projects) {
      if (p.isTeam) continue;
      const nameRe = new RegExp('\\b' + escRe(p.name.toLowerCase()) + '\\b', 'i');
      if (nameRe.test(low)) return p.id;
      if (p.keywords?.some(k => {
        const kwRe = new RegExp('\\b' + escRe(k.toLowerCase()) + '\\b', 'i');
        return kwRe.test(low);
      })) return p.id;
    }
    return null;
  };

  const insertTask = (afterIdx) => {
    if (isTeamTab && teamId) {
      const vis = teamTasksMap[teamId] || [];
      const afterOrder = afterIdx >= 0 && vis[afterIdx] ? (vis[afterIdx].order ?? afterIdx) : -1;
      // Create task directly in Firestore, track ID for auto-focus
      createTeamTask({ teamId, text: '', afterOrder }).then(docId => {
        newTeamTaskIds.current.add(docId);
      }).catch(e => console.warn('Team task create failed:', e));
      return;
    }

    const origin = isInbox ? 'inbox' : 'project';
    const nt = { id: genId(), text: '', done: false, projectId: isInbox ? INBOX_ID : activeTab, origin, ts: Date.now(), _new: true };
    up(prev => {
      const all = [...prev.tasks];
      const vis = isInbox
        ? all.filter(t => (t.origin || (t.projectId === INBOX_ID ? 'inbox' : 'project')) === 'inbox' && !t.hiddenFromInbox)
        : all.filter(t => t.projectId === prev.activeTab);
      if (afterIdx < 0) { const first = vis[0]; all.splice(Math.max(0, first ? all.indexOf(first) : 0), 0, nt); }
      else { const ref = vis[afterIdx]; all.splice(ref ? all.indexOf(ref) + 1 : all.length, 0, nt); }
      return { ...prev, tasks: all };
    });
  };

  const changeTask = (id, text) => {
    if (isTeamTab && teamId) {
      if (!text.trim()) {
        deleteTeamTask({ teamId, taskId: id }).catch(e => console.warn(e));
      } else {
        updateTeamTask({ teamId, taskId: id, patch: { text } }).catch(e => console.warn('Team task update failed:', e));
      }
      return;
    }
    up(prev => {
      const existing = prev.tasks.find(t => t.id === id);
      let pid = existing?.projectId;
      const origin = existing?.origin || 'inbox';
      // Only auto-detect project from inbox, never move tasks created on a project tab
      if (origin === 'inbox') { const d = detectProject(text); if (d) pid = d; else pid = INBOX_ID; }
      return { ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, text, projectId: pid, origin, _new: false } : t) };
    });
  };

  const toggleTask = (id) => {
    if (isTeamTab && teamId) {
      const t = (teamTasksMap[teamId] || []).find(x => x.id === id);
      if (t) updateTeamTask({ teamId, taskId: id, patch: { done: !t.done } }).catch(e => console.warn(e));
      return;
    }
    up(p => ({ ...p, tasks: p.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  };

  const deleteTask = (id) => {
    if (isTeamTab && teamId) {
      deleteTeamTask({ teamId, taskId: id }).catch(e => console.warn(e));
      return;
    }
    up(p => {
      const idx = p.tasks.findIndex(t => t.id === id);
      const task = p.tasks[idx];
      if (task) {
        undoStackRef.current.push({ ...task, _undoIdx: idx });
        if (undoStackRef.current.length > 30) undoStackRef.current.shift();
      }
      return { ...p, tasks: p.tasks.filter(t => t.id !== id) };
    });
  };

  const hideFromInbox = (id) => {
    up(p => ({ ...p, tasks: p.tasks.map(t => t.id === id ? { ...t, hiddenFromInbox: true } : t) }));
  };

  const clearDone = () => {
    if (isTeamTab && teamId) {
      const doneTasks = (teamTasksMap[teamId] || []).filter(t => t.done);
      doneTasks.forEach(t => deleteTeamTask({ teamId, taskId: t.id }).catch(() => {}));
      return;
    }
    const ids = visible.filter(t => t.done).map(t => t.id);
    up(p => ({ ...p, tasks: p.tasks.filter(t => !ids.includes(t.id)) }));
  };

  // ─── Project operations ───
  const addProject = () => { const c = TAB_COLORS[projects.length % TAB_COLORS.length]; const np = { id: genId(), name: 'New Project', color: c, keywords: [] }; up(p => ({ ...p, projects: [...p.projects, np], activeTab: np.id })); setEditingTab(np.id); setEditTabName('New Project'); };
  const deleteProject = (id) => {
    up(p => ({
      ...p,
      projects: p.projects.filter(x => x.id !== id),
      tasks: p.tasks.map(t => {
        if (t.projectId !== id) return t;
        if (t.origin === 'inbox') return { ...t, projectId: INBOX_ID, hiddenFromInbox: false };
        return null;
      }).filter(Boolean),
      activeTab: p.activeTab === id ? INBOX_ID : p.activeTab
    }));
    setContextMenu(null);
  };
  const finishEditTab = () => { if (!editingTab) return; const name = editTabName.trim() || 'Untitled'; up(p => ({ ...p, projects: p.projects.map(x => x.id === editingTab ? { ...x, name, keywords: [...new Set([...(x.keywords || []), name.toLowerCase()])] } : x) })); setEditingTab(null); };
  const changeTabColor = (id, color) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === id ? { ...x, color } : x) })); setContextMenu(null); };
  const addKeyword = (pid, kw) => { if (!kw.trim()) return; up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: [...new Set([...(x.keywords || []), kw.trim().toLowerCase()])] } : x) })); };
  const removeKeyword = (pid, kw) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: (x.keywords || []).filter(k => k !== kw) } : x) })); };

  // ─── Team operations ───
  const enableTeam = async (projId) => {
    if (!synced) { setTeamErr('Sign in first to create team projects'); return; }
    setTeamBusy(true); setTeamErr('');
    try {
      const pr = projects.find(p => p.id === projId);
      const tid = await createTeamProject({ name: pr.name, color: pr.color });
      const projTasks = tasks.filter(t => t.projectId === projId);
      for (const t of projTasks) { await createTeamTask({ teamId: tid, text: t.text }); }
      up(p => ({
        ...p,
        projects: p.projects.map(x => x.id === projId ? { ...x, isTeam: true, teamId: tid } : x),
        tasks: p.tasks.filter(t => t.projectId !== projId),
      }));
    } catch (e) { setTeamErr(e?.message || String(e)); } finally { setTeamBusy(false); }
  };

  const sendInvite = async (tid) => {
    if (!inviteEmail.trim()) return;
    setTeamBusy(true); setTeamErr('');
    try { await sendTeamInvite({ teamId: tid, toEmail: inviteEmail.trim() }); setInviteEmail(''); }
    catch (e) { setTeamErr(e?.message || String(e)); } finally { setTeamBusy(false); }
  };

  const handleAcceptInvite = async (inviteId) => {
    setTeamBusy(true);
    try { await acceptTeamInvite({ inviteId }); } catch (e) { console.warn(e); } finally { setTeamBusy(false); }
  };
  const handleDeclineInvite = async (inviteId) => { try { await declineTeamInvite({ inviteId }); } catch (e) { console.warn(e); } };

  const saveNickname = async (tid, uid, nick) => {
    try { await updateTeamProject({ teamId: tid, patch: { [`nicknames.${uid}`]: nick.trim() || uid } }); } catch (e) { console.warn(e); }
    setNickEditUid(null);
  };

  const done = sortedVisible.filter(t => t.done).length, total = sortedVisible.length;

  // ─── Shortcut helpers ───
  const autoIconForUrl = (url) => { try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; } catch { return ''; } };
  const openShortcutAdd = () => { setScErr(''); setScDraft({ id: null, name: '', url: '', icon: '', color: '#888' }); setScOpen(true); };
  const openShortcutEdit = (sc) => { setScErr(''); setScDraft({ ...sc }); setScOpen(true); };
  const saveShortcut = () => {
    const name = scDraft.name.trim(); const url = scDraft.url.trim();
    if (!name || !url) { setScErr('Name + URL required'); return; }
    const icon = (scDraft.icon || autoIconForUrl(url) || '').trim(); const color = scDraft.color || '#888';
    up(p => {
      const existing = (p.shortcuts?.length ? p.shortcuts : DEFAULT_SHORTCUTS);
      const order = (p.scOrder?.length ? p.scOrder : existing.map(s => s.id));
      if (!scDraft.id) { const id = `sc_${genId()}`; return { ...p, shortcuts: [...existing, { id, name, url, icon, color }], scOrder: [...order, id] }; }
      return { ...p, shortcuts: existing.map(s => s.id === scDraft.id ? { ...s, name, url, icon, color } : s), scOrder: order };
    });
    setScOpen(false);
  };
  const deleteShortcut = (id) => { up(p => { const existing = (p.shortcuts?.length ? p.shortcuts : DEFAULT_SHORTCUTS); const order = (p.scOrder?.length ? p.scOrder : existing.map(s => s.id)); return { ...p, shortcuts: existing.filter(s => s.id !== id), scOrder: order.filter(x => x !== id) }; }); };

  return (
    <div className="tp-root">
      {updateInfo && (
        <div className="update-banner">
          <span>Update v{updateInfo.latestVersion} available{updateInfo.notes ? ` — ${updateInfo.notes}` : ''}</span>
          <div className="update-actions">
            {updateInfo.downloadUrl && <a href={updateInfo.downloadUrl} target="_blank" rel="noopener noreferrer" className="update-dl">Download</a>}
            <button className="update-x" onClick={() => setUpdateInfo(null)}>×</button>
          </div>
        </div>
      )}

      <header className="tp-hdr">
        <div className="tp-hdr-l">
          <h1 className="tp-name">TaskPad</h1>
          {isFirebaseConfigured() ? (
            synced ? (
              <button className="tp-auth-btn" onClick={() => setAuthOpen(true)} title="Sync account">⟳</button>
            ) : (
              <button className="tp-auth-btn" onClick={() => setAuthOpen(true)} title="Enable sync">sync</button>
            )
          ) : (
            <span className="local-badge">local</span>
          )}
          {invites.length > 0 && (
            <button className="invite-bell" onClick={() => setInvitesOpen(true)} title={`${invites.length} pending invite(s)`}>
              🔔 <span className="invite-count">{invites.length}</span>
            </button>
          )}
        </div>
        <button className="tp-sc-toggle" onClick={() => up(p => ({ ...p, showSc: !p.showSc }))}>{data.showSc ? '◫' : '◻'}</button>
      </header>

      {isFirebaseConfigured() && authOpen && (
        <div className="tp-modal-backdrop" onMouseDown={() => !authBusy && setAuthOpen(false)}>
          <div className="tp-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="tp-modal-h">
              <div className="tp-modal-title">Sync</div>
              <button className="tp-modal-x" onClick={() => !authBusy && setAuthOpen(false)}>×</button>
            </div>
            {synced ? (
              <div className="tp-modal-body">
                <div className="tp-modal-note">Signed in as {authUser?.email || 'unknown'} — your tasks are syncing.</div>
                {authErr && <div className="tp-modal-err">{authErr}</div>}
                <button className="tp-modal-btn" disabled={authBusy} onClick={runSignOut}>Sign out</button>
              </div>
            ) : (
              <div className="tp-modal-body">
                <div className="tp-modal-tabs">
                  <button className={`tp-modal-tab ${authMode === 'signin' ? 'on' : ''}`} onClick={() => setAuthMode('signin')}>Sign in</button>
                  <button className={`tp-modal-tab ${authMode === 'signup' ? 'on' : ''}`} onClick={() => setAuthMode('signup')}>Create</button>
                </div>
                <input className="tp-modal-in" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
                <input className="tp-modal-in" placeholder="Password (6+ chars)" type="password" value={authPass} onChange={e => setAuthPass(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !authBusy) runAuth(); }} />
                {authErr && <div className="tp-modal-err">{authErr}</div>}
                <button className="tp-modal-btn" disabled={authBusy} onClick={runAuth}>{authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
                <div className="tp-modal-note">Once signed in, this device will sync with any other device using the same account.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {invitesOpen && (
        <div className="tp-modal-backdrop" onMouseDown={() => setInvitesOpen(false)}>
          <div className="tp-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="tp-modal-h">
              <div className="tp-modal-title">Team Invites</div>
              <button className="tp-modal-x" onClick={() => setInvitesOpen(false)}>×</button>
            </div>
            <div className="tp-modal-body">
              {invites.length === 0 && <div className="tp-modal-note">No pending invites.</div>}
              {invites.map(inv => (
                <div key={inv.id} className="invite-row">
                  <div className="invite-info">
                    <span className="invite-from">From: {inv.fromEmail || 'unknown'}</span>
                    <span className="invite-proj">Project: {inv.projectId}</span>
                  </div>
                  <div className="invite-actions">
                    <button className="invite-accept" disabled={teamBusy} onClick={() => handleAcceptInvite(inv.id)}>Accept</button>
                    <button className="invite-decline" onClick={() => handleDeclineInvite(inv.id)}>Decline</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="tp-nav"><div className="tp-nav-scroll">
        <button className={`tp-t ${isInbox ? 'tp-t-on' : ''}`} onClick={() => up(p => ({ ...p, activeTab: INBOX_ID }))} style={{ borderBottomColor: isInbox ? '#38bdf8' : 'transparent' }}>
          <span className="tp-td" style={{ background: '#38bdf8' }} />Inbox
          {isInbox && inboxVisible.filter(t => !t.done).length > 0 && <span className="tp-tc">{inboxVisible.filter(t => !t.done).length}</span>}
        </button>
        {projects.map(pr => (
          <div key={pr.id}>
            {editingTab === pr.id ? (
              <input ref={editTabRef} className="tp-t tp-t-edit" value={editTabName} onChange={e => setEditTabName(e.target.value)} onBlur={finishEditTab}
                onKeyDown={e => { if (e.key === 'Enter') finishEditTab(); if (e.key === 'Escape') setEditingTab(null); }}
                style={{ borderBottomColor: pr.color, width: Math.max(70, editTabName.length * 9) }} />
            ) : (
              <button className={`tp-t ${activeTab === pr.id ? 'tp-t-on' : ''}`}
                onClick={() => up(p => ({ ...p, activeTab: pr.id }))}
                onDoubleClick={() => { setEditingTab(pr.id); setEditTabName(pr.name); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, pid: pr.id }); setTeamErr(''); }}
                style={{ borderBottomColor: activeTab === pr.id ? pr.color : 'transparent', background: activeTab === pr.id ? pr.color + '0a' : 'transparent' }}>
                <span className="tp-td" style={{ background: pr.color }} />
                {pr.name}
                {pr.isTeam && <span className="team-badge">👥</span>}
                {activeTab === pr.id && (() => {
                  const count = pr.isTeam
                    ? (teamTasksMap[pr.teamId] || []).filter(t => !t.done).length
                    : tasks.filter(t => t.projectId === pr.id && !t.done).length;
                  return count > 0 ? <span className="tp-tc">{count}</span> : null;
                })()}
              </button>
            )}
          </div>
        ))}
        <button className="tp-t-add" onClick={addProject}>+</button>
      </div></nav>

      {contextMenu && (() => {
        const pr = projects.find(p => p.id === contextMenu.pid); if (!pr) return null;
        const tp = pr.isTeam ? teamProjects.find(t => t.teamId === pr.teamId) : null;
        return (
          <div className="tp-ctx" style={{ left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.min(contextMenu.y, window.innerHeight - 400) }} onClick={e => e.stopPropagation()}>
            <button className="ctx-it" onClick={() => { setEditingTab(pr.id); setEditTabName(pr.name); setContextMenu(null); }}>✏️ Rename</button>
            <div className="ctx-cols">{TAB_COLORS.map(c => <button key={c} className="ctx-dot" style={{ background: c }} onClick={() => changeTabColor(pr.id, c)} />)}</div>
            {!pr.isTeam && (
              <div className="ctx-kw">
                <span className="ctx-kw-lbl">Auto-detect keywords:</span>
                <div className="ctx-kw-list">{(pr.keywords || []).map(k => <span key={k} className="kw-pill">{k}<button onClick={() => removeKeyword(pr.id, k)}>×</button></span>)}</div>
                <input className="kw-in" placeholder="Add keyword + Enter" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { addKeyword(pr.id, e.target.value); e.target.value = ''; } }} />
              </div>
            )}
            {!pr.isTeam && isFirebaseConfigured() && (
              <div className="ctx-team-section">
                <button className="ctx-it" disabled={teamBusy} onClick={() => enableTeam(pr.id)}>
                  👥 {teamBusy ? 'Converting...' : 'Make Team Project'}
                </button>
                {!synced && <div className="ctx-team-note">Sign in first to enable team</div>}
              </div>
            )}
            {pr.isTeam && tp && (
              <div className="ctx-team-section">
                <span className="ctx-kw-lbl">👥 Team Project</span>
                <div className="team-members">
                  {(tp.memberEmails || []).map((email, i) => {
                    const uid = (tp.memberUids || [])[i];
                    const nick = tp.nicknames?.[uid] || email.split('@')[0];
                    return (
                      <div key={email} className="team-member">
                        {nickEditUid === uid ? (
                          <input className="kw-in" autoFocus value={nickEditVal} onChange={e => setNickEditVal(e.target.value)}
                            onBlur={() => saveNickname(pr.teamId, uid, nickEditVal)}
                            onKeyDown={e => { if (e.key === 'Enter') saveNickname(pr.teamId, uid, nickEditVal); if (e.key === 'Escape') setNickEditUid(null); }} />
                        ) : (
                          <span className="team-member-info" onClick={() => { setNickEditUid(uid); setNickEditVal(nick); }}>
                            <span className="team-nick">{nick}</span>
                            <span className="team-email">{email}</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="team-invite">
                  <input className="kw-in" placeholder="Invite by email + Enter" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendInvite(pr.teamId); }} />
                </div>
              </div>
            )}
            {teamErr && <div className="tp-modal-err" style={{ padding: '4px 12px', fontSize: 11 }}>{teamErr}</div>}
            <button className="ctx-it ctx-del" onClick={() => deleteProject(pr.id)}>🗑 Delete project</button>
          </div>
        );
      })()}

      <main className="tp-body">
        {total > 0 && (
          <div className="tp-prog">
            <div className="tp-pbar"><div className="tp-pfill" style={{ width: `${(done / total) * 100}%`, background: accent }} /></div>
            <span className="tp-pnum">{done}/{total}</span>
            {done > 0 && <button className="tp-pcl" onClick={clearDone}>Clear done</button>}
          </div>
        )}
        <div className="tp-tasks" ref={containerRef}>
          {sortedVisible.length === 0 && <div className="tp-empty" onClick={() => insertTask(-1)}><span style={{ fontSize: 28, opacity: 0.25 }}>📝</span><span>{isInbox ? 'Inbox is empty — click here to start' : 'No tasks yet — click to add'}</span></div>}
          {sortedVisible.length > 0 && !isTaskDragging && <InsertZone onClick={() => insertTask(-1)} color={accent} />}
          {sortedVisible.map((task, idx) => {
            // Check if this is a newly created team task that needs auto-focus
            const isNewTeam = newTeamTaskIds.current.has(task.id);
            if (isNewTeam) newTeamTaskIds.current.delete(task.id);
            const taskObj = isNewTeam ? { ...task, _new: true } : task;
            return (
              <div key={task.id}>
                <TaskLine task={taskObj} allProjects={projects} accentColor={accent} isInbox={isInbox}
                  isTeam={isTeamTab} nicknames={teamProjData?.nicknames}
                  onToggle={toggleTask} onDelete={deleteTask} onChange={changeTask}
                  onHide={isInbox ? hideFromInbox : null}
                  dragHandle={e => onTaskDrag(e, task.id)} style={getTaskStyle(task.id)}
                  refCb={el => { if (el) taskRefs.current[task.id] = el; }} />
                {!isTaskDragging && <InsertZone onClick={() => insertTask(idx)} color={accent} />}
              </div>
            );
          })}
        </div>
      </main>

      {data.showSc && (
        <div className="sc-bar">
          <div className="sc-row">
            {orderedSc.map(s => (
              <ShortcutIcon key={s.id} shortcut={s} unlocked={scUnlocked} onUnlock={() => setScUnlocked(true)}
                onDragStart={(e, forcedX) => onScDrag(e, s.id, forcedX)} style={getScStyle(s.id)}
                refCb={el => { if (el) scRefs.current[s.id] = el; }} />
            ))}
            <button className="sc-add" onClick={openShortcutAdd} title="Add shortcut">+</button>
          </div>
        </div>
      )}

      {scOpen && (
        <div className="tp-modal-backdrop" onMouseDown={() => setScOpen(false)}>
          <div className="tp-modal" onMouseDown={e => e.stopPropagation()}>
            <div className="tp-modal-h">
              <div className="tp-modal-title">Shortcuts</div>
              <button className="tp-modal-x" onClick={() => setScOpen(false)}>×</button>
            </div>
            <div className="tp-modal-body">
              <div className="sc-list">
                {(orderedSc || []).map(sc => (
                  <div key={sc.id} className="sc-li" onClick={() => openShortcutEdit(sc)}>
                    <div className="sc-li-l">
                      <img src={sc.icon} alt="" width="16" height="16" onError={e => { e.target.style.display = 'none'; }} />
                      <span className="sc-li-name">{sc.name}</span>
                    </div>
                    <div className="sc-li-r">
                      <button className="sc-li-btn" onClick={(e) => { e.stopPropagation(); openShortcutEdit(sc); }}>Edit</button>
                      <button className="sc-li-btn sc-li-del" onClick={(e) => { e.stopPropagation(); deleteShortcut(sc.id); }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="sc-form">
                <div className="sc-form-h">{scDraft.id ? 'Edit shortcut' : 'Add shortcut'}</div>
                <input className="tp-modal-in" placeholder="Name" value={scDraft.name} onChange={e => setScDraft(d => ({ ...d, name: e.target.value }))} />
                <input className="tp-modal-in" placeholder="URL" value={scDraft.url} onChange={e => setScDraft(d => ({ ...d, url: e.target.value }))} />
                <input className="tp-modal-in" placeholder="Icon URL (optional)" value={scDraft.icon} onChange={e => setScDraft(d => ({ ...d, icon: e.target.value }))} />
                <input className="tp-modal-in" placeholder="Color (optional, e.g. #38bdf8)" value={scDraft.color} onChange={e => setScDraft(d => ({ ...d, color: e.target.value }))} />
                {scErr && <div className="tp-modal-err">{scErr}</div>}
                <button className="tp-modal-btn" onClick={saveShortcut}>{scDraft.id ? 'Save changes' : 'Add shortcut'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="tp-foot">Drag ⠿ to reorder · Hold shortcut to unlock drag · Click between tasks to insert</footer>
    </div>
  );
}
