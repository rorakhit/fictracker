import { useState, useRef } from 'react';
import { generateBookmarklet } from '../utils/helpers';

export default function ImportView({
  session, importing, importMsg, addByUrl, handleEpubFiles,
  syncingBookmarks, syncMsg, syncJob, onSyncBookmarks, ao3Username
}) {
  const [addUrl, setAddUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const bookmarkletCode = generateBookmarklet(session, 'https://nivqfnrkpuoyjtugavtj.supabase.co');

  // Determine sync button label based on job state
  const canResume = syncJob && (syncJob.status === 'partial');
  const syncButtonLabel = syncingBookmarks
    ? 'Syncing...'
    : canResume
      ? `Resume Sync (page ${(syncJob.current_page || 0) + 1} of ${syncJob.total_pages || '?'})`
      : 'Sync My AO3 Bookmarks';

  return (
    <>
      {/* Server-side AO3 Bookmark Sync — the primary import method */}
      <div className="import-section">
        <h3>🔄 Sync AO3 Bookmarks</h3>
        <p style={{ lineHeight: 1.6 }}>
          Import your entire AO3 bookmarks library automatically. FicTracker reads your public AO3 bookmarks
          and imports every fic — no bookmarklet needed.
          {!ao3Username && (
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {' '}Set your AO3 username in Settings first.
            </span>
          )}
        </p>

        {ao3Username && (
          <div style={{
            background: 'var(--surface)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                AO3 username: <strong style={{ color: 'var(--text)' }}>{ao3Username}</strong>
              </span>
            </div>

            <button
              className="btn btn-accent"
              onClick={onSyncBookmarks}
              disabled={syncingBookmarks || !ao3Username}
              style={{ marginBottom: 10 }}
            >
              {syncButtonLabel}
            </button>

            {syncMsg && (
              <div style={{
                fontSize: 12,
                color: syncMsg.includes('Error') || syncMsg.includes('failed') || syncMsg.includes('not found')
                  ? '#ef4444' : '#14b8a6',
                lineHeight: 1.6,
                marginTop: 8,
                padding: '8px 12px',
                background: 'var(--bg)',
                borderRadius: 8,
                whiteSpace: 'pre-line',
              }}>
                {syncMsg}
              </div>
            )}

            {/* Progress bar for active/partial jobs */}
            {syncJob && syncJob.total_pages && (syncJob.status === 'running' || syncJob.status === 'partial' || syncingBookmarks) && (
              <div style={{ marginTop: 10 }}>
                <div style={{
                  height: 6,
                  background: 'var(--bg)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.round(((syncJob.current_page || 0) / syncJob.total_pages) * 100)}%`,
                    background: 'linear-gradient(90deg, #14b8a6, #06b6d4)',
                    borderRadius: 3,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Page {syncJob.current_page || 0} of {syncJob.total_pages} · {syncJob.works_imported || 0} imported
                  {syncJob.wip_updates_found > 0 && ` · ${syncJob.wip_updates_found} WIP updates found`}
                </div>
              </div>
            )}

            {/* Completed job summary */}
            {syncJob && syncJob.status === 'completed' && !syncingBookmarks && (
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 8,
                padding: '6px 10px',
                background: 'rgba(20,184,166,0.06)',
                borderRadius: 6,
                border: '1px solid rgba(20,184,166,0.12)',
              }}>
                Last sync: {syncJob.works_imported} fics imported
                {syncJob.wip_updates_found > 0 && `, ${syncJob.wip_updates_found} WIP updates`}
                {syncJob.completed_at && ` — ${new Date(syncJob.completed_at).toLocaleDateString()}`}
              </div>
            )}
          </div>
        )}

        <div style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> FicTracker scrapes your public AO3 bookmarks page
          with a 5-second delay between pages (respectful to AO3's servers). Large libraries may need
          multiple runs due to server time limits — just click "Resume" to continue where it left off.
          WIP chapter counts are also checked during the sync.
        </div>
      </div>

      <div className="import-section">
        <h3>📥 Bulk Import — Bookmarklet</h3>
        <p style={{ lineHeight: 1.6 }}>
          Alternative import method: a bookmarklet that scrapes your AO3 bookmarks from your browser.
          Use this if the server-side sync doesn't work for you (e.g., private bookmarks).
        </p>
        <div style={{
          background: 'var(--bg)',
          borderRadius: 10,
          padding: 14,
          marginBottom: 14,
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <a className="bookmarklet-link" href={bookmarkletCode} style={{ fontSize: 13, padding: '8px 16px' }}>📥 Bulk Import</a>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>← drag to bookmarks bar</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => {
            navigator.clipboard.writeText(bookmarkletCode).then(() => {
              const btn = document.activeElement;
              const orig = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = orig, 2000);
            });
          }}>Copy Bookmarklet</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> Go to your AO3 bookmarks page and click the bookmarklet.
          It auto-paginates through all your bookmarks with a 10-second delay between pages. If rate-limited,
          navigate to where it stopped and click again.
        </div>
      </div>

      <div className="import-section">
        <h3>📱 Import from EPUBs</h3>
        <p>Drop AO3-downloaded EPUB files here. The importer reads AO3 metadata embedded in the EPUB to identify and import the fics.</p>
        <div className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); handleEpubFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.epub'))); }}
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept=".epub" multiple onChange={e => handleEpubFiles(Array.from(e.target.files))} />
          {importing ? importMsg : 'Drop EPUB files here or click to browse'}
        </div>
      </div>

      <div className="import-section">
        <h3>🔗 Add by URL</h3>
        <p>Paste any AO3 work URL to add it to your library.</p>
        <div className="add-url-bar">
          <input type="url" placeholder="https://archiveofourown.org/works/12345678" value={addUrl} onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { addByUrl(addUrl); setAddUrl(''); } }} />
          <button className="btn btn-accent btn-sm" onClick={() => { addByUrl(addUrl); setAddUrl(''); }} disabled={importing}>Add</button>
        </div>
      </div>
    </>
  );
}
