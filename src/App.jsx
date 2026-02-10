import { useState, useEffect, useRef, useCallback } from 'react';
import { initSync, saveToCloud, cleanup } from './sync';
import { isFirebaseConfigured, signInEmail, signUpEmail, signOutUser } from './firebase';

const DEFAULT_SHORTCUTS = [
  { id: 'vc', name: 'Vercel', url: 'https://vercel.com/dashboard', icon: 'https://www.google.com/s2/favicons?domain=vercel.com&sz=64', color: '#fff' },
  { id: 'gh', name: 'GitHub', url: 'https://github.com', icon: 'https://www.google.com/s2/favicons?domain=github.com&sz=64', color: '#e6edf3' },
  { id: 'nf', name: 'Netlify', url: 'https://app.netlify.com', icon: 'https://www.google.com/s2/favicons?domain=netlify.com&sz=64', color: '#32e6e2' },
  { id: 'gm', name: 'Gmail', url: 'https://mail.google.com', icon: '/shortcuts/gmail.svg', color: '#ea4335' },
  { id: 'ae', name: 'AliExpress', url: 'https://www.aliexpress.com', icon: 'https://www.google.com/s2/favicons?domain=aliexpress.com&sz=64', color: '#e43225' },
  { id: 'et', name: 'Etsy', url: 'https://www.etsy.com/your/shops/me/dashboard', icon: 'https://www.google.com/s2/favicons?domain=etsy.com&sz=64', color: '#f1641e' },
  { id: 'db', name: 'MongoDB', url: 'https://cloud.mongodb.com/', icon: 'https://www.google.com/s2/favicons?domain=mongodb.com&sz=64', color: '#00ed64' },
  { id: 'fb', name: 'Firebase', url: 'https://console.firebase.google.com/', icon: '/shortcuts/firebase.svg', color: '#fbbf24' },
  { id: 'ai', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64', color: '#10a37f' },
  { id: 'cl', name: 'Claude', url: 'https://claude.ai', icon: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=64', color: '#d4a574' },
  { id: 'li', name: 'LinkedIn', url: 'https://www.linkedin.com', icon: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=64', color: '#0a66c2' },
  { id: 'hk', name: 'Heroku', url: 'https://dashboard.heroku.com', icon: 'https://www.google.com/s2/favicons?domain=heroku.com&sz=64', color: '#9e7cc1' },
  { id: 'jg', name: 'Portfolio', url: 'https://www.joaograca.work/', icon: '/shortcuts/portfolio.png', color: '#7eb8da' },
  { id: 'sf', name: 'Scryfall', url: 'https://scryfall.com', icon: 'https://www.google.com/s2/favicons?domain=scryfall.com&sz=64', color: '#e0a526' },
  { id: 'cm', name: 'Cardmarket', url: 'https://www.cardmarket.com', icon: 'https://www.google.com/s2/favicons?domain=cardmarket.com&sz=64', color: '#1a82c4' },
  { id: 'yt', name: 'YouTube', url: 'https://www.youtube.com', icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64', color: '#ff0000' },
];

const TAB_COLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c', '#34d399'];
const INBOX_ID = '__inbox__';
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const EMPTY = [];

const DEFAULT_DATA = {
  projects: [{ id: 'p1', name: 'Sample', color: '#4ecdc4', keywords: ['sample'] }],
  tasks: [
    { id: 'w1', text: 'Drag me by the grip on the left ⠿', done: false, projectId: INBOX_ID, ts: Date.now() },
    { id: 'w2', text: 'Click between tasks to insert new ones', done: false, projectId: INBOX_ID, ts: Date.now() },
    { id: 'w3', text: 'Hold a shortcut icon ~0.6s to unlock drag mode', done: false, projectId: INBOX_ID, ts: Date.now() },
  ],
  activeTab: INBOX_ID, scOrder: DEFAULT_SHORTCUTS.map(s => s.id), showSc: true,
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
    e?.preventDefault?.();
    e?.stopPropagation?.();
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

// ─── Shortcut Icon (ring after 120ms hold, no hint text) ───
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
    isDownRef.current = true;
    trackPos(e);
    if (unlocked) { onDragStart(e, lastPosRef.current.x); return; }
    const start = Date.now();
    thresholdRef.current = setTimeout(() => {
      setShowRing(true);
      const tick = () => {
        const pct = Math.min((Date.now() - start) / 600, 1);
        setHoldProgress(pct);
        if (pct >= 1) {
          // Unlock drag mode, and immediately start the drag without requiring a second press.
          onUnlock();
          setShowRing(false);
          setHoldProgress(0);
          if (isDownRef.current) {
            const fakeEvt = {
              button: 0,
              clientX: lastPosRef.current.x,
              touches: [{ clientX: lastPosRef.current.x }],
              preventDefault() {},
              stopPropagation() {},
            };
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
function TaskLine({ task, allProjects, accentColor, isInbox, onToggle, onDelete, onChange, dragHandle, style, refCb }) {
  const [editing, setEditing] = useState(task._new || false);
  const [text, setText] = useState(task.text);
  const inputRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); if (!task._new) inputRef.current.select(); } }, [editing]);
  useEffect(() => { setText(task.text); }, [task.text]);
  const commit = () => { const t = text.trim(); if (!t && task._new) { onDelete(task.id); return; } if (!t) { setEditing(false); setText(task.text); return; } onChange(task.id, t); setEditing(false); };
  const projLabel = isInbox && task.projectId && task.projectId !== INBOX_ID ? allProjects.find(p => p.id === task.projectId) : null;

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
          <input ref={inputRef} className="task-input" value={text} onChange={e => setText(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditing(false); setText(task.text); } }} />
        ) : (<span className="task-text">{task.text}</span>)}
        {projLabel && <span className="task-tag" style={{ color: projLabel.color, borderColor: projLabel.color + '44' }}>{projLabel.name}</span>}
      </div>
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

  const projects = data?.projects || EMPTY;
  const tasks = data?.tasks || EMPTY;
  const activeTab = data?.activeTab || INBOX_ID;
  const isInbox = activeTab === INBOX_ID;
  const visible = isInbox ? tasks : tasks.filter(t => t.projectId === activeTab);
  const activeProj = projects.find(p => p.id === activeTab);
  const accent = isInbox ? '#ff6b6b' : (activeProj?.color || '#ff6b6b');
  const savedSc = Array.isArray(data?.scOrder) ? data.scOrder : [];
  const defaultSc = DEFAULT_SHORTCUTS.map(s => s.id);
  const scIds = [...savedSc, ...defaultSc.filter(id => !savedSc.includes(id))];
  const orderedSc = scIds.map(id => DEFAULT_SHORTCUTS.find(s => s.id === id)).filter(Boolean);

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
      if (prev.activeTab === INBOX_ID) return { ...prev, tasks: newVis };
      const at = prev.activeTab;
      const others = prev.tasks.filter(t => t.projectId !== at);
      const firstIdx = prev.tasks.findIndex(t => t.projectId === at);
      const result = [...others]; result.splice(Math.max(0, firstIdx), 0, ...newVis);
      return { ...prev, tasks: result };
    });
  }, [up]);

  const reorderSc = useCallback((newSc) => up(p => p ? { ...p, scOrder: newSc.map(s => s.id) } : p), [up]);

  const { containerRef, itemRefs: taskRefs, onPointerDown: onTaskDrag, getStyle: getTaskStyle, isDragging: isTaskDragging } = useDragReorder(visible, reorderVisible);
  const { itemRefs: scRefs, onPointerDown: onScDrag, getStyle: getScStyle } = useHDragReorder(orderedSc, reorderSc);

  useEffect(() => {
    initSync((loaded) => {
      if (!loaded.tasks) loaded = { ...DEFAULT_DATA, ...loaded };
      setData(loaded); setLoading(false);
    }, (isSignedIn) => setSynced(isSignedIn));
    return cleanup;
  }, []);

  const runAuth = async () => {
    setAuthBusy(true);
    setAuthErr('');
    try {
      const email = authEmail.trim();
      if (!email || authPass.length < 6) throw new Error('Email + password (6+ chars) required');
      if (authMode === 'signup') await signUpEmail(email, authPass);
      else await signInEmail(email, authPass);
      setAuthOpen(false);
      setAuthPass('');
    } catch (e) {
      setAuthErr(e?.message || String(e));
    } finally {
      setAuthBusy(false);
    }
  };

  const runSignOut = async () => {
    setAuthBusy(true);
    setAuthErr('');
    try {
      await signOutUser();
      setAuthOpen(false);
    } catch (e) {
      setAuthErr(e?.message || String(e));
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => { if (editingTab && editTabRef.current) editTabRef.current.focus(); }, [editingTab]);
  useEffect(() => { const h = () => setContextMenu(null); window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);
  useEffect(() => { if (!scUnlocked) return; const h = (e) => { if (!e.target.closest('.sc-bar')) setScUnlocked(false); }; window.addEventListener('mouseup', h); return () => window.removeEventListener('mouseup', h); }, [scUnlocked]);

  if (loading || !data) return <div className="loading">Loading TaskPad...</div>;

  const detectProject = (text) => { const low = text.toLowerCase(); for (const p of projects) { if (low.includes(p.name.toLowerCase())) return p.id; if (p.keywords?.some(k => low.includes(k.toLowerCase()))) return p.id; } return null; };

  const insertTask = (afterIdx) => {
    const nt = { id: genId(), text: '', done: false, projectId: isInbox ? INBOX_ID : activeTab, ts: Date.now(), _new: true };
    up(prev => {
      const all = [...prev.tasks]; const vis = isInbox ? all : all.filter(t => t.projectId === prev.activeTab);
      if (afterIdx < 0) { const first = vis[0]; all.splice(Math.max(0, first ? all.indexOf(first) : 0), 0, nt); }
      else { const ref = vis[afterIdx]; all.splice(ref ? all.indexOf(ref) + 1 : all.length, 0, nt); }
      return { ...prev, tasks: all };
    });
  };

  const changeTask = (id, text) => { up(prev => { let pid = prev.tasks.find(t => t.id === id)?.projectId; if (pid === INBOX_ID) { const d = detectProject(text); if (d) pid = d; } return { ...prev, tasks: prev.tasks.map(t => t.id === id ? { ...t, text, projectId: pid, _new: false } : t) }; }); };
  const toggleTask = (id) => up(p => ({ ...p, tasks: p.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  const deleteTask = (id) => up(p => ({ ...p, tasks: p.tasks.filter(t => t.id !== id) }));
  const clearDone = () => { const ids = visible.filter(t => t.done).map(t => t.id); up(p => ({ ...p, tasks: p.tasks.filter(t => !ids.includes(t.id)) })); };

  const addProject = () => { const c = TAB_COLORS[projects.length % TAB_COLORS.length]; const np = { id: genId(), name: 'New Project', color: c, keywords: [] }; up(p => ({ ...p, projects: [...p.projects, np], activeTab: np.id })); setEditingTab(np.id); setEditTabName('New Project'); };
  const deleteProject = (id) => { up(p => ({ ...p, projects: p.projects.filter(x => x.id !== id), tasks: p.tasks.map(t => t.projectId === id ? { ...t, projectId: INBOX_ID } : t), activeTab: p.activeTab === id ? INBOX_ID : p.activeTab })); setContextMenu(null); };
  const finishEditTab = () => { if (!editingTab) return; const name = editTabName.trim() || 'Untitled'; up(p => ({ ...p, projects: p.projects.map(x => x.id === editingTab ? { ...x, name, keywords: [...new Set([...(x.keywords || []), name.toLowerCase()])] } : x) })); setEditingTab(null); };
  const changeTabColor = (id, color) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === id ? { ...x, color } : x) })); setContextMenu(null); };
  const addKeyword = (pid, kw) => { if (!kw.trim()) return; up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: [...new Set([...(x.keywords || []), kw.trim().toLowerCase()])] } : x) })); };
  const removeKeyword = (pid, kw) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: (x.keywords || []).filter(k => k !== kw) } : x) })); };

  const done = visible.filter(t => t.done).length, total = visible.length;

  return (
    <div className="tp-root">
      <header className="tp-hdr">
        <div className="tp-hdr-l">
          <span className="tp-logo">▪</span><h1 className="tp-name">TaskPad</h1>
          {isFirebaseConfigured() ? (
            synced ? (
              <button className="tp-auth-btn" onClick={() => setAuthOpen(true)} title="Sync account">⟳</button>
            ) : (
              <button className="tp-auth-btn" onClick={() => setAuthOpen(true)} title="Enable sync">sync</button>
            )
          ) : (
            <span className="local-badge">local</span>
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
                <div className="tp-modal-note">Signed in — your tasks are syncing.</div>
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

      <nav className="tp-nav"><div className="tp-nav-scroll">
        <button className={`tp-t ${isInbox ? 'tp-t-on' : ''}`} onClick={() => up(p => ({ ...p, activeTab: INBOX_ID }))} style={{ borderBottomColor: isInbox ? '#ff6b6b' : 'transparent' }}>
          <span className="tp-td" style={{ background: '#ff6b6b' }} />Inbox
          {isInbox && tasks.filter(t => !t.done).length > 0 && <span className="tp-tc">{tasks.filter(t => !t.done).length}</span>}
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
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, pid: pr.id }); }}
                style={{ borderBottomColor: activeTab === pr.id ? pr.color : 'transparent', background: activeTab === pr.id ? pr.color + '0a' : 'transparent' }}>
                <span className="tp-td" style={{ background: pr.color }} />{pr.name}
                {activeTab === pr.id && tasks.filter(t => t.projectId === pr.id && !t.done).length > 0 && <span className="tp-tc">{tasks.filter(t => t.projectId === pr.id && !t.done).length}</span>}
              </button>
            )}
          </div>
        ))}
        <button className="tp-t-add" onClick={addProject}>+</button>
      </div></nav>

      {contextMenu && (() => {
        const pr = projects.find(p => p.id === contextMenu.pid); if (!pr) return null;
        return (
          <div className="tp-ctx" style={{ left: Math.min(contextMenu.x, window.innerWidth - 220), top: Math.min(contextMenu.y, window.innerHeight - 300) }} onClick={e => e.stopPropagation()}>
            <button className="ctx-it" onClick={() => { setEditingTab(pr.id); setEditTabName(pr.name); setContextMenu(null); }}>✏️ Rename</button>
            <div className="ctx-cols">{TAB_COLORS.map(c => <button key={c} className="ctx-dot" style={{ background: c }} onClick={() => changeTabColor(pr.id, c)} />)}</div>
            <div className="ctx-kw">
              <span className="ctx-kw-lbl">Auto-detect keywords:</span>
              <div className="ctx-kw-list">{(pr.keywords || []).map(k => <span key={k} className="kw-pill">{k}<button onClick={() => removeKeyword(pr.id, k)}>×</button></span>)}</div>
              <input className="kw-in" placeholder="Add keyword + Enter" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { addKeyword(pr.id, e.target.value); e.target.value = ''; } }} />
            </div>
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
          {visible.length === 0 && <div className="tp-empty" onClick={() => insertTask(-1)}><span style={{ fontSize: 28, opacity: 0.25 }}>📝</span><span>{isInbox ? 'Inbox is empty — click here to start' : 'No tasks yet — click to add'}</span></div>}
          {visible.length > 0 && !isTaskDragging && <InsertZone onClick={() => insertTask(-1)} color={accent} />}
          {visible.map((task, idx) => (
            <div key={task.id}>
              <TaskLine task={task} allProjects={projects} accentColor={accent} isInbox={isInbox}
                onToggle={toggleTask} onDelete={deleteTask} onChange={changeTask}
                dragHandle={e => onTaskDrag(e, task.id)} style={getTaskStyle(task.id)}
                refCb={el => { if (el) taskRefs.current[task.id] = el; }} />
              {!isTaskDragging && <InsertZone onClick={() => insertTask(idx)} color={accent} />}
            </div>
          ))}
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
          </div>
        </div>
      )}

      <footer className="tp-foot">Drag ⠿ to reorder · Hold shortcut to unlock drag · Click between tasks to insert</footer>
    </div>
  );
}
