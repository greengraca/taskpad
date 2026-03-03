import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { initSync, saveToCloud, saveLocal, cleanup, getAuthUser,
  createTeamProject, sendTeamInvite, acceptTeamInvite, declineTeamInvite,
  subscribeTeamTasks, subscribeTeamProject, createTeamTask, genTeamTaskId, updateTeamTask, deleteTeamTask, reorderTeamTasks, updateTeamProject, deleteTeamProject,
  reconnectFirestore,
  initVault, subscribeVaultEntries, createVaultEntry, updateVaultEntry, deleteVaultEntry, resetVault,
  subscribePersonalNotes, createPersonalNote, updatePersonalNote, deletePersonalNote
} from './sync';
import { parseMarkdown, extractLinks, extractTags } from './markdown';
import { generateSalt, toBase64, fromBase64, deriveKey, encryptEntry, decryptEntry, createVerifier, checkVerifier } from './crypto';
import { isFirebaseConfigured, signInEmail, signUpEmail, signOutUser } from './firebase';
import { checkForUpdates } from './updater';

const DEFAULT_SHORTCUTS = [
  { id: 'vc', name: 'Vercel', url: 'https://vercel.com/dashboard', icon: '/shortcuts/vercel.png', color: '#fff' },
  { id: 'gh', name: 'GitHub', url: 'https://github.com', icon: '/shortcuts/github.svg', color: '#e6edf3' },
  { id: 'nf', name: 'Netlify', url: 'https://app.netlify.com', icon: '/shortcuts/netlify.png', color: '#32e6e2' },
  { id: 'gm', name: 'Gmail', url: 'https://mail.google.com', icon: '/shortcuts/gmail.svg', color: '#ea4335' },
  { id: 'jg', name: 'Portfolio', url: 'https://www.joaograca.work/', icon: '/shortcuts/portfolio.png', color: '#7eb8da' },
  { id: 'fb', name: 'Firebase', url: 'https://console.firebase.google.com/', icon: '/shortcuts/firebase.svg', color: '#fbbf24' },
  { id: 'ae', name: 'AliExpress', url: 'https://www.aliexpress.com', icon: '/shortcuts/aliexpress.png', color: '#e43225' },
  { id: 'et', name: 'Etsy', url: 'https://www.etsy.com/your/shops/me/dashboard', icon: '/shortcuts/etsy.png', color: '#f1641e' },
  { id: 'db', name: 'MongoDB', url: 'https://cloud.mongodb.com/', icon: '/shortcuts/mongodb.png', color: '#00ed64' },
  { id: 'ai', name: 'ChatGPT', url: 'https://chat.openai.com', icon: '/shortcuts/chatgpt.png', color: '#10a37f' },
  { id: 'cl', name: 'Claude', url: 'https://claude.ai', icon: '/shortcuts/claude.png', color: '#d4a574' },
  { id: 'li', name: 'LinkedIn', url: 'https://www.linkedin.com', icon: '/shortcuts/linkedin.png', color: '#0a66c2' },
  { id: 'hk', name: 'Heroku', url: 'https://dashboard.heroku.com', icon: '/shortcuts/heroku.png', color: '#9e7cc1' },
  { id: 'sf', name: 'Scryfall', url: 'https://scryfall.com', icon: '/shortcuts/scryfall.png', color: '#e0a526' },
  { id: 'cm', name: 'Cardmarket', url: 'https://www.cardmarket.com', icon: '/shortcuts/cardmarket.png', color: '#1a82c4' },
  { id: 'yt', name: 'YouTube', url: 'https://www.youtube.com', icon: '/shortcuts/youtube.png', color: '#ff0000' },
];

const TAB_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#f472b6', '#fb923c', '#ffe66d', '#4ecdc4', '#ff6b6b', '#22c55e', '#60a5fa', '#f59e0b', '#14b8a6'];
const INBOX_ID = '__inbox__';
const NOTES_ID = '__notes__';
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const EMPTY = [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NOTE_TEMPLATES = [
  { name: 'Blank', title: 'Untitled', content: '' },
  { name: 'Meeting Notes', title: 'Meeting Notes', content: `## Attendees\n- \n\n## Agenda\n- [ ] \n\n## Notes\n\n\n## Action Items\n- [ ] \n- [ ] \n` },
  { name: 'Project Plan', title: 'Project Plan', content: `## Overview\n\n\n## Goals\n- [ ] \n- [ ] \n- [ ] \n\n## Tasks\n- [ ] \n- [ ] \n- [ ] \n\n## Timeline\n| Phase | Target Date | Status |\n|-------|------------|--------|\n| Planning | | |\n| Development | | |\n| Review | | |\n` },
  { name: 'Weekly Review', title: 'Weekly Review', content: `## Wins\n- \n\n## Challenges\n- \n\n## Next Week\n- [ ] \n- [ ] \n- [ ] \n\n## Notes\n\n` },
];

const SLASH_COMMANDS = [
  { name: 'Heading', icon: 'H#', insert: '## ', cursor: 3 },
  { name: 'Bullet', icon: '•', insert: '- ', cursor: 2 },
  { name: 'Checkbox', icon: '☑', insert: '- [ ] ', cursor: 6 },
  { name: 'Callout', icon: '📢', insert: '> [!note] \n> ', cursor: 10 },
  { name: 'Divider', icon: '—', insert: '---\n', cursor: 4 },
  { name: 'Quote', icon: '❝', insert: '> ', cursor: 2 },
  { name: 'Code Block', icon: '</>', insert: '```\n\n```', cursor: 4 },
];

// ─── Pixel art avatars ───
const AVATARS = [
  { id: 0, name: 'Knight', color: '#ef4444', src: '/avatars/0.svg' },
  { id: 1, name: 'Wizard', color: '#3b82f6', src: '/avatars/1.svg' },
  { id: 2, name: 'Archer', color: '#22c55e', src: '/avatars/2.svg' },
  { id: 3, name: 'Mage', color: '#a855f7', src: '/avatars/3.svg' },
  { id: 4, name: 'Builder', color: '#f97316', src: '/avatars/4.svg' },
  { id: 5, name: 'Healer', color: '#ec4899', src: '/avatars/5.svg' },
  { id: 6, name: 'Explorer', color: '#06b6d4', src: '/avatars/6.svg' },
  { id: 7, name: 'Merchant', color: '#eab308', src: '/avatars/7.svg' },
  { id: 8, name: 'Farmer', color: '#84cc16', src: '/avatars/8.svg' },
  { id: 9, name: 'Pirate', color: '#f43f5e', src: '/avatars/9.svg' },
];

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
    widthsRef.current = items.map(item => { const el = itemRefs.current[item.id]; return el ? el.getBoundingClientRect().width + 4 : 80; });
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
    if (id === dragState.id) return { transform: `translateX(${dragState.currentX - dragState.startX}px) scale(1.08)`, zIndex: 100, transition: 'transform 0s', position: 'relative', filter: 'brightness(1.2)' };
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
    // Cancel hold if finger moved significantly (user is scrolling)
    if (isDownRef.current && !unlocked && lastPosRef.current.x) {
      const dx = Math.abs(x - lastPosRef.current.x);
      const dy = Math.abs(y - lastPosRef.current.y);
      if (dx > 8 || dy > 8) cancelHold();
    }
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
    <div className="sc-wrap" ref={refCb} style={{ ...style, ...(unlocked ? { touchAction: 'none' } : {}) }}
      onMouseDown={startHold} onMouseMove={trackPos} onMouseUp={cancelHold} onMouseLeave={!unlocked ? cancelHold : undefined}
      onTouchStart={startHold} onTouchMove={trackPos} onTouchEnd={cancelHold}>
      {(showRing || unlocked) && (
        <svg viewBox="0 0 36 36" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
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
function TaskLine({ task, allProjects, accentColor, isInbox, isTeam, nicknames, avatars, onToggle, onDelete, onChange, onHide, dragHandle, style, refCb, selected, onSelect, isSelecting, onDragSelectStart, onDragSelectEnter, dragSelectRef }) {
  const [editing, setEditing] = useState(task._new || false);
  const [text, setText] = useState(task.text);
  const inputRef = useRef(null);
  const textRef = useRef(null);
  const touchTimerRef = useRef(null);
  useEffect(() => { if (editing && inputRef.current) { const el = inputRef.current; el.focus(); if (!task._new) el.select(); requestAnimationFrame(() => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }); } }, [editing]);
  useEffect(() => { setText(task.text); }, [task.text]);
  const commit = () => { const t = text.trim(); if (!t && task._new) { onDelete(task.id); return; } if (!t) { setEditing(false); setText(task.text); return; } onChange(task.id, t); setEditing(false); };
  const projLabel = isInbox && task.projectId && task.projectId !== INBOX_ID ? allProjects.find(p => p.id === task.projectId) : null;

  // Author info with avatar
  let authorNick = null;
  let authorAvatar = null;
  let authorColor = null;
  if (isTeam && (task.createdByUid || task.createdByEmail)) {
    authorNick = nicknames?.[task.createdByUid] || task.createdByEmail?.split('@')[0] || null;
    const avId = avatars?.[task.createdByUid];
    if (avId !== undefined && avId !== null) {
      const av = AVATARS[avId];
      if (av) { authorAvatar = av; authorColor = av.color; }
    }
  }

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

  const pendingClickRef = useRef(null);

  const handleBodyMouseDown = (e) => {
    if (editing) return;
    if (e.button !== 0) return;
    // Ctrl/Cmd+Click = toggle select, not edit
    if ((e.ctrlKey || e.metaKey) && onSelect) {
      e.preventDefault();
      onSelect(task.id, 'toggle');
      return;
    }
    // Start potential drag-select
    if (onDragSelectStart) {
      pendingClickRef.current = { x: e.clientX, y: e.clientY };
      onDragSelectStart(task.id, e.clientY);
    }
  };

  const handleBodyClick = (e) => {
    if (editing) return;
    if (e.ctrlKey || e.metaKey) return;
    if (!pendingClickRef.current) return;
    pendingClickRef.current = null;
    if (dragSelectRef?.current?.justEnded || dragSelectRef?.current?.active) {
      e.stopPropagation();
      return;
    }
    // In selection mode (mobile), tap toggles instead of editing
    if (isSelecting) {
      onSelect?.(task.id, 'toggle');
      return;
    }
    setEditing(true);
  };

  const handleBodyTouchStart = (e) => {
    if (editing) return;
    if (isSelecting) return; // tap-to-toggle handled in touchEnd
    clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      touchTimerRef.current = null;
      navigator.vibrate?.(30);
      onSelect?.(task.id, 'toggle');
    }, 500);
  };

  const handleBodyTouchEnd = (e) => {
    if (isSelecting) {
      e.preventDefault(); // prevent ghost click from opening edit
      onSelect?.(task.id, 'toggle');
      return;
    }
    const stillPending = !!touchTimerRef.current;
    clearTimeout(touchTimerRef.current);
    touchTimerRef.current = null;
    // If it was a quick tap (timer didn't fire yet) → let the click flow handle edit
  };
  const handleBodyTouchMove = () => { clearTimeout(touchTimerRef.current); touchTimerRef.current = null; };

  return (
    <div className={`task-row ${task.done ? 'task-done' : ''} ${selected ? 'task-selected' : ''}`} ref={refCb} style={{ ...style, borderLeftColor: task.done ? '#252525' : accentColor }}
      onMouseEnter={() => { if (onDragSelectEnter) onDragSelectEnter(task.id); }}>
      <div className="drag-grip" onMouseDown={dragHandle} onTouchStart={dragHandle}>⠿</div>
      <button onClick={() => onToggle(task.id)} className="checkbox">
        <div className="cb-inner" style={{ background: task.done ? accentColor : 'transparent', borderColor: task.done ? accentColor : '#555' }}>
          {task.done && <span className="chk">✓</span>}
        </div>
      </button>
      <div className="task-body" onMouseDown={handleBodyMouseDown} onClick={handleBodyClick}
        onTouchStart={handleBodyTouchStart} onTouchEnd={handleBodyTouchEnd} onTouchMove={handleBodyTouchMove}>
        {editing ? (
          <textarea ref={inputRef} className="task-input" rows={1} value={text}
            onChange={e => { setText(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }} onBlur={commit}
            onKeyDown={e => { if (insertBullet(e)) return; if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditing(false); setText(task.text); } }} />
        ) : (
          <span className="task-text" ref={textRef} style={{ whiteSpace: 'pre-wrap' }}>{task.text}</span>
        )}
      </div>
      {(projLabel || authorNick) && (
        <div className="task-badges">
          {projLabel && <span className="task-tag" style={{ color: projLabel.color, borderColor: projLabel.color + '44' }}>{projLabel.name}</span>}
          {authorNick && (
            <span className="task-author" style={authorColor ? { borderColor: authorColor + '66', color: authorColor } : undefined}>
              {authorAvatar && <img src={authorAvatar.src} alt="" className="task-author-av" />}
              {authorNick}
            </span>
          )}
        </div>
      )}
      <div className="task-actions">
        {canHide && (
          <button onClick={() => onHide(task.id)} className="hide-btn" title="Hide from Cockpit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        )}
        <button onClick={() => onDelete(task.id)} className="del-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
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

// ─── Vault entry form ───
function VaultForm({ initial, busy, onSave, onCancel }) {
  const [label, setLabel] = useState(initial?.label || '');
  const [username, setUsername] = useState(initial?.username || '');
  const [password, setPassword] = useState(initial?.password || '');
  const [url, setUrl] = useState(initial?.url || '');
  const [showPw, setShowPw] = useState(false);
  const save = () => {
    if (!label.trim() || !password.trim()) return;
    onSave({ label: label.trim(), username: username.trim(), password: password.trim(), url: url.trim() });
  };
  return (
    <div className="vault-form">
      <input placeholder="Label *" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <div className="vault-form-pw">
        <input type={showPw ? 'text' : 'password'} placeholder="Password *" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="button" onClick={() => setShowPw(v => !v)}>{showPw ? 'Hide' : 'Show'}</button>
      </div>
      <input placeholder="URL" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      <div className="vault-form-btns">
        <button disabled={busy || !label.trim() || !password.trim()} onClick={save}>{busy ? '...' : 'Save'}</button>
        <button onClick={onCancel}>Cancel</button>
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
  const dataRef = useRef(data);
  const pendingSave = useRef(false);
  const undoStackRef = useRef([]);
  const newTeamTaskIds = useRef(new Set());

  // Shortcuts modal
  const [scOpen, setScOpen] = useState(false);
  const [scDraft, setScDraft] = useState({ id: null, name: '', url: '', icon: '', color: '#888' });
  const [scErr, setScErr] = useState('');

  // Update popup
  const [updateInfo, setUpdateInfo] = useState(null);
  const [swUpdate, setSwUpdate] = useState(null);

  useEffect(() => {
    const handler = (e) => setSwUpdate({ version: e.detail?.version });
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  // Team state
  const [invites, setInvites] = useState([]);
  const [teamProjects, setTeamProjects] = useState([]);
  const [teamTasksMap, setTeamTasksMap] = useState({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamErr, setTeamErr] = useState('');
  const [invitesOpen, setInvitesOpen] = useState(false);
  const [nickEditUid, setNickEditUid] = useState(null);
  const [nickEditVal, setNickEditVal] = useState('');
  const [avatarPickUid, setAvatarPickUid] = useState(null);
  const [teamProjDirect, setTeamProjDirect] = useState({});

  // Vault state
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultKey, setVaultKey] = useState(null);
  const [vaultEntries, setVaultEntries] = useState([]);
  const [vaultDecrypted, setVaultDecrypted] = useState([]);
  const [vaultPwInput, setVaultPwInput] = useState('');
  const [vaultErr, setVaultErr] = useState('');
  const [vaultEditEntry, setVaultEditEntry] = useState(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultShowPw, setVaultShowPw] = useState(false);
  const [vaultSetupMode, setVaultSetupMode] = useState(null); // 'setup' | 'changePw' | 'reset-confirm'
  const [vaultResetConfirm, setVaultResetConfirm] = useState('');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteConfirmPid, setDeleteConfirmPid] = useState(null);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const dragSelectRef = useRef({ active: false, startId: null, startY: 0 });

  // Notes state
  const [notesList, setNotesList] = useState([]);
  const [activeNote, setActiveNote] = useState(null); // note id or null
  const [noteView, setNoteView] = useState('edit'); // 'edit' | 'preview'
  const [noteSearch, setNoteSearch] = useState('');
  const [noteDraft, setNoteDraft] = useState({ title: '', content: '' });
  const noteSaveRef = useRef(null);
  const [noteDeleteConfirm, setNoteDeleteConfirm] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const templatePickerRef = useRef(null);
  const noteTextareaRef = useRef(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const slashMenuRef = useRef(null);
  const [showGraph, setShowGraph] = useState(false);
  const [projPicker, setProjPicker] = useState(false);
  const projPickerRef = useRef(null);
  const graphCanvasRef = useRef(null);

  const projects = data?.projects || EMPTY;
  // Precompile project detection regexes (only recomputed when projects change)
  const projectPatterns = useMemo(() => projects.filter(p => !p.isTeam).map(p => ({
    id: p.id,
    patterns: [
      new RegExp('(?:^|\\W)' + escRe(p.name.toLowerCase()) + '(?:$|\\W)', 'i'),
      ...(p.keywords || []).map(k => new RegExp('(?:^|\\W)' + escRe(k.toLowerCase()) + '(?:$|\\W)', 'i')),
    ],
  })), [projects]);
  const tasks = data?.tasks || EMPTY;
  const activeTab = data?.activeTab || INBOX_ID;
  const isInbox = activeTab === INBOX_ID;
  const isNotes = activeTab === NOTES_ID;
  const activeProj = projects.find(p => p.id === activeTab);
  const isTeamTab = !!(activeProj?.isTeam && activeProj?.teamId);
  const teamId = activeProj?.teamId;
  const teamProjData = isTeamTab ? (teamProjDirect[teamId] || teamProjects.find(tp => tp.teamId === teamId) || null) : null;

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

  // Sort: completed tasks on TOP, active tasks below
  const sortedVisible = [...visible].sort((a, b) => {
    if (a.done === b.done) return 0;
    return a.done ? -1 : 1;
  });
  const sortedVisibleRef = useRef(sortedVisible);
  sortedVisibleRef.current = sortedVisible;

  const accent = isInbox ? '#38bdf8' : (activeProj?.color || '#38bdf8');

  const shortcuts = data?.shortcuts?.length ? data.shortcuts : DEFAULT_SHORTCUTS;
  const scIds = (data?.scOrder?.length ? data.scOrder : shortcuts.map(s => s.id));
  const scMap = new Map(shortcuts.map(s => [s.id, s]));
  const orderedSc = scIds.map(id => scMap.get(id)).filter(Boolean);

  const up = useCallback((fn) => {
    setData(prev => {
      const next = fn(prev);
      saveLocal(next);
      dataRef.current = next;
      pendingSave.current = true;
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => {
        pendingSave.current = false;
        saveToCloud(next);
      }, 400);
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
  const reorderProjects = useCallback((newProjs) => up(p => p ? { ...p, projects: newProjs } : p), [up]);

  const effectiveReorder = isTeamTab ? reorderTeamVisible : reorderVisible;
  const { containerRef, itemRefs: taskRefs, onPointerDown: onTaskDrag, getStyle: getTaskStyle, isDragging: isTaskDragging } = useDragReorder(sortedVisible, effectiveReorder);
  const { itemRefs: scRefs, onPointerDown: onScDrag, getStyle: getScStyle } = useHDragReorder(orderedSc, reorderSc);
  const { itemRefs: tabRefs, onPointerDown: onTabDrag, getStyle: getTabStyle, isDragging: isTabDragging } = useHDragReorder(projects, reorderProjects);

  // ─── Init sync ───
  useEffect(() => {
    const normalizeLoaded = (loaded) => {
      const base = loaded && Array.isArray(loaded.tasks) ? { ...DEFAULT_DATA, ...loaded } : { ...DEFAULT_DATA };
      if (Array.isArray(base.tasks)) {
        base.tasks = base.tasks.map(t => t.origin ? t : { ...t, origin: t.projectId === INBOX_ID ? 'inbox' : 'project' });
      }
      const savedShortcuts = Array.isArray(base.shortcuts) && base.shortcuts.length ? base.shortcuts : DEFAULT_SHORTCUTS;
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
      const next = { ...base, shortcuts: merged, scOrder, showSc: typeof base.showSc === 'boolean' ? base.showSc : true, activeTab: INBOX_ID };
      if (next.activeTab !== INBOX_ID && next.activeTab !== NOTES_ID && !next.projects.some(p => p.id === next.activeTab)) next.activeTab = INBOX_ID;
      return next;
    };
    initSync(
      (loaded) => { setData(prev => { const norm = normalizeLoaded(loaded); if (prev) norm.activeTab = prev.activeTab; return norm; }); setLoading(false); },
      (status) => { setSynced(status.signedIn); setAuthUser(status.user); },
      (inv) => setInvites(inv || []),
      (tp) => setTeamProjects(tp || [])
    );
    return cleanup;
  }, []);

  // Flush pending saves & reconnect Firestore on visibility/close
  useEffect(() => {
    const flushPending = () => {
      if (pendingSave.current && dataRef.current) {
        if (saveRef.current) clearTimeout(saveRef.current);
        pendingSave.current = false;
        saveToCloud(dataRef.current);
      }
    };
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPending();
      } else {
        reconnectFirestore();
      }
    };
    const onBeforeUnload = () => flushPending();
    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  // Subscribe to team tasks for ALL team projects (real-time across tabs)
  const teamIdsList = projects.filter(p => p.isTeam && p.teamId).map(p => p.teamId);
  const teamIdsKey = teamIdsList.join(',');
  useEffect(() => {
    if (teamIdsList.length === 0 || !synced) return;
    const unsubs = teamIdsList.map(tid =>
      subscribeTeamTasks(tid, (tasks) => {
        // Clear optimistic newTeamTaskIds once real data arrives from Firestore
        const realIds = new Set(tasks.map(t => t.id));
        for (const id of newTeamTaskIds.current) {
          if (realIds.has(id)) newTeamTaskIds.current.delete(id);
        }
        setTeamTasksMap(prev => ({ ...prev, [tid]: tasks }));
      })
    );
    return () => unsubs.forEach(u => u());
  }, [teamIdsKey, synced]);

  // Subscribe directly to the team project doc for nicknames/avatars
  useEffect(() => {
    if (!isTeamTab || !teamId) return;
    const unsub = subscribeTeamProject(teamId, (projData) => {
      setTeamProjDirect(prev => ({ ...prev, [teamId]: projData }));
    });
    return unsub;
  }, [isTeamTab, teamId]);

  // Subscribe to vault entries when on a team tab with a vault
  useEffect(() => {
    if (!isTeamTab || !teamId || !teamProjData?.vaultSalt) {
      setVaultEntries([]);
      return;
    }
    const unsub = subscribeVaultEntries(teamId, (entries) => {
      setVaultEntries(entries);
    });
    return unsub;
  }, [isTeamTab, teamId, !!teamProjData?.vaultSalt]);

  // Decrypt vault entries when key or entries change
  useEffect(() => {
    if (!vaultKey || vaultEntries.length === 0) {
      setVaultDecrypted([]);
      return;
    }
    let cancelled = false;
    Promise.all(vaultEntries.map(async (entry) => {
      try {
        const data = await decryptEntry(vaultKey, entry.encryptedData, entry.iv);
        return { id: entry.id, ...data };
      } catch {
        return { id: entry.id, label: '(decryption failed)', username: '', password: '', url: '' };
      }
    })).then(results => {
      if (!cancelled) setVaultDecrypted(results);
    }).catch(() => {
      if (!cancelled) {
        setVaultKey(null);
        setVaultDecrypted([]);
        setVaultErr('Decryption failed — password may have changed. Please re-unlock.');
      }
    });
    return () => { cancelled = true; };
  }, [vaultKey, vaultEntries]);

  // Clear vault state when switching away from team tab
  useEffect(() => {
    setVaultKey(null);
    setVaultDecrypted([]);
    setVaultOpen(false);
    setVaultPwInput('');
    setVaultErr('');
    setVaultEditEntry(null);
    setVaultSetupMode(null);
  }, [teamId]);

  // Subscribe to personal notes when authenticated
  useEffect(() => {
    if (!synced) { setNotesList([]); return; }
    const unsub = subscribePersonalNotes((notes) => {
      setNotesList(notes);
    });
    return unsub;
  }, [synced]);

  // Notes auto-save: debounce 800ms
  const saveNote = useCallback((noteId, title, content) => {
    if (noteSaveRef.current) clearTimeout(noteSaveRef.current);
    noteSaveRef.current = setTimeout(() => {
      const tags = extractTags(content);
      const links = extractLinks(content);
      updatePersonalNote({ noteId, patch: { title, content, tags, links } }).catch(e => console.warn('Note save failed:', e));
    }, 800);
  }, []);

  const applyFormat = useCallback((type) => {
    const ta = noteTextareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    const has = sel.length > 0;
    let before = value.slice(0, s), after = value.slice(e);
    let insert, cursorStart, cursorEnd;

    if (type === 'bold') {
      insert = has ? `**${sel}**` : '****';
      cursorStart = cursorEnd = has ? s + insert.length : s + 2;
    } else if (type === 'italic') {
      insert = has ? `*${sel}*` : '**';
      cursorStart = cursorEnd = has ? s + insert.length : s + 1;
    } else if (type === 'heading') {
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      before = value.slice(0, lineStart);
      const rest = value.slice(lineStart, e);
      after = value.slice(e);
      insert = `## ${rest}`;
      cursorStart = cursorEnd = lineStart + insert.length;
    } else if (type === 'link') {
      if (has) { insert = `[${sel}](url)`; cursorStart = s + sel.length + 3; cursorEnd = cursorStart + 3; }
      else { insert = '[](url)'; cursorStart = s + 1; cursorEnd = s + 1; }
    } else if (type === 'code') {
      if (has && sel.includes('\n')) { insert = '```\n' + sel + '\n```'; cursorStart = cursorEnd = s + insert.length; }
      else if (has) { insert = '`' + sel + '`'; cursorStart = cursorEnd = s + insert.length; }
      else { insert = '``'; cursorStart = cursorEnd = s + 1; }
    } else if (type === 'list') {
      if (has) { insert = sel.split('\n').map(l => '- ' + l).join('\n'); } else { insert = '- '; }
      cursorStart = cursorEnd = s + insert.length;
    } else if (type === 'quote') {
      if (has) { insert = sel.split('\n').map(l => '> ' + l).join('\n'); } else { insert = '> '; }
      cursorStart = cursorEnd = s + insert.length;
    } else if (type === 'wikilink') {
      insert = has ? `[[${sel}]]` : '[[]]';
      cursorStart = cursorEnd = has ? s + insert.length : s + 2;
    } else if (type === 'strikethrough') {
      insert = has ? `~~${sel}~~` : '~~~~';
      cursorStart = cursorEnd = has ? s + insert.length : s + 2;
    } else if (type === 'highlight') {
      insert = has ? `==${sel}==` : '====';
      cursorStart = cursorEnd = has ? s + insert.length : s + 2;
    } else return;

    const newContent = before + insert + after;
    setNoteDraft(d => ({ ...d, content: newContent }));
    saveNote(activeNote, noteDraft.title, newContent);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(cursorStart, cursorEnd); });
  }, [activeNote, noteDraft.title, saveNote]);

  // Ctrl+E to toggle edit/preview when a note is open
  useEffect(() => {
    if (!activeNote || activeTab !== NOTES_ID) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setNoteView(v => v === 'edit' ? 'preview' : 'edit');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeNote, activeTab]);

  // Close template picker on click outside
  useEffect(() => {
    if (!showTemplatePicker) return;
    const handler = (e) => {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target)) setShowTemplatePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTemplatePicker]);

  // Close project picker on outside click
  useEffect(() => {
    if (!projPicker) return;
    const handler = (e) => { if (projPickerRef.current && !projPickerRef.current.contains(e.target)) setProjPicker(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [projPicker]);

  // Close slash menu on outside click
  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e) => { if (slashMenuRef.current && !slashMenuRef.current.contains(e.target)) setSlashMenu(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashMenu]);

  const applySlashCommand = useCallback((cmd) => {
    const ta = noteTextareaRef.current;
    if (!ta || !slashMenu) return;
    const val = ta.value;
    const pos = ta.selectionStart;
    // Find the start of current line
    const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
    // Replace /filter text on current line with command insert
    const before = val.slice(0, lineStart);
    const afterSlash = val.slice(pos);
    const newContent = before + cmd.insert + afterSlash;
    setNoteDraft(d => ({ ...d, content: newContent }));
    saveNote(activeNote, noteDraft.title, newContent);
    setSlashMenu(null);
    requestAnimationFrame(() => { ta.focus(); const p = lineStart + cmd.cursor; ta.setSelectionRange(p, p); });
  }, [slashMenu, activeNote, noteDraft.title, saveNote]);

  // Backlinks for the active note
  const activeNoteData = activeNote ? notesList.find(n => n.id === activeNote) : null;
  const backlinks = useMemo(() => {
    if (!activeNoteData) return [];
    const title = activeNoteData.title?.toLowerCase();
    if (!title) return [];
    return notesList.filter(n => n.id !== activeNote && n.links?.some(l => l.toLowerCase() === title));
  }, [notesList, activeNote, activeNoteData?.title]);

  // Filtered notes for search
  const filteredNotes = useMemo(() => {
    if (!noteSearch.trim()) return notesList;
    const q = noteSearch.toLowerCase();
    return notesList.filter(n =>
      (n.title || '').toLowerCase().includes(q) ||
      (n.content || '').toLowerCase().includes(q) ||
      (n.tags || []).some(t => t.includes(q))
    );
  }, [notesList, noteSearch]);

  // Graph data
  const graphData = useMemo(() => {
    if (!notesList.length) return { nodes: [], edges: [] };
    const titleMap = new Map();
    notesList.forEach(n => { if (n.title) titleMap.set(n.title.toLowerCase(), n.id); });
    const edgeSet = new Set();
    const edges = [];
    const inCount = {};
    notesList.forEach(n => {
      (n.links || []).forEach(link => {
        const targetId = titleMap.get(link.toLowerCase());
        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join(':');
          if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ source: n.id, target: targetId }); }
          inCount[targetId] = (inCount[targetId] || 0) + 1;
          inCount[n.id] = (inCount[n.id] || 0) + 1;
        }
      });
    });
    const nodes = notesList.map(n => ({ id: n.id, title: n.title || 'Untitled', linkCount: inCount[n.id] || 0 }));
    return { nodes, edges };
  }, [notesList]);

  const createNote = useCallback(async (opts = {}) => {
    try {
      const id = await createPersonalNote({
        title: opts.title || 'Untitled',
        content: opts.content || '',
        tags: [],
        links: [],
        pinned: false,
        dailyDate: opts.dailyDate || null,
      });
      setActiveNote(id);
      setNoteDraft({ title: opts.title || 'Untitled', content: opts.content || '' });
      setNoteView('edit');
      setNoteDeleteConfirm(false);
    } catch (e) {
      console.warn('Create note failed:', e);
    }
  }, []);

  const openDailyNote = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const existing = notesList.find(n => n.dailyDate === today);
    if (existing) {
      setActiveNote(existing.id);
      setNoteDraft({ title: existing.title, content: existing.content || '' });
      setNoteView(existing.content ? 'preview' : 'edit');
    } else {
      const d = new Date();
      const title = `Daily - ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      createNote({ title, dailyDate: today });
    }
  }, [notesList, createNote]);

  const handleNoteClick = useCallback((noteId) => {
    const note = notesList.find(n => n.id === noteId);
    if (note) {
      setActiveNote(noteId);
      setNoteDraft({ title: note.title || '', content: note.content || '' });
      setNoteView(note.content ? 'preview' : 'edit');
      setNoteDeleteConfirm(false);
    }
  }, [notesList]);

  // Graph force simulation
  useEffect(() => {
    if (!showGraph) return;
    const canvas = graphCanvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const { nodes: gNodes, edges: gEdges } = graphData;
    if (!gNodes.length) return;

    const W = () => canvas.width / dpr;
    const H = () => canvas.height / dpr;

    const simNodes = gNodes.map((n) => ({
      ...n,
      x: W() / 2 + (Math.random() - 0.5) * W() * 0.6,
      y: H() / 2 + (Math.random() - 0.5) * H() * 0.6,
      vx: 0, vy: 0,
      radius: 5 + Math.sqrt(n.linkCount) * 2.5,
      opacity: 0,
    }));
    const nodeMap = new Map(simNodes.map(n => [n.id, n]));

    let zoom = 1, panX = 0, panY = 0;
    let hoveredId = null, dragNode = null, isDragging = false;
    let mouseX = 0, mouseY = 0;

    const screenToWorld = (sx, sy) => ({ x: (sx - panX) / zoom, y: (sy - panY) / zoom });
    const worldToScreen = (wx, wy) => ({ x: wx * zoom + panX, y: wy * zoom + panY });

    const getNodeAt = (sx, sy) => {
      const { x, y } = screenToWorld(sx, sy);
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const n = simNodes[i];
        const dx = n.x - x, dy = n.y - y;
        const hitR = Math.max(n.radius + 8, 18);
        // Circle hitbox for the node itself
        if (dx * dx + dy * dy < hitR * hitR) return n;
        // Rectangular hitbox for the label below (extends ~22px below node center)
        if (Math.abs(dx) < hitR + 20 && dy > 0 && dy < n.radius + 24) return n;
      }
      return null;
    };

    const onWheel = (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.2, Math.min(4, zoom * zoomFactor));
      panX = mx - (mx - panX) * (newZoom / zoom);
      panY = my - (my - panY) * (newZoom / zoom);
      zoom = newZoom;
    };

    let isPanning = false, panStartX = 0, panStartY = 0, panStartPX = 0, panStartPY = 0;
    const onMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
      if (e.button === 1 || e.button === 2) {
        isPanning = true; panStartX = mouseX; panStartY = mouseY; panStartPX = panX; panStartPY = panY;
        e.preventDefault(); return;
      }
      if (e.button === 0) {
        const n = getNodeAt(mouseX, mouseY);
        if (n) { dragNode = n; isDragging = false; e.preventDefault(); }
      }
    };
    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
      if (isPanning) { panX = panStartPX + (mouseX - panStartX); panY = panStartPY + (mouseY - panStartY); return; }
      if (dragNode) {
        isDragging = true;
        const { x, y } = screenToWorld(mouseX, mouseY);
        dragNode.x = x; dragNode.y = y; dragNode.vx = 0; dragNode.vy = 0;
        return;
      }
      hoveredId = getNodeAt(mouseX, mouseY)?.id || null;
      canvas.style.cursor = hoveredId ? 'pointer' : 'grab';
    };
    const onMouseUp = () => {
      if (isPanning) { isPanning = false; return; }
      if (dragNode && !isDragging) {
        const nId = dragNode.id;
        dragNode = null;
        handleNoteClick(nId);
        setShowGraph(false);
        return;
      }
      dragNode = null; isDragging = false;
    };
    const onCtxMenu = (e) => e.preventDefault();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onCtxMenu);

    const getNeighbors = (nodeId) => {
      const s = new Set();
      gEdges.forEach(e => { if (e.source === nodeId) s.add(e.target); if (e.target === nodeId) s.add(e.source); });
      return s;
    };

    let animId;
    const draw = () => {
      animId = requestAnimationFrame(draw);
      const w = W(), h = H();

      for (let i = 0; i < simNodes.length; i++) {
        const a = simNodes[i];
        if (a === dragNode) continue;
        const cx = w / 2, cy = h / 2;
        a.vx += (cx - a.x) * 0.01;
        a.vy += (cy - a.y) * 0.01;
        for (let j = i + 1; j < simNodes.length; j++) {
          const b = simNodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = a.radius + b.radius + 2;
          if (dist < minDist) dist = minDist;
          const force = 3000 / (dist * dist);
          const fx = dx / dist * force, fy = dy / dist * force;
          a.vx += fx; a.vy += fy;
          if (b !== dragNode) { b.vx -= fx; b.vy -= fy; }
        }
      }
      gEdges.forEach(e => {
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 100) * 0.04;
        const fx = dx / dist * force, fy = dy / dist * force;
        if (a !== dragNode) { a.vx += fx; a.vy += fy; }
        if (b !== dragNode) { b.vx -= fx; b.vy -= fy; }
      });
      simNodes.forEach(n => {
        if (n === dragNode) return;
        n.vx *= 0.88; n.vy *= 0.88;
        n.x += n.vx; n.y += n.vy;
        if (n.opacity < 1) n.opacity = Math.min(1, n.opacity + 0.05);
      });

      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, '#0a0a0a');
      grad.addColorStop(1, '#111');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const neighbors = hoveredId ? getNeighbors(hoveredId) : new Set();

      gEdges.forEach(e => {
        const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
        if (!a || !b) return;
        const sa = worldToScreen(a.x, a.y), sb = worldToScreen(b.x, b.y);
        const isHighlight = hoveredId && (e.source === hoveredId || e.target === hoveredId);
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.strokeStyle = isHighlight ? '#a78bfa44' : '#2a2a2a';
        ctx.lineWidth = isHighlight ? 1.5 : 1;
        ctx.stroke();
      });

      simNodes.forEach(n => {
        const { x: sx, y: sy } = worldToScreen(n.x, n.y);
        const r = n.radius * zoom;
        if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) return;

        const isActive = activeNote === n.id;
        const isHovered = hoveredId === n.id;
        const isNeighbor = hoveredId && neighbors.has(n.id);
        const isDim = hoveredId && !isHovered && !isNeighbor && hoveredId !== n.id;

        ctx.globalAlpha = n.opacity * (isDim ? 0.3 : 1);

        if (isActive || isHovered) {
          ctx.shadowBlur = isActive ? 12 : 8;
          ctx.shadowColor = isActive ? '#a78bfa66' : '#a78bfa44';
        }

        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#444' : isActive ? '#a78bfa33' : isNeighbor ? '#383838' : '#333';
        ctx.fill();
        ctx.strokeStyle = isHovered || isActive ? '#a78bfa' : isNeighbor ? '#666' : '#555';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';

        if (zoom > 0.6) {
          const label = n.title.length > 20 ? n.title.slice(0, 20) + '…' : n.title;
          ctx.font = `${isHovered ? 11 : 10}px 'IBM Plex Mono', monospace`;
          ctx.fillStyle = isHovered ? '#e8e8e8' : isDim ? '#444' : '#888';
          ctx.textAlign = 'center';
          ctx.fillText(label, sx, sy + r + 12);
        }

        ctx.globalAlpha = 1;
      });

      ctx.font = "10px 'IBM Plex Mono', monospace";
      ctx.fillStyle = '#444';
      ctx.textAlign = 'left';
      ctx.fillText(`${gNodes.length} notes · ${gEdges.length} connections`, 10, h - 10);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('contextmenu', onCtxMenu);
    };
  }, [showGraph, graphData, activeNote, handleNoteClick]);

  const handleWikilinkClick = useCallback((noteName) => {
    const existing = notesList.find(n => (n.title || '').toLowerCase() === noteName.toLowerCase());
    if (existing) {
      handleNoteClick(existing.id);
    } else {
      createNote({ title: noteName });
    }
  }, [notesList, handleNoteClick, createNote]);

  const handleDeleteNote = useCallback(async () => {
    if (!activeNote) return;
    try {
      await deletePersonalNote({ noteId: activeNote });
      setActiveNote(null);
      setNoteDraft({ title: '', content: '' });
      setNoteDeleteConfirm(false);
    } catch (e) {
      console.warn('Delete note failed:', e);
    }
  }, [activeNote]);

  useEffect(() => {
    checkForUpdates().then(info => {
      if (info?.isUpdateAvailable) setUpdateInfo(info);
    }).catch(() => {});
  }, []);

  // ─── Ctrl+Z undo / Ctrl+C copy / Ctrl+A select ───
  useEffect(() => {
    const handler = (e) => {
      const sel = selectedIdsRef.current;
      const sorted = sortedVisibleRef.current;

      // Escape: clear selection
      if (e.key === 'Escape' && sel.size > 0 && !e.target.closest('input, textarea')) {
        setSelectedIds(new Set());
        return;
      }

      if (!e.ctrlKey && !e.metaKey) return;
      if (e.target.closest('input, textarea')) return;

      // Ctrl+Z: undo
      if (e.key === 'z') {
        e.preventDefault();
        const entry = undoStackRef.current.pop();
        if (!entry) return;
        if (entry._teamId) {
          updateTeamTask({ teamId: entry._teamId, taskId: entry._taskId, patch: { deleted: false } }).catch(e => console.warn(e));
        } else {
          up(p => {
            const all = [...p.tasks];
            const idx = Math.min(entry._undoIdx ?? all.length, all.length);
            const restored = { ...entry }; delete restored._undoIdx;
            all.splice(idx, 0, restored);
            return { ...p, tasks: all };
          });
        }
        return;
      }

      // Ctrl+A: select all visible tasks
      if (e.key === 'a') {
        e.preventDefault();
        setSelectedIds(new Set(sorted.map(t => t.id)));
        return;
      }

      // Ctrl+C: copy selected task texts
      if (e.key === 'c' && sel.size > 0) {
        e.preventDefault();
        const texts = sorted.filter(t => sel.has(t.id)).map(t => t.text).join('\n\n');
        navigator.clipboard.writeText(texts).catch(() => {});
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [up]);

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
  useEffect(() => {
    const h = (e) => {
      if (e.target.closest('.tp-ctx')) return;
      setContextMenu(null);
    };
    window.addEventListener('click', h);
    window.addEventListener('touchstart', h, { passive: true });
    return () => { window.removeEventListener('click', h); window.removeEventListener('touchstart', h); };
  }, []);
  useEffect(() => { if (!scUnlocked) return; const h = (e) => { if (!e.target.closest('.sc-bar')) setScUnlocked(false); }; window.addEventListener('mouseup', h); return () => window.removeEventListener('mouseup', h); }, [scUnlocked]);

  // Clear selection when switching tabs (must be before early return to satisfy Rules of Hooks)
  useEffect(() => { setSelectedIds(prev => prev.size > 0 ? new Set() : prev); }, [activeTab]);

  // Drag-to-select callbacks (hooks must be before early return)
  const onDragSelectStart = useCallback((id, y) => {
    dragSelectRef.current = { active: false, startId: id, startY: y };
  }, []);
  const onDragSelectEnter = useCallback((id) => {
    const ds = dragSelectRef.current;
    if (!ds.startId || !ds.active) return;
    const sorted = sortedVisibleRef.current;
    const startIdx = sorted.findIndex(t => t.id === ds.startId);
    const endIdx = sorted.findIndex(t => t.id === id);
    if (startIdx < 0 || endIdx < 0) return;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    setSelectedIds(new Set(sorted.slice(lo, hi + 1).map(t => t.id)));
  }, []);
  useEffect(() => {
    const onMove = (e) => {
      const ds = dragSelectRef.current;
      if (!ds.startId) return;
      if (!ds.active && Math.abs(e.clientY - ds.startY) > 5) {
        ds.active = true;
        setSelectedIds(new Set([ds.startId]));
      }
    };
    const onUp = () => {
      const wasActive = dragSelectRef.current.active;
      dragSelectRef.current = { active: false, startId: null, startY: 0, justEnded: wasActive };
      if (wasActive) setTimeout(() => { dragSelectRef.current.justEnded = false; }, 0);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  // ─── Tab touch long-press (iOS context menu) ───
  const tabTouchRef = useRef({ timer: null, pid: null, startX: 0, startY: 0, moved: false, longPressed: false });

  // Project-Note linking (hooks must be before early return)
  const linkNoteToProject = useCallback((noteId, projectId) => {
    updatePersonalNote({ noteId, patch: { projectId } }).catch(e => console.warn('Link note failed:', e));
  }, []);
  const unlinkNoteFromProject = useCallback((noteId) => {
    updatePersonalNote({ noteId, patch: { projectId: null } }).catch(e => console.warn('Unlink note failed:', e));
  }, []);
  const projectNotes = useMemo(() => {
    if (!data || !notesList.length) return EMPTY;
    const at = data?.activeTab;
    if (!at || at === INBOX_ID || at === NOTES_ID) return EMPTY;
    const proj = (data?.projects || []).find(p => p.id === at);
    if (proj?.isTeam) return EMPTY;
    return notesList.filter(n => n.projectId === at);
  }, [notesList, data]);

  if (loading || !data) return <div className="loading">Loading TaskPad...</div>;

  // ─── Task operations ───
  const detectProject = (text) => {
    const low = text.toLowerCase();
    for (const { id, patterns } of projectPatterns) {
      if (patterns.some(re => re.test(low))) return id;
    }
    return null;
  };

  const insertTask = (afterTaskId) => {
    // If clicking after a done task, insert as first undone (top of list, sort handles the rest)
    if (afterTaskId) {
      const clickedTask = sortedVisible.find(t => t.id === afterTaskId);
      if (clickedTask?.done) afterTaskId = null;
    }

    if (isTeamTab && teamId) {
      const sorted = sortedVisible;
      const afterIdx = afterTaskId ? sorted.findIndex(t => t.id === afterTaskId) : -1;
      const afterTask = afterIdx >= 0 ? sorted[afterIdx] : null;
      // For team: compute order between afterTask and the next non-done task
      const nextUndone = sorted.find((t, i) => i > afterIdx && !t.done);
      const afterOrder = afterTask ? (afterTask.order ?? afterIdx) : -1;
      const nextOrder = nextUndone ? (nextUndone.order ?? afterOrder + 2) : afterOrder + 2;
      const newOrder = afterOrder + (nextOrder - afterOrder) / 2;
      const preId = genTeamTaskId(teamId);
      if (preId) {
        newTeamTaskIds.current.add(preId);
        const optimistic = { id: preId, text: '', done: false, deleted: false, order: newOrder, _new: true, _optimistic: true,
          createdByUid: authUser?.uid, createdByEmail: authUser?.email, ts: { seconds: Date.now() / 1000 } };
        setTeamTasksMap(prev => {
          const existing = prev[teamId] || [];
          const insertAt = afterTaskId ? existing.findIndex(t => t.id === afterTaskId) + 1 : 0;
          const next = [...existing];
          next.splice(Math.max(0, insertAt), 0, optimistic);
          return { ...prev, [teamId]: next };
        });
      }
      createTeamTask({ teamId, text: '', order: newOrder, taskId: preId }).catch(e => console.warn('Team task create failed:', e));
      return;
    }
    const origin = isInbox ? 'inbox' : 'project';
    const nt = { id: genId(), text: '', done: false, projectId: isInbox ? INBOX_ID : activeTab, origin, ts: Date.now(), _new: true };
    up(prev => {
      const all = [...prev.tasks];
      const vis = isInbox
        ? all.filter(t => (t.origin || (t.projectId === INBOX_ID ? 'inbox' : 'project')) === 'inbox' && !t.hiddenFromInbox)
        : all.filter(t => t.projectId === prev.activeTab);

      if (!afterTaskId) {
        // Insert at top of this view
        const first = vis[0];
        all.splice(Math.max(0, first ? all.indexOf(first) : 0), 0, nt);
      } else {
        const refIdx = all.findIndex(t => t.id === afterTaskId);
        all.splice(refIdx >= 0 ? refIdx + 1 : all.length, 0, nt);
      }
      return { ...prev, tasks: all };
    });
  };

  const changeTask = (id, text) => {
    if (isTeamTab && teamId) {
      newTeamTaskIds.current.delete(id);
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
      if (origin === 'inbox') { const d = detectProject(text); if (d) pid = d; else pid = INBOX_ID; }
      const updated = { ...existing, text, projectId: pid, origin, _new: false };
      // If task was newly matched to a project, move it to end so it appears at bottom of that project
      if (pid !== INBOX_ID && pid !== existing?.projectId) {
        const without = prev.tasks.filter(t => t.id !== id);
        return { ...prev, tasks: [...without, updated] };
      }
      return { ...prev, tasks: prev.tasks.map(t => t.id === id ? updated : t) };
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
      const task = (teamTasksMap[teamId] || []).find(t => t.id === id);
      if (task) {
        undoStackRef.current.push({ _teamId: teamId, _taskId: id });
        if (undoStackRef.current.length > 30) undoStackRef.current.shift();
      }
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

  const onSelectTask = (id, mode) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (mode === 'toggle') {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
  };

  const deleteSelected = () => {
    const ids = selectedIds;
    if (isTeamTab && teamId) {
      ids.forEach(id => deleteTeamTask({ teamId, taskId: id }).catch(() => {}));
    } else {
      up(p => ({ ...p, tasks: p.tasks.filter(t => !ids.has(t.id)) }));
    }
    setSelectedIds(new Set());
    setDeleteConfirm(false);
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
  const deleteProject = async (id) => {
    const pr = projects.find(p => p.id === id);
    if (pr?.isTeam && pr?.teamId) {
      setTeamBusy(true); setTeamErr('');
      try {
        await deleteTeamProject({ teamId: pr.teamId });
      } catch (e) {
        setTeamErr(e?.message || 'Failed to delete project');
        setTeamBusy(false);
        setDeleteConfirmPid(null);
        return;
      }
      setTeamBusy(false);
    }
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
    setDeleteConfirmPid(null);
    setContextMenu(null);
  };
  const finishEditTab = () => { if (!editingTab) return; const name = editTabName.trim() || 'Untitled'; up(p => ({ ...p, projects: p.projects.map(x => x.id === editingTab ? { ...x, name, keywords: [...new Set([...(x.keywords || []), name.toLowerCase()])] } : x) })); setEditingTab(null); };
  const changeTabColor = (id, color) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === id ? { ...x, color } : x) })); setContextMenu(null); };
  const addKeyword = (pid, kw) => { if (!kw.trim()) return; up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: [...new Set([...(x.keywords || []), kw.trim().toLowerCase()])] } : x) })); };
  const removeKeyword = (pid, kw) => { up(p => ({ ...p, projects: p.projects.map(x => x.id === pid ? { ...x, keywords: (x.keywords || []).filter(k => k !== kw) } : x) })); };

  const tabTouchStart = (e, pid) => {
    const t = e.touches[0];
    const ref = tabTouchRef.current;
    ref.pid = pid; ref.startX = t.clientX; ref.startY = t.clientY; ref.moved = false; ref.longPressed = false;
    clearTimeout(ref.timer);
    ref.timer = setTimeout(() => {
      ref.timer = null;
      ref.longPressed = true;
      // Long press → context menu
      setContextMenu({ x: ref.startX, y: ref.startY + 30, pid });
      setTeamErr('');
    }, 500);
  };
  const tabTouchMove = (e, pid) => {
    const ref = tabTouchRef.current;
    if (!ref.timer) return;
    const t = e.touches[0];
    const dx = t.clientX - ref.startX, dy = t.clientY - ref.startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(ref.timer); ref.timer = null; ref.moved = true;
      // Start drag
      onTabDrag(e, pid, t.clientX);
    }
  };
  const tabTouchEnd = () => {
    clearTimeout(tabTouchRef.current.timer);
    tabTouchRef.current.timer = null;
  };

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
    setTeamBusy(true); setTeamErr(''); setInviteResult(null);
    try {
      await sendTeamInvite({ teamId: tid, toEmail: inviteEmail.trim() });
      setInviteResult({ ok: true, msg: `Invite sent to ${inviteEmail.trim()}` });
      setInviteEmail('');
    } catch (e) {
      const msg = e?.message || String(e);
      setInviteResult({ ok: false, msg });
      setTeamErr(msg);
    } finally { setTeamBusy(false); setTimeout(() => setInviteResult(null), 3000); }
  };

  const handleAcceptInvite = async (inviteId) => {
    setTeamBusy(true); setTeamErr('');
    try {
      await acceptTeamInvite({ inviteId });
      setInvitesOpen(false);
      // Reload to pick up new team tab
      window.location.reload();
    } catch (e) {
      console.warn(e);
      setTeamErr(e?.message || 'Failed to accept invite');
    } finally { setTeamBusy(false); }
  };
  const handleDeclineInvite = async (inviteId) => { try { await declineTeamInvite({ inviteId }); } catch (e) { console.warn(e); } };

  const saveNickname = async (tid, uid, nick) => {
    try { await updateTeamProject({ teamId: tid, patch: { [`nicknames.${uid}`]: nick.trim() || uid } }); } catch (e) { console.warn(e); }
    setNickEditUid(null);
  };

  const setAvatar = async (tid, uid, avatarId) => {
    try { await updateTeamProject({ teamId: tid, patch: { [`avatars.${uid}`]: avatarId } }); } catch (e) { console.warn(e); }
    setAvatarPickUid(null);
  };

  // ─── Vault operations ───
  const handleVaultSetup = async (password) => {
    if (!password || !teamId) return;
    setVaultBusy(true); setVaultErr('');
    try {
      const salt = generateSalt();
      const key = await deriveKey(password, salt);
      const { verifier, verifierIv } = await createVerifier(key);
      await initVault({ teamId, salt: toBase64(salt), verifier, verifierIv });
      setVaultKey(key);
      setVaultSetupMode(null);
      setVaultPwInput('');
    } catch (e) {
      setVaultErr(e?.message || 'Vault setup failed');
    } finally { setVaultBusy(false); }
  };

  const handleVaultUnlock = async () => {
    if (!vaultPwInput || !teamProjData) return;
    setVaultBusy(true); setVaultErr('');
    try {
      const salt = fromBase64(teamProjData.vaultSalt);
      const key = await deriveKey(vaultPwInput, salt);
      const ok = await checkVerifier(key, teamProjData.vaultVerifier, teamProjData.vaultVerifierIv);
      if (!ok) { setVaultErr('Wrong password'); setVaultBusy(false); return; }
      setVaultKey(key);
      setVaultPwInput('');
    } catch (e) {
      setVaultErr('Unlock failed');
    } finally { setVaultBusy(false); }
  };

  const handleVaultAddEntry = async (entry) => {
    if (!vaultKey || !teamId) return;
    setVaultBusy(true); setVaultErr('');
    try {
      const { encryptedData, iv } = await encryptEntry(vaultKey, entry);
      await createVaultEntry({ teamId, encryptedData, iv });
      setVaultEditEntry(null);
    } catch (e) {
      setVaultErr(e?.message || 'Failed to add entry');
    } finally { setVaultBusy(false); }
  };

  const handleVaultUpdateEntry = async (entryId, entry) => {
    if (!vaultKey || !teamId) return;
    setVaultBusy(true); setVaultErr('');
    try {
      const { encryptedData, iv } = await encryptEntry(vaultKey, entry);
      await updateVaultEntry({ teamId, entryId, encryptedData, iv });
      setVaultEditEntry(null);
    } catch (e) {
      setVaultErr(e?.message || 'Failed to update entry');
    } finally { setVaultBusy(false); }
  };

  const handleVaultDeleteEntry = async (entryId) => {
    if (!teamId) return;
    setVaultBusy(true);
    try {
      await deleteVaultEntry({ teamId, entryId });
    } catch (e) {
      setVaultErr(e?.message || 'Failed to delete entry');
    } finally { setVaultBusy(false); }
  };

  const handleVaultReset = async () => {
    if (!teamId) return;
    setVaultBusy(true); setVaultErr('');
    try {
      await resetVault({ teamId });
      setVaultKey(null);
      setVaultDecrypted([]);
      setVaultEntries([]);
      setVaultSetupMode(null);
    } catch (e) {
      setVaultErr(e?.message || 'Reset failed');
    } finally { setVaultBusy(false); }
  };

  const handleVaultChangePw = async (oldPw, newPw) => {
    if (!teamId || !teamProjData) return;
    setVaultBusy(true); setVaultErr('');
    try {
      // Verify old password
      const oldSalt = fromBase64(teamProjData.vaultSalt);
      const oldKey = await deriveKey(oldPw, oldSalt);
      const ok = await checkVerifier(oldKey, teamProjData.vaultVerifier, teamProjData.vaultVerifierIv);
      if (!ok) { setVaultErr('Current password is wrong'); setVaultBusy(false); return; }

      // Decrypt all entries with old key
      const decrypted = await Promise.all(vaultEntries.map(async (e) => {
        const data = await decryptEntry(oldKey, e.encryptedData, e.iv);
        return { id: e.id, data };
      }));

      // New key
      const newSalt = generateSalt();
      const newKey = await deriveKey(newPw, newSalt);
      const { verifier, verifierIv } = await createVerifier(newKey);

      // Re-encrypt all entries
      const reEncrypted = await Promise.all(decrypted.map(async ({ id, data }) => {
        const { encryptedData, iv } = await encryptEntry(newKey, data);
        return { id, encryptedData, iv };
      }));

      // Batch write: update project doc + all vault entries
      // Using individual writes since writeBatch is not exported from sync
      await initVault({ teamId, salt: toBase64(newSalt), verifier, verifierIv });
      for (const { id, encryptedData, iv } of reEncrypted) {
        await updateVaultEntry({ teamId, entryId: id, encryptedData, iv });
      }

      setVaultKey(newKey);
      setVaultSetupMode(null);
      setVaultPwInput('');
    } catch (e) {
      setVaultErr(e?.message || 'Password change failed');
    } finally { setVaultBusy(false); }
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
      {swUpdate && (
        <div className="update-banner">
          <span>v{swUpdate.version || 'new'} available<span className="update-sub"> — Refresh to get new features</span></span>
          <div className="update-actions">
            <button className="update-dl" onClick={() => window.__swUpdate?.()}>Refresh</button>
            <button className="update-x" onClick={() => setSwUpdate(null)}>×</button>
          </div>
        </div>
      )}

      <header className="tp-hdr">
        <div className="tp-hdr-l">
          <h1 className="tp-name">TaskPad</h1>
          <span className="tp-ver">v1.9.1</span>
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
        <button className="tp-sc-toggle" onClick={() => up(p => ({ ...p, showSc: !p.showSc }))}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{data.showSc ? <><rect x="1" y="1" width="14" height="14" rx="2"/><line x1="8" y1="1" x2="8" y2="15"/></> : <rect x="1" y="1" width="14" height="14" rx="2"/>}</svg></button>
      </header>

      {/* Auth modal */}
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

      {/* Invites modal */}
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
                    <span className="invite-proj">Project: {inv.projectName || inv.projectId}</span>
                  </div>
                  <div className="invite-actions">
                    <button className="invite-accept" disabled={teamBusy} onClick={() => handleAcceptInvite(inv.id)}>Accept</button>
                    <button className="invite-decline" onClick={() => handleDeclineInvite(inv.id)}>Decline</button>
                  </div>
                </div>
              ))}
              {teamErr && <div className="tp-modal-err" style={{ padding: '6px 0', fontSize: 11 }}>{teamErr}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ─── Nav with draggable tabs ─── */}
      <nav className="tp-nav"><div className="tp-nav-scroll">
        <button className={`tp-t tp-t-special tp-t-notes ${isNotes ? 'tp-t-on' : ''}`} onClick={() => { up(p => ({ ...p, activeTab: NOTES_ID })); setActiveNote(null); }} style={{ borderBottomColor: isNotes ? '#a78bfa' : 'transparent' }}>
          <svg className="tp-t-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Notes
          {notesList.length > 0 && <span className="tp-tc">{notesList.length}</span>}
        </button>
        <button className={`tp-t tp-t-special tp-t-cockpit ${isInbox ? 'tp-t-on' : ''}`} onClick={() => { up(p => ({ ...p, activeTab: INBOX_ID })); setActiveNote(null); }} style={{ borderBottomColor: isInbox ? '#38bdf8' : 'transparent' }}>
          <svg className="tp-t-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Cockpit
          {isInbox && inboxVisible.filter(t => !t.done).length > 0 && <span className="tp-tc">{inboxVisible.filter(t => !t.done).length}</span>}
        </button>
        {projects.map(pr => (
          <div key={pr.id} ref={el => { if (el) tabRefs.current[pr.id] = el; else delete tabRefs.current[pr.id]; }} style={{ ...getTabStyle(pr.id), flexShrink: 0 }}>
            {editingTab === pr.id ? (
              <input ref={editTabRef} className="tp-t tp-t-edit" value={editTabName} onChange={e => setEditTabName(e.target.value)} onBlur={finishEditTab}
                onKeyDown={e => { if (e.key === 'Enter') finishEditTab(); if (e.key === 'Escape') setEditingTab(null); }}
                style={{ borderBottomColor: pr.color, width: Math.max(70, editTabName.length * 9) }} />
            ) : (
              <button className={`tp-t ${activeTab === pr.id ? 'tp-t-on' : ''}`}
                onClick={() => { if (!isTabDragging && !tabTouchRef.current.longPressed) { up(p => ({ ...p, activeTab: pr.id })); setActiveNote(null); } tabTouchRef.current.longPressed = false; }}
                onMouseDown={e => { if (e.button === 0) onTabDrag(e, pr.id); }}
                onTouchStart={e => tabTouchStart(e, pr.id)}
                onTouchMove={e => tabTouchMove(e, pr.id)}
                onTouchEnd={tabTouchEnd}
                onDoubleClick={() => { setEditingTab(pr.id); setEditTabName(pr.name); }}
                onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, pid: pr.id }); setTeamErr(''); }}
                style={{ borderBottomColor: activeTab === pr.id ? pr.color : 'transparent', background: activeTab === pr.id ? pr.color + '0a' : 'transparent', cursor: 'grab' }}>
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

      {/* Context menu */}
      {contextMenu && (() => {
        const pr = projects.find(p => p.id === contextMenu.pid); if (!pr) return null;
        const tp = pr.isTeam ? (teamProjDirect[pr.teamId] || teamProjects.find(t => t.teamId === pr.teamId) || null) : null;
        return (
          <div className="tp-ctx" style={{ left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.max(10, Math.min(contextMenu.y, window.innerHeight - 300)) }} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
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
            {pr.isTeam && (
              <div className="ctx-team-section">
                <span className="ctx-kw-lbl">👥 Team Project</span>
                {!tp && <div className="ctx-team-note">Loading team data…</div>}
                <div className="team-members">
                  {(tp?.memberEmails || []).map((email, i) => {
                    const uid = (tp?.memberUids || [])[i];
                    const nick = tp?.nicknames?.[uid] || email.split('@')[0];
                    const avId = tp?.avatars?.[uid];
                    const av = avId !== undefined ? AVATARS[avId] : null;
                    return (
                      <div key={email} className="team-member">
                        <div className="team-member-av" onClick={() => setAvatarPickUid(avatarPickUid === uid ? null : uid)}>
                          {av ? <img src={av.src} alt="" className="av-img" style={{ borderColor: av.color }} /> : <span className="av-empty">?</span>}
                        </div>
                        <div className="team-member-main">
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
                          {avatarPickUid === uid && (
                            <div className="av-picker">
                              {AVATARS.map(a => (
                                <button key={a.id} className={`av-opt ${avId === a.id ? 'av-opt-on' : ''}`} title={a.name}
                                  style={{ borderColor: avId === a.id ? a.color : 'transparent' }}
                                  onClick={() => setAvatar(pr.teamId, uid, a.id)}>
                                  <img src={a.src} alt={a.name} width="20" height="25" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="team-invite">
                  <input className="kw-in" placeholder="Invite by email + Enter" value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendInvite(pr.teamId); }} />
                  {inviteResult && (
                    <div className="invite-toast" style={{ color: inviteResult.ok ? '#22c55e' : '#ef4444', borderColor: inviteResult.ok ? '#22c55e44' : '#ef444444' }}>
                      {inviteResult.ok ? '✓' : '✕'} {inviteResult.msg}
                    </div>
                  )}
                </div>
                {tp && !tp.vaultSalt && tp.ownerUid === authUser?.uid && (
                  <button className="ctx-it" onClick={() => { setVaultSetupMode('setup'); setVaultPwInput(''); setVaultErr(''); setContextMenu(null); }}>🔒 Set Up Vault</button>
                )}
                {tp && tp.vaultSalt && tp.ownerUid === authUser?.uid && (
                  <button className="ctx-it" onClick={() => { setVaultSetupMode('changePw'); setVaultPwInput(''); setVaultErr(''); setContextMenu(null); }}>🔒 Vault Settings</button>
                )}
              </div>
            )}
            {teamErr && <div className="tp-modal-err" style={{ padding: '4px 12px', fontSize: 11 }}>{teamErr}</div>}
            {(!pr.isTeam || tp?.ownerUid === authUser?.uid) && (
              deleteConfirmPid === pr.id ? (
                <div className="ctx-del-confirm">
                  <span>Delete "{pr.name}"?{pr.isTeam ? ' This removes all team tasks.' : ''}</span>
                  <div className="ctx-del-confirm-btns">
                    <button className="ctx-it ctx-del" disabled={teamBusy} onClick={() => deleteProject(pr.id)}>
                      {teamBusy ? 'Deleting…' : 'Yes, delete'}
                    </button>
                    <button className="ctx-it" onClick={() => setDeleteConfirmPid(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="ctx-it ctx-del" onClick={() => setDeleteConfirmPid(pr.id)}>🗑 Delete project</button>
              )
            )}
          </div>
        );
      })()}

      <main className="tp-body">
        {isNotes ? (
          <>
          <div className="notes-container">
            {!activeNote ? (
              /* ─── Notes List View ─── */
              <div className="notes-list-view">
                <div className="notes-toolbar">
                  <input className="notes-search" placeholder="Search notes..." value={noteSearch} onChange={e => setNoteSearch(e.target.value)} />
                  <div className="notes-new-wrap" ref={templatePickerRef}>
                    <button className="notes-btn" onClick={() => setShowTemplatePicker(v => !v)}>+ New</button>
                    {showTemplatePicker && (
                      <div className="notes-template-picker">
                        {NOTE_TEMPLATES.map(tpl => (
                          <button key={tpl.name} className="notes-template-item" onClick={() => { createNote({ title: tpl.title, content: tpl.content }); setShowTemplatePicker(false); }}>
                            {tpl.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="notes-btn notes-btn-daily" onClick={openDailyNote}>Today</button>
                  <button className="notes-btn notes-btn-graph" onClick={() => setShowGraph(true)} title="Graph View">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
                      <line x1="8.5" y1="7.5" x2="15.5" y2="16.5"/><line x1="8.5" y1="6" x2="15.5" y2="6"/>
                    </svg>
                  </button>
                </div>
                {!synced && <div className="notes-signin-hint">Sign in to use Notes</div>}
                {synced && filteredNotes.length === 0 && (
                  <div className="notes-empty" onClick={() => createNote()}>
                    <span style={{ fontSize: 28, opacity: 0.25 }}>📝</span>
                    <span>No notes yet — click to create one</span>
                  </div>
                )}
                {filteredNotes.map(note => (
                  <div key={note.id} className={`notes-item ${note.pinned ? 'notes-pinned' : ''}`} onClick={() => handleNoteClick(note.id)}>
                    <div className="notes-item-left">
                      {note.dailyDate && <span className="notes-daily-dot" />}
                      <div className="notes-item-info">
                        <span className="notes-item-title">{note.title || 'Untitled'}</span>
                        {(note.tags || []).length > 0 && (
                          <span className="notes-item-tags">{note.tags.map(t => `#${t}`).join(' ')}</span>
                        )}
                      </div>
                    </div>
                    {(() => { const lp = note.projectId ? projects.find(p => p.id === note.projectId && !p.isTeam) : null;
                      return lp ? <span className="notes-item-proj" style={{ color: lp.color, borderColor: lp.color + '44' }}>{lp.name}</span> : null;
                    })()}
                    <span className="notes-item-date">
                      {note.updatedAt?.toDate ? note.updatedAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /* ─── Note Editor View ─── */
              <div className="notes-editor-view">
                <div className="notes-editor-toolbar">
                  <button className="notes-back-btn" onClick={() => { setActiveNote(null); setNoteDeleteConfirm(false); }}>← Back</button>
                  <input className="notes-title-input" value={noteDraft.title} placeholder="Note title"
                    onChange={e => {
                      const title = e.target.value;
                      setNoteDraft(d => ({ ...d, title }));
                      saveNote(activeNote, title, noteDraft.content);
                    }} />
                  <div className="notes-editor-actions">
                    {noteDeleteConfirm ? (
                      <>
                        <button className="notes-btn notes-btn-danger" onClick={handleDeleteNote}>Confirm</button>
                        <button className="notes-btn" onClick={() => setNoteDeleteConfirm(false)}>Cancel</button>
                      </>
                    ) : (
                      <button className="notes-btn notes-btn-danger" onClick={() => setNoteDeleteConfirm(true)}>Del</button>
                    )}
                  </div>
                </div>
                <div className="notes-view-tabs">
                  <button className={`notes-view-tab ${noteView === 'edit' ? 'on' : ''}`} onClick={() => setNoteView('edit')}>Edit</button>
                  <button className={`notes-view-tab ${noteView === 'preview' ? 'on' : ''}`} onClick={() => setNoteView('preview')}>Preview</button>
                  <div className="notes-proj-link" ref={projPickerRef}>
                    {(() => {
                      const linked = activeNoteData?.projectId ? projects.find(p => p.id === activeNoteData.projectId && !p.isTeam) : null;
                      return linked ? (
                        <span className="notes-proj-badge" style={{ borderColor: linked.color + '44', color: linked.color }}>
                          <span className="notes-proj-dot" style={{ background: linked.color }} />
                          {linked.name}
                          <button className="notes-proj-unlink" onClick={() => unlinkNoteFromProject(activeNote)}>×</button>
                        </span>
                      ) : (
                        <button className="notes-proj-link-btn" onClick={() => setProjPicker(v => !v)}>+ Project</button>
                      );
                    })()}
                    {projPicker && (
                      <div className="notes-proj-picker">
                        {projects.filter(p => !p.isTeam).map(p => (
                          <button key={p.id} className="notes-proj-picker-item" onMouseDown={e => { e.preventDefault(); linkNoteToProject(activeNote, p.id); setProjPicker(false); }}>
                            <span className="notes-proj-dot" style={{ background: p.color }} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {noteView === 'edit' && (
                  <div className="notes-fmt-bar">
                    <button className="notes-fmt-btn" title="Bold (Ctrl+B)" onClick={() => applyFormat('bold')}><b>B</b></button>
                    <button className="notes-fmt-btn" title="Italic (Ctrl+I)" onClick={() => applyFormat('italic')}><i>I</i></button>
                    <button className="notes-fmt-btn" title="Strikethrough (Ctrl+Shift+X)" onClick={() => applyFormat('strikethrough')}><s>S</s></button>
                    <button className="notes-fmt-btn" title="Highlight (Ctrl+Shift+H)" onClick={() => applyFormat('highlight')}>H<span style={{fontSize:8,color:'#ffd000'}}>i</span></button>
                    <button className="notes-fmt-btn" title="Heading" onClick={() => applyFormat('heading')}>H#</button>
                    <span className="notes-fmt-sep" />
                    <button className="notes-fmt-btn" title="Link (Ctrl+K)" onClick={() => applyFormat('link')}>🔗</button>
                    <button className="notes-fmt-btn" title="Code (Ctrl+`)" onClick={() => applyFormat('code')}>&lt;/&gt;</button>
                    <span className="notes-fmt-sep" />
                    <button className="notes-fmt-btn" title="Bullet list" onClick={() => applyFormat('list')}>•</button>
                    <button className="notes-fmt-btn" title="Quote" onClick={() => applyFormat('quote')}>❝</button>
                    <span className="notes-fmt-sep" />
                    <button className="notes-fmt-btn" title="Wikilink" onClick={() => applyFormat('wikilink')}>[[⧉]]</button>
                  </div>
                )}
                <div className="notes-content-area">
                  {noteView === 'edit' ? (
                    <>
                    <textarea ref={noteTextareaRef} className="notes-textarea" value={noteDraft.content} placeholder="Write in markdown... Use [[wikilinks]] and #tags"
                      onKeyDown={e => {
                        // Slash menu navigation
                        if (slashMenu) {
                          const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes((slashMenu.filter || '').toLowerCase()));
                          if (e.key === 'ArrowDown') { e.preventDefault(); setSlashMenu(m => ({ ...m, selectedIdx: Math.min((m.selectedIdx || 0) + 1, filtered.length - 1) })); return; }
                          if (e.key === 'ArrowUp') { e.preventDefault(); setSlashMenu(m => ({ ...m, selectedIdx: Math.max((m.selectedIdx || 0) - 1, 0) })); return; }
                          if (e.key === 'Enter') { e.preventDefault(); if (filtered[slashMenu.selectedIdx || 0]) applySlashCommand(filtered[slashMenu.selectedIdx || 0]); return; }
                          if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(null); return; }
                        }
                        const mod = e.ctrlKey || e.metaKey;
                        if (!mod) return;
                        const key = e.key.toLowerCase();
                        if (key === 'b') { e.preventDefault(); applyFormat('bold'); }
                        else if (key === 'i') { e.preventDefault(); applyFormat('italic'); }
                        else if (key === 'k') { e.preventDefault(); applyFormat('link'); }
                        else if (key === '`') { e.preventDefault(); applyFormat('code'); }
                        else if (key === 'x' && e.shiftKey) { e.preventDefault(); applyFormat('strikethrough'); }
                        else if (key === 'h' && e.shiftKey) { e.preventDefault(); applyFormat('highlight'); }
                      }}
                      onChange={e => {
                        const content = e.target.value;
                        setNoteDraft(d => ({ ...d, content }));
                        saveNote(activeNote, noteDraft.title, content);
                        // Detect slash command trigger
                        const ta = e.target;
                        const pos = ta.selectionStart;
                        const lineStart = content.lastIndexOf('\n', pos - 1) + 1;
                        const lineText = content.slice(lineStart, pos);
                        const slashMatch = lineText.match(/^\/(\S*)$/);
                        if (slashMatch) {
                          const rect = ta.getBoundingClientRect();
                          const linesBefore = content.slice(0, lineStart).split('\n').length;
                          const lineH = 20.8; // ~13px font * 1.6 line-height
                          const top = (linesBefore * lineH) - ta.scrollTop + lineH + 4;
                          setSlashMenu({ filter: slashMatch[1], selectedIdx: 0, top, left: 8 });
                        } else {
                          setSlashMenu(null);
                        }
                      }} />
                    {slashMenu && (() => {
                      const filtered = SLASH_COMMANDS.filter(c => c.name.toLowerCase().includes((slashMenu.filter || '').toLowerCase()));
                      if (!filtered.length) return null;
                      return (
                        <div className="slash-menu" ref={slashMenuRef} style={{ top: slashMenu.top, left: slashMenu.left }}>
                          {filtered.map((cmd, i) => (
                            <div key={cmd.name} className={`slash-menu-item${i === (slashMenu.selectedIdx || 0) ? ' selected' : ''}`}
                              onMouseDown={e => { e.preventDefault(); applySlashCommand(cmd); }}>
                              <span className="slash-menu-icon">{cmd.icon}</span>
                              <span className="slash-menu-name">{cmd.name}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    </>
                  ) : (
                    <div className="notes-preview" dangerouslySetInnerHTML={{ __html: parseMarkdown(noteDraft.content) }}
                      onClick={e => {
                        const wl = e.target.closest('.note-wikilink');
                        if (wl) { e.preventDefault(); handleWikilinkClick(wl.dataset.note); return; }
                        // Interactive checkboxes
                        if (e.target.matches('input[data-checkbox]')) {
                          const idx = parseInt(e.target.dataset.checkbox, 10);
                          let count = 0;
                          const newContent = noteDraft.content.replace(/- \[([ xX])\]/g, (match, ch) => {
                            if (count++ === idx) return ch === ' ' ? '- [x]' : '- [ ]';
                            return match;
                          });
                          setNoteDraft(d => ({ ...d, content: newContent }));
                          saveNote(activeNote, noteDraft.title, newContent);
                        }
                      }} />
                  )}
                </div>
                {backlinks.length > 0 && (
                  <div className="notes-backlinks">
                    <div className="notes-backlinks-title">Backlinks</div>
                    {backlinks.map(bl => (
                      <div key={bl.id} className="notes-backlink-item" onClick={() => handleNoteClick(bl.id)}>
                        "{bl.title}" links here
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {showGraph && (
            <div className="tp-modal-backdrop" onMouseDown={() => setShowGraph(false)}>
              <div className="graph-modal" onMouseDown={e => e.stopPropagation()}>
                <div className="graph-modal-hdr">
                  <span className="graph-modal-title">Graph View</span>
                  <span className="graph-modal-stats">{graphData.nodes.length} notes · {graphData.edges.length} connections</span>
                  <button className="tp-modal-x" onClick={() => setShowGraph(false)}>×</button>
                </div>
                <canvas className="graph-canvas" ref={graphCanvasRef} />
              </div>
            </div>
          )}
          </>
        ) : (
        <>
        {total > 0 && (
          <div className="tp-prog">
            <div className="tp-pbar"><div className="tp-pfill" style={{ width: `${(done / total) * 100}%`, background: accent }} /></div>
            <span className="tp-pnum">{done}/{total}</span>
            {done > 0 && <button className="tp-pcl" onClick={clearDone}>Clear done</button>}
          </div>
        )}
        {projectNotes.length > 0 && (
          <div className="proj-notes-bar">
            <span className="proj-notes-label">📝 Notes</span>
            {projectNotes.map(n => (
              <button key={n.id} className="proj-notes-chip" onClick={() => { up(p => ({ ...p, activeTab: NOTES_ID })); handleNoteClick(n.id); }}>
                {n.title || 'Untitled'}
              </button>
            ))}
          </div>
        )}
        {selectedIds.size > 0 && (
          <div className="tp-sel-bar">
            {deleteConfirm ? (
              <>
                <span className="sel-confirm-text">Remove {selectedIds.size} task{selectedIds.size > 1 ? 's' : ''}?</span>
                <button className="sel-btn-danger" onClick={deleteSelected}>Yes, remove</button>
                <button onClick={() => setDeleteConfirm(false)}>Cancel</button>
              </>
            ) : (
              <>
                <span>{selectedIds.size} selected</span>
                <button onClick={() => {
                  const texts = sortedVisible.filter(t => selectedIds.has(t.id)).map(t => t.text).join('\n\n');
                  navigator.clipboard.writeText(texts).then(() => setSelectedIds(new Set())).catch(() => {});
                }}>Copy</button>
                <button className="sel-btn-danger" onClick={() => setDeleteConfirm(true)}>Remove</button>
                <button onClick={() => { setSelectedIds(new Set()); setDeleteConfirm(false); }}>✕</button>
              </>
            )}
          </div>
        )}
        {/* Vault section — only visible for team tabs with a vault set up */}
        {isTeamTab && teamProjData?.vaultSalt && (
          <div className="vault-section">
            <div className="vault-hdr" onClick={() => setVaultOpen(v => !v)}>
              <span className="vault-hdr-l">
                🔒 Vault
                {vaultDecrypted.length > 0 && <span className="vault-hdr-count">{vaultDecrypted.length}</span>}
                {vaultKey && <span style={{ fontSize: 10, color: '#4ecdc4' }}>unlocked</span>}
              </span>
              <span className={`vault-toggle${vaultOpen ? ' open' : ''}`}>▾</span>
            </div>
            {vaultOpen && (
              <div className="vault-body">
                {/* Unlock form */}
                {!vaultKey && (
                  <div className="vault-unlock">
                    <div className="vault-unlock-row">
                      <input type="password" placeholder="Vault password" value={vaultPwInput}
                        onChange={e => setVaultPwInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleVaultUnlock(); }} />
                      <button className="vault-unlock-btn" disabled={vaultBusy || !vaultPwInput} onClick={handleVaultUnlock}>
                        {vaultBusy ? '...' : 'Unlock'}
                      </button>
                    </div>
                    {vaultErr && <div className="vault-err">{vaultErr}</div>}
                    {teamProjData?.ownerUid === authUser?.uid && (
                      <button className="vault-forgot" onClick={() => { setVaultResetConfirm(''); setVaultSetupMode('reset-confirm'); }}>
                        Forgot password? (owner: reset vault)
                      </button>
                    )}
                  </div>
                )}

                {/* Decrypted entries */}
                {vaultKey && vaultDecrypted.map(entry => (
                  vaultEditEntry?.id === entry.id ? (
                    <VaultForm key={entry.id} initial={entry} busy={vaultBusy}
                      onSave={(data) => handleVaultUpdateEntry(entry.id, data)}
                      onCancel={() => setVaultEditEntry(null)} />
                  ) : (
                    <div key={entry.id} className="vault-entry">
                      <div className="vault-entry-label">
                        <span>{entry.label || '(untitled)'}</span>
                        <div className="vault-entry-actions">
                          <button title="Edit" onClick={() => setVaultEditEntry(entry)}>✏️</button>
                          <button className="vault-del" title="Delete" onClick={() => handleVaultDeleteEntry(entry.id)}>🗑</button>
                        </div>
                      </div>
                      {entry.username && (
                        <div className="vault-entry-field">
                          <span>user:</span>
                          <span className="vault-val">{entry.username}</span>
                          <button className="vault-copy" title="Copy username" onClick={() => navigator.clipboard.writeText(entry.username)}>📋</button>
                        </div>
                      )}
                      <div className="vault-entry-field">
                        <span>pass:</span>
                        <span className="vault-val">••••••••••••</span>
                        <button className="vault-copy" title="Copy password" onClick={() => navigator.clipboard.writeText(entry.password)}>📋</button>
                      </div>
                      {entry.url && (
                        <div className="vault-entry-field">
                          <span>url:</span>
                          <a className="vault-val vault-link" href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`} target="_blank" rel="noopener noreferrer">{entry.url}</a>
                        </div>
                      )}
                    </div>
                  )
                ))}

                {/* Add entry */}
                {vaultKey && !vaultEditEntry && (
                  vaultEditEntry === false ? (
                    <VaultForm busy={vaultBusy} onSave={handleVaultAddEntry} onCancel={() => setVaultEditEntry(null)} />
                  ) : (
                    <button className="vault-add-btn" onClick={() => setVaultEditEntry(false)}>+ Add Entry</button>
                  )
                )}
                {vaultKey && vaultErr && <div className="vault-err">{vaultErr}</div>}
              </div>
            )}
          </div>
        )}

        {/* Vault setup/settings modal */}
        {vaultSetupMode && (
          <div className="tp-modal-backdrop" onMouseDown={() => { setVaultSetupMode(null); setVaultErr(''); }}>
            <div className="tp-modal" onMouseDown={e => e.stopPropagation()}>
              <div className="tp-modal-h">
                <div className="tp-modal-title">
                  {vaultSetupMode === 'setup' ? 'Set Up Vault' : vaultSetupMode === 'changePw' ? 'Vault Settings' : 'Reset Vault'}
                </div>
                <button className="tp-modal-x" onClick={() => { setVaultSetupMode(null); setVaultErr(''); }}>×</button>
              </div>
              <div className="tp-modal-body">
                {vaultSetupMode === 'setup' && (
                  <>
                    <div className="vault-setup-warn">
                      Warning: If you forget the vault password, all stored credentials will be permanently lost. There is no recovery mechanism.
                    </div>
                    <div className="vault-form-pw">
                      <input className="tp-modal-in" type={vaultShowPw ? 'text' : 'password'} placeholder="Choose vault password" value={vaultPwInput}
                        onChange={e => setVaultPwInput(e.target.value)} />
                      <button type="button" className="vault-eye-btn" onClick={() => setVaultShowPw(v => !v)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{vaultShowPw ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg></button>
                    </div>
                    <input className="tp-modal-in" type={vaultShowPw ? 'text' : 'password'} placeholder="Confirm password" id="vault-confirm-pw"
                      onKeyDown={e => { if (e.key === 'Enter' && vaultPwInput.length >= 4) {
                        const confirm = document.getElementById('vault-confirm-pw').value;
                        if (confirm !== vaultPwInput) { setVaultErr('Passwords do not match'); return; }
                        handleVaultSetup(vaultPwInput);
                      }}} />
                    {vaultErr && <div className="tp-modal-err">{vaultErr}</div>}
                    <button className="tp-modal-btn" disabled={vaultBusy || vaultPwInput.length < 4}
                      onClick={() => {
                        const confirm = document.getElementById('vault-confirm-pw').value;
                        if (confirm !== vaultPwInput) { setVaultErr('Passwords do not match'); return; }
                        handleVaultSetup(vaultPwInput);
                      }}>
                      {vaultBusy ? 'Setting up...' : 'Create Vault'}
                    </button>
                    <div className="tp-modal-note">Minimum 4 characters. All team members will use this password to unlock.</div>
                  </>
                )}
                {vaultSetupMode === 'changePw' && (
                  <>
                    <input className="tp-modal-in" type="password" placeholder="Current password" id="vault-old-pw" />
                    <input className="tp-modal-in" type="password" placeholder="New password" id="vault-new-pw" />
                    {vaultErr && <div className="tp-modal-err">{vaultErr}</div>}
                    <button className="tp-modal-btn" disabled={vaultBusy}
                      onClick={() => {
                        const oldPw = document.getElementById('vault-old-pw').value;
                        const newPw = document.getElementById('vault-new-pw').value;
                        if (!oldPw || newPw.length < 4) { setVaultErr('New password must be at least 4 characters'); return; }
                        handleVaultChangePw(oldPw, newPw);
                      }}>
                      {vaultBusy ? 'Changing...' : 'Change Password'}
                    </button>
                    <button className="tp-modal-btn" style={{ color: '#ff4444', borderColor: '#ff444433' }}
                      onClick={() => { setVaultResetConfirm(''); setVaultSetupMode('reset-confirm'); }}>
                      Reset Vault (delete all entries)
                    </button>
                  </>
                )}
                {vaultSetupMode === 'reset-confirm' && (
                  <>
                    <div className="vault-setup-warn" style={{ color: '#ff6b6b', background: '#ff6b6b0a', borderColor: '#ff6b6b22' }}>
                      This will permanently delete ALL vault entries and remove the vault password. This cannot be undone.
                    </div>
                    <label className="vault-confirm-label">Type <strong>RESET</strong> to confirm</label>
                    <input className="tp-modal-input" placeholder="RESET" value={vaultResetConfirm}
                      onChange={e => setVaultResetConfirm(e.target.value)} autoFocus />
                    {vaultErr && <div className="tp-modal-err">{vaultErr}</div>}
                    <button className="tp-modal-btn" style={{ color: '#ff4444', borderColor: '#ff444433' }}
                      disabled={vaultBusy || vaultResetConfirm !== 'RESET'} onClick={handleVaultReset}>
                      {vaultBusy ? 'Resetting...' : 'Yes, Reset Vault'}
                    </button>
                    <button className="tp-modal-btn" onClick={() => { setVaultSetupMode(teamProjData?.vaultSalt ? 'changePw' : null); setVaultResetConfirm(''); }}>Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`tp-tasks${isTaskDragging ? ' dragging' : ''}`} ref={containerRef} onClick={(e) => { if (!e.ctrlKey && !e.metaKey && selectedIds.size > 0 && !dragSelectRef.current.justEnded) setSelectedIds(new Set()); }}>
          {sortedVisible.length === 0 && <div className="tp-empty" onClick={() => insertTask(null)}><span style={{ fontSize: 28, opacity: 0.25 }}>📝</span><span>{isInbox ? 'Cockpit is empty — click here to start' : 'No tasks yet — click to add'}</span></div>}
          {sortedVisible.length > 0 && !isTaskDragging && <InsertZone onClick={() => insertTask(null)} color={accent} />}
          {sortedVisible.map((task, idx) => {
            const isNewTeam = newTeamTaskIds.current.has(task.id);
            const taskObj = isNewTeam ? { ...task, _new: true } : task;
            return (
              <div key={task.id}>
                <TaskLine task={taskObj} allProjects={projects} accentColor={accent} isInbox={isInbox}
                  isTeam={isTeamTab} nicknames={teamProjData?.nicknames} avatars={teamProjData?.avatars}
                  onToggle={toggleTask} onDelete={deleteTask} onChange={changeTask}
                  onHide={isInbox ? hideFromInbox : null}
                  isSelecting={selectedIds.size > 0}
                  selected={selectedIds.has(task.id)} onSelect={onSelectTask}
                  onDragSelectStart={onDragSelectStart} onDragSelectEnter={onDragSelectEnter} dragSelectRef={dragSelectRef}
                  dragHandle={e => onTaskDrag(e, task.id)} style={getTaskStyle(task.id)}
                  refCb={el => { if (el) taskRefs.current[task.id] = el; else delete taskRefs.current[task.id]; }} />
                {!isTaskDragging && <InsertZone onClick={() => insertTask(task.id)} color={accent} />}
              </div>
            );
          })}
        </div>
        </>
        )}
      </main>

      {data.showSc && (
        <div className="sc-bar">
          <div className="sc-row">
            {orderedSc.map(s => (
              <ShortcutIcon key={s.id} shortcut={s} unlocked={scUnlocked} onUnlock={() => setScUnlocked(true)}
                onDragStart={(e, forcedX) => onScDrag(e, s.id, forcedX)} style={getScStyle(s.id)}
                refCb={el => { if (el) scRefs.current[s.id] = el; else delete scRefs.current[s.id]; }} />
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
