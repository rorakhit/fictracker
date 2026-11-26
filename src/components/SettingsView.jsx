import { useState } from 'react';
import { clearAllData, getSettings, saveSettings } from '../storage/local';
import { READING_SPEEDS } from '../utils/helpers';
import { checkSettings } from '../core/follows';

const CHECK_EVERY = [[6, 'Every 6 hours'], [12, 'Every 12 hours'], [24, 'Once a day'], [72, 'Every 3 days']];

export default function SettingsView() {
  const [confirmClear, setConfirmClear]   = useState(false);

  // Reading speed
  const [readingWpm, setReadingWpmState] = useState(() => getSettings().readingWpm || 250);
  function setReadingWpm(wpm) {
    setReadingWpmState(wpm);
    saveSettings({ ...getSettings(), readingWpm: wpm });
  }

  const [checks, setChecksState] = useState(() => checkSettings(getSettings()));
  function setChecks(next) {
    const merged = { ...checks, ...next };
    setChecksState(merged);
    saveSettings({ ...getSettings(), autoCheck: merged.autoCheck, autoCheckHours: merged.hours });
  }

  async function handleClearData() {
    if (!confirmClear) { setConfirmClear(true); return; }
    await clearAllData();
    window.location.reload();
  }

  return (
    <div className="settings-card">
      <h2>Settings</h2>

      {/* ---------------------------------------------------------------- */}
      {/* Support                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>☕ Support FicTracker</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          FicTracker is free, ad-free, and always will be. If it saves you time and you want
          to say thanks, a small tip genuinely helps keep it going.
        </p>
        <a
          href="https://ko-fi.com/rorak"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 18px',
            background: 'var(--surface)',
            color: 'var(--text)', borderRadius: 8, fontWeight: 700,
            fontSize: 13, textDecoration: 'none',
            border: '1px solid var(--border)',
          }}
        >
          ☕ Buy me a Ko-fi
        </a>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Privacy notice                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Your data</h3>
        <div style={{
          padding: '12px 16px',
          background: 'rgba(20,184,166,0.06)',
          borderRadius: 10,
          border: '1px solid rgba(20,184,166,0.15)',
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            🔒 Your reading data stays in this browser
          </div>
          <div style={{ color: 'var(--text-muted)' }}>
            Your library, shelves, ratings, and notes are kept in this browser's extension
            storage. FicTracker has no account and no server. The only site it talks to is
            AO3 itself, to read a fic's details when you add it or check for new chapters.
            No AI is used anywhere in FicTracker.
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Reading speed                                                    */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Reading speed</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Used to estimate how long a fic will take you. Shown on library cards and the fic detail view.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['Slow', READING_SPEEDS.slow], ['Average', READING_SPEEDS.average], ['Fast', READING_SPEEDS.fast]].map(([label, wpm]) => (
            <button
              key={wpm}
              onClick={() => setReadingWpm(wpm)}
              style={{
                padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: `1px solid ${readingWpm === wpm ? 'var(--accent-teal)' : 'var(--border)'}`,
                background: readingWpm === wpm ? 'rgba(20,184,166,0.1)' : 'var(--surface)',
                color: readingWpm === wpm ? 'var(--accent-teal)' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {label} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{wpm} wpm</span>
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              min="50" max="2000"
              value={readingWpm}
              onChange={e => { const v = parseInt(e.target.value); if (v >= 50 && v <= 2000) setReadingWpm(v); }}
              style={{ width: 70, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>wpm</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Automatic checks                                                  */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, marginBottom: 28 }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Automatic checks</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          While your browser is open, FicTracker checks AO3 for new chapters in the unfinished fics
          you're reading or plan to read, and for new works from authors and series you follow.
          The number on the FicTracker toolbar button shows what's new. Requests go one every few
          seconds, and FicTracker pauses if AO3 asks it to slow down.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checks.autoCheck}
            onChange={e => setChecks({ autoCheck: e.target.checked })}
          />
          Check automatically
        </label>
        <select
          value={checks.hours}
          disabled={!checks.autoCheck}
          onChange={e => setChecks({ hours: Number(e.target.value) })}
          aria-label="How often to check"
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}
        >
          {CHECK_EVERY.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
        </select>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Danger zone                                                       */}
      {/* ---------------------------------------------------------------- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
        <h3 style={{ fontSize: 16, marginBottom: 8 }}>Danger zone</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Clearing all data removes your library, shelves, follows, Fic Finder presets, and settings from this
          browser. <strong>Export a backup first</strong> if you want to keep anything.
        </p>
        <button
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #e04666',
            background: confirmClear ? '#e04666' : 'transparent',
            color: confirmClear ? '#fff' : '#e04666',
            cursor: 'pointer',
          }}
          onClick={handleClearData}
        >
          {confirmClear ? 'Tap again to confirm — this cannot be undone' : 'Clear all data'}
        </button>
        {confirmClear && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 10 }}
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
