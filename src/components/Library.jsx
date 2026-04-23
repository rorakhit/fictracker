import { useState, useMemo } from 'react';
import Stars from './Stars';
import ShelfStrip from './ShelfStrip';
import { ratingClass, wordCountLabel, readingTime, timeAgo } from '../utils/helpers';
import { getSettings } from '../storage/local';

export default function Library({
  works, statuses, stats, wipTracking,
  bulkMode, setBulkMode, bulkSelected, setBulkSelected,
  toggleBulkSelect, bulkSetStatus, bulkDelete,
  importing, importMsg, addByUrl,
  readingLog = [],
  checkingWips, wipCheckMsg, checkWipUpdates, dismissWipUpdate, dismissAllWipUpdates,
  isAtFicLimit, ficsRemaining, ficLimit,
  onOpenWork,
  // Bookshelf props
  shelves, worksByShelf, activeShelfId, setActiveShelfId,
  createShelf, updateShelf, deleteShelf, addWorksToShelf,
  isAtShelfLimit, shelvesRemaining, totalShelfCount, shelfLimit,
  isPremium, onShelfUpgradeClick,
  // Smart shelf props
  smartShelves, activeSmartShelfId, setActiveSmartShelfId,
  createSmartShelf, deleteSmartShelf,
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('shuffle');
  const [addUrl, setAddUrl] = useState('');

  // Smart shelf save UI state — local to Library because the save
  // flow is a Library concern (it captures Library's filter state).
  const [savingSmartShelf, setSavingSmartShelf] = useState(false);
  const [smartShelfName, setSmartShelfName] = useState('');
  const [smartShelfError, setSmartShelfError] = useState('');

  // Reading speed — read once from settings (no need to re-render on change;
  // the library view refreshes naturally when the user navigates back from Settings)
  const readingWpm = useMemo(() => getSettings().readingWpm || 250, []);

  // Last-read timestamps — for each work, find the most recent reading_log entry.
  // We build a Map so card rendering is O(1) per lookup rather than O(n) per card.
  const lastReadMap = useMemo(() => {
    const map = new Map();
    readingLog.forEach(entry => {
      const existing = map.get(entry.work_id);
      if (!existing || entry.read_at > existing) {
        map.set(entry.work_id, entry.read_at);
      }
    });
    return map;
  }, [readingLog]);

  // Is there anything meaningful to save? Saving a smart shelf with
  // all-default filters would be a no-op query that matches every fic.
  const hasNonDefaultFilter = statusFilter !== 'all' || search.trim() !== '' || sortBy !== 'shuffle';

  async function handleSaveSmartShelf() {
    const trimmed = smartShelfName.trim();
    if (!trimmed) { setSmartShelfError('Name is required'); return; }
    const filterJson = { statusFilter, search: search.trim(), sortBy };
    const result = await createSmartShelf({ name: trimmed, filterJson });
    if (result?.hitLimit) {
      setSmartShelfError('Free tier is limited to 3 shelves');
      return;
    }
    if (result?.error) {
      if (result.error.code === '23505') {
        setSmartShelfError('You already have a shelf with that name');
      } else {
        setSmartShelfError('Could not save');
      }
      return;
    }
    // Success: close the input, clear state, activate the new smart shelf
    setSavingSmartShelf(false);
    setSmartShelfName('');
    setSmartShelfError('');
    if (result?.shelf) setActiveSmartShelfId(result.shelf.id);
  }

  // Callback for ShelfStrip: apply a smart shelf's saved filter state
  // back to Library's local state and mark it as the active smart shelf.
  // Also clears any active manual shelf (mutually exclusive).
  function applySmartShelf(shelf) {
    const f = shelf.filterJson || {};
    setStatusFilter(f.statusFilter || 'all');
    setSearch(f.search || '');
    setSortBy(f.sortBy || 'shuffle');
    setActiveSmartShelfId(shelf.id);
    setActiveShelfId(null);
  }

  // Seeded shuffle rotates every 2 hours so the library feels fresh
  // without flickering on re-renders. Same approach as queue recs.
  const shuffleSeed = useMemo(() => Math.floor(Date.now() / (2 * 60 * 60 * 1000)), []);

  function hashCode(str, seed = 0) {
    let h = seed | 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h;
  }

  function getStatusForWork(workId) {
    return statuses[workId] || null;
  }

  // Switch to a deterministic sort when user applies a filter or search
  const isFiltered = statusFilter !== 'all' || search.length > 0;
  const effectiveSort = (sortBy === 'shuffle' && isFiltered) ? 'recent' : sortBy;

  const filtered = useMemo(() => {
    let result = works.map(w => ({ ...w, _status: getStatusForWork(w.id) }));
    // Shelf filter runs first so the status/search filters narrow within
    // the active shelf. Null activeShelfId = no shelf filter (show all).
    if (activeShelfId && worksByShelf) {
      const shelfWorkIds = worksByShelf.get(activeShelfId) || new Set();
      result = result.filter(w => shelfWorkIds.has(w.id));
    }
    if (statusFilter !== 'all') {
      result = result.filter(w => (w._status?.status || 'to_read') === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(w =>
        w.title?.toLowerCase().includes(q) ||
        w.authors?.some(a => a.toLowerCase().includes(q)) ||
        w.fandoms?.some(f => f.toLowerCase().includes(q)) ||
        w.relationships?.some(r => r.toLowerCase().includes(q)) ||
        w.freeform_tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    result.sort((a, b) => {
      if (effectiveSort === 'shuffle') {
        const ha = (hashCode(a.id, shuffleSeed) & 0x7fffffff);
        const hb = (hashCode(b.id, shuffleSeed) & 0x7fffffff);
        return ha - hb;
      }
      if (effectiveSort === 'recent') return new Date(b.imported_at) - new Date(a.imported_at);
      if (effectiveSort === 'words') return (b.word_count || 0) - (a.word_count || 0);
      if (effectiveSort === 'kudos') return (b.kudos || 0) - (a.kudos || 0);
      if (effectiveSort === 'title') return (a.title || '').localeCompare(b.title || '');
      if (effectiveSort === 'rating') return (b._status?.rating_personal || 0) - (a._status?.rating_personal || 0);
      return 0;
    });
    return result;
  }, [works, statuses, statusFilter, search, effectiveSort, shuffleSeed, activeShelfId, worksByShelf]);

  function selectAllVisible() {
    const allIds = new Set(filtered.map(w => w.id));
    setBulkSelected(allIds);
  }

  function deselectAll() {
    setBulkSelected(new Set());
  }

  // Bulk add-to-shelf handler. Fires addWorksToShelf (which dedupes
  // and rolls back optimistic updates on error), then activates the
  // destination shelf as the filter so the user sees where their
  // selection landed, and exits bulk mode. This gives instant visual
  // confirmation without needing a toast system.
  async function handleBulkAddToShelf(shelfId) {
    if (!shelfId || bulkSelected.size === 0) return;
    const workIds = Array.from(bulkSelected);
    const result = await addWorksToShelf(shelfId, workIds);
    if (result?.error) {
      alert('Could not add to shelf. Try again?');
      return;
    }
    setActiveShelfId(shelfId);
    setBulkMode(false);
    setBulkSelected(new Set());
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="stat-num" style={{ color: 'var(--accent)' }}>{stats.total}</div><div className="stat-label">Total</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--blue)' }}>{stats.statusCounts.to_read}</div><div className="stat-label">To Read</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--warning)' }}>{stats.statusCounts.reading}</div><div className="stat-label">Reading</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--success)' }}>{stats.statusCounts.completed}</div><div className="stat-label">Done</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--teal)' }}>{wordCountLabel(stats.totalWords)}</div><div className="stat-label">Words</div></div>
      </div>

      {/* Shelf strip — bookshelf feature */}
      {shelves && (
        <ShelfStrip
          shelves={shelves}
          smartShelves={smartShelves || []}
          worksByShelf={worksByShelf}
          activeShelfId={activeShelfId}
          setActiveShelfId={(id) => { setActiveShelfId(id); if (id !== null) setActiveSmartShelfId(null); }}
          activeSmartShelfId={activeSmartShelfId}
          applySmartShelf={applySmartShelf}
          createShelf={createShelf}
          updateShelf={updateShelf}
          deleteShelf={deleteShelf}
          deleteSmartShelf={deleteSmartShelf}
          isAtShelfLimit={isAtShelfLimit}
          shelvesRemaining={shelvesRemaining}
          totalShelfCount={totalShelfCount}
          shelfLimit={shelfLimit}
          isPremium={isPremium}
          onUpgradeClick={onShelfUpgradeClick}
        />
      )}

      {/* WIP update section */}
      {(() => {
        const updatedWips = works.filter(w => wipTracking[w.id]?.has_update);
        const hasUpdates = updatedWips.length > 0;
        return (
          <>
            {hasUpdates && (
              <div className="wip-update-banner">
                <span className="wip-update-banner-icon">✨</span>
                <div className="wip-update-banner-text">
                  <strong>{updatedWips.length} fic{updatedWips.length > 1 ? 's have' : ' has'} new chapters!</strong>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                    {updatedWips.map(w => {
                      const wip = wipTracking[w.id];
                      const newCh = wip?.updated_chapter_count;
                      const oldCh = wip?.last_known_chapters || w.chapter_count;
                      return (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span>📖 {w.title}{newCh ? ` — Ch. ${newCh} is out!` : ''}</span>
                          <button className="btn btn-ghost" style={{ fontSize: 11, padding: '1px 6px', minHeight: 0 }}
                            onClick={e => { e.stopPropagation(); dismissWipUpdate(w.id); }}>dismiss</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={dismissAllWipUpdates} style={{ alignSelf: 'flex-start' }}>Dismiss all</button>
              </div>
            )}
            <div className="add-url-bar">
              <input type="url" placeholder="Paste AO3 URL to add a fic..." value={addUrl} onChange={e => setAddUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addByUrl(addUrl); setAddUrl(''); } }}
              />
              <button className="btn btn-accent btn-sm" onClick={() => { addByUrl(addUrl); setAddUrl(''); }} disabled={importing}>Add</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={checkWipUpdates}
                disabled={checkingWips}
                title="Check AO3 for new chapters on your WIPs"
              >
                {checkingWips ? 'Checking...' : 'Check WIPs'}
              </button>
            </div>
          </>
        );
      })()}
      {importMsg && <div style={{ fontSize: 12, color: 'var(--accent-hover)', marginBottom: 12 }}>{importMsg}</div>}
      {wipCheckMsg && <div style={{ fontSize: 12, color: 'var(--teal)', marginBottom: 12, whiteSpace: 'pre-line' }}>{wipCheckMsg}</div>}

      <div className="filters">
        {[['all','All'],['to_read','To Read'],['reading','Reading'],['completed','Done'],['on_hold','On Hold'],['dnf','DNF'],['dropped','Dropped'],['author_abandoned','Abandoned']].map(([k,l]) => (
          <button key={k} className={`pill ${statusFilter === k ? 'active' : ''}`}
            onClick={() => { setStatusFilter(k); if (setActiveSmartShelfId) setActiveSmartShelfId(null); }}>{l}</button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px', height: 20, display: 'inline-block' }}></span>
        <select style={{ width: 130, padding: '5px 8px', fontSize: 12, borderRadius: 18 }} value={sortBy}
          onChange={e => { setSortBy(e.target.value); if (setActiveSmartShelfId) setActiveSmartShelfId(null); }}>
          <option value="shuffle">Shuffle</option>
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="words">Word Count</option>
          <option value="kudos">Kudos</option>
          <option value="rating">My Rating</option>
        </select>
        <input className="search-input" placeholder="Search fics, fandoms, ships..." value={search}
          onChange={e => { setSearch(e.target.value); if (setActiveSmartShelfId) setActiveSmartShelfId(null); }} />
        {/* "Save as smart shelf" — only appears when there's a non-default filter
            to save and the shelf machinery is wired in. Keeps the control bar
            clean in the default state. */}
        {createSmartShelf && hasNonDefaultFilter && !savingSmartShelf && (
          <button className="pill" onClick={() => { setSavingSmartShelf(true); setSmartShelfName(''); setSmartShelfError(''); }}
            title="Save current filter as a smart shelf">
            💾 Save filter
          </button>
        )}
        <button className={`pill ${bulkMode ? 'active' : ''}`} onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}>{bulkMode ? 'Cancel' : 'Select'}</button>
      </div>

      {/* Inline smart-shelf save panel. Lives outside the .filters row so
          it can wrap cleanly on narrow viewports. */}
      {savingSmartShelf && (
        <div className="smart-save-panel">
          <span className="smart-save-icon">🔍</span>
          <input
            autoFocus
            className="smart-save-input"
            placeholder="Name this smart shelf"
            value={smartShelfName}
            maxLength={50}
            onChange={e => { setSmartShelfName(e.target.value); setSmartShelfError(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveSmartShelf();
              if (e.key === 'Escape') { setSavingSmartShelf(false); setSmartShelfName(''); setSmartShelfError(''); }
            }}
          />
          <button className="btn btn-sm btn-accent" onClick={handleSaveSmartShelf}>Save</button>
          <button className="btn btn-sm btn-ghost" onClick={() => { setSavingSmartShelf(false); setSmartShelfName(''); setSmartShelfError(''); }}>Cancel</button>
          {smartShelfError && <span className="smart-save-error">{smartShelfError}</span>}
        </div>
      )}

      {bulkMode && (
        <div className="bulk-bar">
          <span>{bulkSelected.size} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={selectAllVisible}>Select all ({filtered.length})</button>
          {bulkSelected.size > 0 && <button className="btn btn-ghost btn-sm" onClick={deselectAll}>Deselect</button>}
          {bulkSelected.size > 0 && (<>
            <select style={{ width: 140, padding: '5px 8px', fontSize: 12, borderRadius: 8 }}
              onChange={e => { if (e.target.value) bulkSetStatus(e.target.value); e.target.value = ''; }}
              defaultValue="">
              <option value="" disabled>Set status...</option>
              <option value="to_read">To Read</option>
              <option value="reading">Reading</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="dnf">DNF</option>
              <option value="dropped">Dropped</option>
              <option value="author_abandoned">Author Abandoned</option>
            </select>
            {shelves && shelves.length > 0 && (
              <select style={{ width: 150, padding: '5px 8px', fontSize: 12, borderRadius: 8 }}
                onChange={e => { const v = e.target.value; e.target.value = ''; if (v) handleBulkAddToShelf(v); }}
                defaultValue="">
                <option value="" disabled>Add to shelf...</option>
                {shelves.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <button className="btn btn-sm" style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent' }}
              onClick={() => { if (confirm(`Remove ${bulkSelected.size} fics?`)) bulkDelete(); }}>Remove</button>
          </>)}</div>
      )}

      <div className="work-list">
        {filtered.length === 0 ? (
          works.length === 0 ? (
            <div className="empty" style={{ padding: '32px 0' }}>
              <div className="emoji">📚</div>
              <p style={{ marginBottom: 20 }}>Your library is empty — here's how to fill it.</p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                textAlign: 'left',
                maxWidth: 580,
                margin: '0 auto',
              }}>
                <div style={{ padding: '14px 16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>🧩 Browser extension</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
                    The fastest way — adds a panel to every AO3 page so you can track fics without leaving AO3.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <a href="https://chromewebstore.google.com/detail/fictracker/phfdhkgaagelchgejhhpelhcmebomdim"
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-teal)', textDecoration: 'none' }}>
                      Add to Chrome →
                    </a>
                    <a href="https://addons.mozilla.org/en-US/firefox/addon/fictracker/"
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-teal)', textDecoration: 'none' }}>
                      Add to Firefox →
                    </a>
                  </div>
                </div>
                <div style={{ padding: '14px 16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📱 Other options</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 6 }}>
                    On mobile or prefer not to install an extension?
                  </p>
                  <ul style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, margin: 0, paddingLeft: 16 }}>
                    <li>Paste an AO3 URL in the bar above</li>
                    <li>Drop AO3 EPUB files in <strong style={{ color: 'var(--text)' }}>Import</strong></li>
                    <li>Get the Quick Add bookmarklet in <strong style={{ color: 'var(--text)' }}>Settings</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty"><div className="emoji">🔍</div><p>No fics match your filters.</p></div>
          )
        ) : filtered.map(w => {
          const st = w._status?.status || 'to_read';
          const isChecked = bulkSelected.has(w.id);
          return (
            <div key={w.id} className={`work-card ${bulkMode ? 'selectable' : ''} ${isChecked ? 'selected' : ''}`}
              onClick={() => bulkMode ? toggleBulkSelect(w.id) : onOpenWork(w)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {bulkMode && <input type="checkbox" className="bulk-check" checked={isChecked} onChange={() => toggleBulkSelect(w.id)} onClick={e => e.stopPropagation()} style={{ marginTop: 3 }} />}
                  <div>
                    <div className="work-title">{w.title}</div>
                    <div className="work-author">by {(w.authors || []).join(', ') || 'Anonymous'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {w._status?.rating_personal > 0 && <Stars value={w._status.rating_personal} />}
                  <span className={`status-badge status-${st}`}>{st.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="work-meta">
                {w.word_count && <span>{wordCountLabel(w.word_count)} words</span>}
                {readingTime(w.word_count, readingWpm) && (
                  <span title={`At ${readingWpm} wpm`}>{readingTime(w.word_count, readingWpm)}</span>
                )}
                {w.chapter_count && <span>{w.chapter_count}{w.chapter_total ? '/' + w.chapter_total : '/?'} ch</span>}
                {!w.is_complete && <span className="tag wip">WIP</span>}
                {wipTracking[w.id]?.has_update && (
                  <span className="tag wip-updated" onClick={e => { e.stopPropagation(); dismissWipUpdate(w.id); }} title="New chapters! Click to dismiss">
                    ✨ Updated!
                  </span>
                )}
                {w.kudos && <span>♥ {w.kudos.toLocaleString()}</span>}
                {w.rating && <span className={`tag ${ratingClass(w.rating)}`}>{w.rating}</span>}
              </div>
              <div className="work-tags">
                {(w.fandoms || []).slice(0, 2).map(f => <span key={f} className="tag fandom">{f.length > 30 ? f.slice(0, 27) + '...' : f}</span>)}
                {(w.relationships || []).slice(0, 3).map(r => <span key={r} className="tag ship">{r}</span>)}
              </div>
              {st === 'reading' && w._status?.current_chapter > 0 && w.chapter_count && (
                <div className="progress-bar" style={{ marginTop: 8 }}><div className="progress-fill" style={{ width: `${Math.min(100, (w._status.current_chapter / (w.chapter_total || w.chapter_count)) * 100)}%` }}></div></div>
              )}
              {st === 'reading' && w.ao3_id && (() => {
                // Build an AO3 deep link for the current chapter.
                // chapter_ids (array of {num, ao3_id}) are scraped when the work
                // is added by URL; they let us link to the exact chapter rather
                // than always opening chapter 1.
                const ch = w._status?.current_chapter || 0;
                const chapterIds = w.chapter_ids || [];
                const match = chapterIds.find(c => c.num === ch);
                const url = match?.ao3_id
                  ? `https://archiveofourown.org/works/${w.ao3_id}/chapters/${match.ao3_id}`
                  : `https://archiveofourown.org/works/${w.ao3_id}`;
                const label = ch > 0
                  ? `Continue → Ch. ${ch}${w.chapter_total || w.chapter_count ? '/' + (w.chapter_total || w.chapter_count) : ''}`
                  : 'Open on AO3';
                const lastRead = lastReadMap.get(w.id);
                return (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--accent-teal)',
                        textDecoration: 'none',
                        padding: '3px 10px',
                        border: '1px solid rgba(20,184,166,0.3)',
                        borderRadius: 5,
                        background: 'rgba(20,184,166,0.06)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                    </a>
                    {lastRead && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {timeAgo(lastRead)}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </>
  );
}
