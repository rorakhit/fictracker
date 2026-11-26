// Shown once, right after the extension is installed.

export default function Welcome({ onClose, onImport }) {
  return (
    <div className="import-section" style={{ marginBottom: 16, lineHeight: 1.6 }}>
      <h3>👋 Welcome to FicTracker</h3>
      <p>
        There's nothing to sign up for. Open any fic on AO3 and the FicTracker panel appears
        in the corner. Add the fic, and as you read, it keeps track of the chapter you're on.
        Everything stays in this browser.
      </p>
      <ul style={{ margin: '8px 0 12px 18px', fontSize: 13, color: 'var(--text-muted)' }}>
        <li>
          <strong style={{ color: 'var(--text)' }}>Used the fictracker.app website before?</strong>{' '}
          Open <a href="https://fictracker.app" target="_blank" rel="noreferrer">fictracker.app</a> once
          in this browser and your old library is copied in automatically.
        </li>
        <li>
          <strong style={{ color: 'var(--text)' }}>Have a backup file or AO3 EPUBs?</strong>{' '}
          Bring them in from the Import tab.
        </li>
        <li>
          Click the FicTracker button in your browser toolbar to come back to this page.
        </li>
      </ul>
      <div style={{ display: 'flex', gap: 10 }}>
        <a className="btn btn-accent" href="https://archiveofourown.org" target="_blank" rel="noreferrer">Go to AO3</a>
        <button className="btn btn-ghost" onClick={onImport}>Import</button>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
