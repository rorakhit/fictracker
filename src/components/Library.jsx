import { useState, useMemo } from 'react';
import Stars from './Stars';
import { ratingClass, wordCountLabel } from '../utils/helpers';

export default function Library({
  works, statuses, stats, wipTracking,
  bulkMode, setBulkMode, bulkSelected, setBulkSelected,
  toggleBulkSelect, bulkSetStatus, bulkDelete,
  importing, importMsg, addByUrl,
  checkingWips, wipCheckMsg, checkWipUpdates, dismissWipUpdate, dismissAllWipUpdates,
  isAtFicLimit, ficsRemaining, ficLimit,
  onOpenWork
}) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [addUrl, setAddUrl] = useState('');

  function getStatusForWork(workId) {
    return statuses[workId] || null;
  }

  const filtered = useMemo(() => {
    let result = works.map(w => ({ ...w, _status: getStatusForWork(w.id) }));
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
      if (sortBy === 'recent') return new Date(b.imported_at) - new Date(a.imported_at);
      if (sortBy === 'words') return (b.word_count || 0) - (a.word_count || 0);
      if (sortBy === 'kudos') return (b.kudos || 0) - (a.kudos || 0);
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'rating') return (b._status?.rating_personal || 0) - (a._status?.rating_personal || 0);
      return 0;
    });
    return result;
  }, [works, statuses, statusFilter, search, sortBy]);

  function selectAllVisible() {
    const allIds = new Set(filtered.map(w => w.id));
    setBulkSelected(allIds);
  }

  function deselectAll() {
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
            {isAtFicLimit && (
              <div style={{
                background: 'rgba(139,92,246,0.08)',
                border: '1px solid rgba(139,92,246,0.25)',
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--purple)' }}>
                    You've reached {ficLimit} fics — the free tier limit
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Upgrade to Plus for unlimited fics, analytics, reading wrapped, and more.
                  </div>
                </div>
                <button className="btn btn-sm" style={{ background: 'var(--purple)', color: 'white' }}>
                  Upgrade
                </button>
              </div>
            )}
            {!isAtFicLimit && ficsRemaining <= 10 && ficsRemaining > 0 && (
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 8,
                textAlign: 'center',
              }}>
                {ficsRemaining} fic{ficsRemaining !== 1 ? 's' : ''} remaining on free tier
              </div>
            )}
            <div className="add-url-bar">
              <input type="url" placeholder={isAtFicLimit ? 'Upgrade to Plus to add more fics' : 'Paste AO3 URL to add a fic...'} value={addUrl} onChange={e => setAddUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addByUrl(addUrl); setAddUrl(''); } }}
                disabled={isAtFicLimit} />
              <button className="btn btn-accent btn-sm" onClick={() => { addByUrl(addUrl); setAddUrl(''); }} disabled={importing || isAtFicLimit}>Add</button>
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
        {[['all','All'],['to_read','To Read'],['reading','Reading'],['completed','Done'],['on_hold','On Hold'],['dropped','Dropped']].map(([k,l]) => (
          <button key={k} className={`pill ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{l}</button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '0 2px', height: 20, display: 'inline-block' }}></span>
        <select style={{ width: 130, padding: '5px 8px', fontSize: 12, borderRadius: 18 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="recent">Recent</option>
          <option value="title">Title</option>
          <option value="words">Word Count</option>
          <option value="kudos">Kudos</option>
          <option value="rating">My Rating</option>
        </select>
        <input className="search-input" placeholder="Search fics, fandoms, ships..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`pill ${bulkMode ? 'active' : ''}`} onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}>{bulkMode ? 'Cancel' : 'Select'}</button>
      </div>

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
              <option value="dropped">Dropped</option>
            </select>
            <button className="btn btn-sm" style={{ color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent' }}
              onClick={() => { if (confirm(`Remove ${bulkSelected.size} fics?`)) bulkDelete(); }}>Remove</button>
          </>)}</div>
      )}

      <div className="work-list">
        {filtered.length === 0 ? (
          <div className="empty"><div className="emoji">📚</div><p>{works.length === 0 ? 'No fics yet! Import your bookmarks or add a fic by URL.' : 'No fics match your filters.'}</p></div>
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
            </div>
          );
        })}
      </div>
    </>
  );
}
