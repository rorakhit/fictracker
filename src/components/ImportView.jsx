import { useState, useRef } from 'react';
import { exportAllData, importAllData } from '../storage/local';

export default function ImportView({ importing, importMsg, addByUrl, handleEpubFiles, ao3User }) {
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
      await importAllData(data);
      setImportFileMsg('Backup restored.');
    } catch (e) {
      setImportFileMsg('Import failed: ' + e.message);
    }
  }

  const ao3 = path => `https://archiveofourown.org/users/${encodeURIComponent(ao3User)}/${path}`;

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* AO3 history and bookmarks                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>📖 Import from AO3</h3>
        <p style={{ lineHeight: 1.6 }}>
          Bring in the fics you've already read or bookmarked. Open your history or bookmarks
          on AO3 and use the FicTracker panel there. It reads one page every few seconds, and
          fics already in your library keep their status and progress.
        </p>
        {ao3User ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn btn-accent" href={ao3('readings')} target="_blank" rel="noopener noreferrer">Open my AO3 history</a>
            <a className="btn btn-ghost" href={ao3('bookmarks')} target="_blank" rel="noopener noreferrer">Open my AO3 bookmarks</a>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 0 }}>
            <a href="https://archiveofourown.org/users/login" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-teal)' }}>
              Log in to AO3
            </a>{' '}
            in this browser, and links to your history and bookmarks appear here. Your history needs
            AO3's history setting turned on (it is by default).
          </p>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          Anyone's public bookmarks page can be imported the same way, which is handy for rec lists.
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Add by URL                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>🔗 Add by URL</h3>
        <p style={{ lineHeight: 1.6 }}>
          Paste any AO3 work URL and FicTracker reads the fic's details from AO3.
          Easier still: open the fic on AO3 and use the FicTracker panel in the corner.
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
          <strong style={{ color: 'var(--text)' }}>Locked or adult fics:</strong> log in to AO3 in
          this browser first and FicTracker can read them too.
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
      {/* Data export / import (backup)                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="import-section">
        <h3>💾 Backup & Restore</h3>
        <p style={{ lineHeight: 1.6 }}>
          Your library lives in this browser. Removing the extension deletes it, and it
          doesn't follow you to other devices. Export a backup file now and then, and
          restore it on any browser with FicTracker installed. Restoring merges the backup
          into what's already here.
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
