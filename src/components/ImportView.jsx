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
        <h3>📥 Import AO3 Bookmarks</h3>
        <p>Click "Copy Bookmarklet" below, then create a new bookmark in your browser and paste it as the URL. Or drag the purple button to your bookmarks bar. Then visit your AO3 bookmarks page and click it.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <button className="btn btn-accent" onClick={() => {
            navigator.clipboard.writeText(bookmarkletCode).then(() => {
              const btn = document.activeElement;
              const orig = btn.textContent;
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = orig, 2000);
            });
          }}>Copy Bookmarklet</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Then: right-click bookmarks bar → Add page → paste as URL</span>
        </div>
        <a className="bookmarklet-link" href={bookmarkletCode}>📖 Import to FicTracker</a>
        <p style={{ marginTop: 12, fontSize: 12 }}>Starts from whatever page you're on and goes forward. 10-second delay between pages, 60-second backoff if rate-limited. To resume after a rate limit, navigate to the page it stopped at and click again.</p>
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
