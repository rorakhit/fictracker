import { useState, useRef } from 'react';
import { exportAllData, importAllData } from '../storage/local';

export default function ImportView({ importing, importMsg, addByUrl, handleEpubFiles }) {
  const [addUrl, setAddUrl]       = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [importFileMsg, setImportFileMsg] = useState('');
  const fileRef     = useRef(null);
  const backupRef   = useRef(null);

  // -------------------------------------------------------------------------
  // JSON backup export
  // -------------------------------------------------------------------------
  function handleExport() {
    try {
      const data = exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `fictracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg('Backup downloaded.');
    } catch (e) {
      setExportMsg('Export failed: ' + e.message);
    }
  }

  // -------------------------------------------------------------------------
  // JSON backup import
  // -------------------------------------------------------------------------
  async function handleBackupFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importAllData(data);
      setImportFileMsg('Backup restored! Reload the page to see your library.');
    } catch (e) {
      setImportFileMsg('Import failed: ' + e.message);
    }
  }

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Add by URL                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>🔗 Add by URL</h3>
        <p style={{ lineHeight: 1.6 }}>
          Paste any AO3 work URL. FicTracker fetches the fic's metadata from AO3 —
          that's the <em>only</em> external request we make. Your reading data stays
          in your browser.
        </p>
        <div className="add-url-bar">
          <input
            type="url"
            placeholder="https://archiveofourown.org/works/12345678"
            value={addUrl}
            onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { addByUrl(addUrl); setAddUrl(''); }
            }}
          />
          <button
            className="btn btn-accent btn-sm"
            onClick={() => { addByUrl(addUrl); setAddUrl(''); }}
            disabled={importing}
          >
            Add
          </button>
        </div>
        {importMsg && (
          <div style={{
            fontSize: 12, marginTop: 8,
            color: importMsg.includes('Could not') || importMsg.includes('Error')
              ? '#ef4444' : 'var(--accent-teal)',
          }}>
            {importMsg}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>Note on explicit fics:</strong> AO3 shows an adult
          content gate for some works. If a URL fails to add, try using the browser extension instead —
          it can fetch while you're logged in to AO3.
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* EPUB import                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>📱 Import from EPUBs</h3>
        <p>
          Drop AO3-downloaded EPUB files here. The importer reads AO3 metadata
          embedded in the file — no internet connection needed.
        </p>
        <div
          className={`drop-zone ${dragActive ? 'active' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => {
            e.preventDefault();
            setDragActive(false);
            handleEpubFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.epub')));
          }}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".epub"
            multiple
            onChange={e => handleEpubFiles(Array.from(e.target.files))}
          />
          {importing ? importMsg : 'Drop EPUB files here or click to browse'}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bookmarklet / extension                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>🧩 Browser Extension & Bookmarklets</h3>
        <p style={{ lineHeight: 1.6 }}>
          The FicTracker extension adds a panel to every AO3 page — add fics, update
          status, and sync chapters without leaving AO3. Bookmarklets work on iPad
          and Firefox mobile where extensions aren't available.
        </p>
        <p style={{ lineHeight: 1.6 }}>
          Set up your extension and bookmarklets in <strong>Settings</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a
            href="https://chromewebstore.google.com/detail/fictracker/phfdhkgaagelchgejhhpelhcmebomdim"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px',
              background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
              color: 'white', borderRadius: 8, fontWeight: 700,
              fontSize: 13, textDecoration: 'none',
            }}
          >
            🧩 Add to Chrome
          </a>
          <a
            href="https://addons.mozilla.org/en-US/firefox/addon/fictracker/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', background: 'var(--surface)',
              color: 'var(--text)', borderRadius: 8, fontWeight: 700,
              fontSize: 13, textDecoration: 'none', border: '1px solid var(--border)',
            }}
          >
            🦊 Add to Firefox
          </a>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bulk bookmark import (bookmarklet)                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>📥 Bulk Import — Bookmarklet</h3>
        <p style={{ lineHeight: 1.6 }}>
          To import your entire AO3 bookmarks library, use the Bulk Import bookmarklet
          from the <strong>Settings</strong> tab. It runs in your browser on your AO3
          bookmarks page — no login required by FicTracker.
        </p>
        <div style={{
          padding: '12px 14px',
          background: 'rgba(20,184,166,0.06)',
          borderRadius: 8,
          border: '1px solid rgba(20,184,166,0.15)',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--text)' }}>How it works:</strong> The bookmarklet
          runs in your browser while you're on your AO3 bookmarks page. It reads and sends
          fic metadata to FicTracker — nothing else is collected. Paginates automatically
          with a 10-second delay to be respectful to AO3's servers.
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Data export / import (backup)                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>💾 Backup & Restore</h3>
        <p style={{ lineHeight: 1.6 }}>
          Since your library lives in your browser, it won't survive a cache clear or a
          new device unless you back it up. Export your data as a JSON file and import
          it on any browser to restore.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className="btn btn-accent" onClick={handleExport}>
            ⬇ Export backup
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => backupRef.current?.click()}
          >
            ⬆ Restore from backup
          </button>
          <input
            ref={backupRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleBackupFile(e.target.files[0]); }}
          />
        </div>

        {exportMsg && (
          <div style={{ fontSize: 12, color: 'var(--accent-teal)', marginBottom: 6 }}>
            {exportMsg}
          </div>
        )}
        {importFileMsg && (
          <div style={{
            fontSize: 12,
            color: importFileMsg.includes('failed') ? '#ef4444' : 'var(--accent-teal)',
            marginBottom: 6,
          }}>
            {importFileMsg}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The backup file includes your library, shelves, Fic Finder presets, and settings.
          It does not include your AO3 login or any account information.
        </div>
      </div>
    </>
  );
}
