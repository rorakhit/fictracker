import { useState, useRef } from 'react';
import { generateBookmarklet } from '../utils/helpers';

export default function ImportView({ session, importing, importMsg, addByUrl, handleEpubFiles }) {
  const [addUrl, setAddUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);

  const bookmarkletCode = generateBookmarklet(session, 'https://nivqfnrkpuoyjtugavtj.supabase.co');

  return (
    <>
      <div className="import-section">
        <h3>📥 Bulk Import — AO3 Bookmarks</h3>
        <p style={{ lineHeight: 1.6 }}>
          Import your entire AO3 bookmarks library at once. This bookmarklet scrapes all pages of your AO3 bookmarks
          and adds every fic to FicTracker. Use this for your <strong>initial import</strong> or to catch up on new bookmarks.
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
        <div style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(59,130,246,0.06)',
          borderRadius: 8,
          border: '1px solid rgba(59,130,246,0.12)',
        }}>
          Looking for the <strong style={{ color: 'var(--blue)' }}>Quick Add</strong> bookmarklet to add individual fics while reading?
          Head to the <strong style={{ color: 'var(--blue)' }}>Settings</strong> tab.
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
