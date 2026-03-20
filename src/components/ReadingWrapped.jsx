import { useState } from 'react';

/**
 * ReadingWrapped — Spotify Wrapped-style summary cards for monthly and yearly
 * reading data. Designed to be shareable (future: export as image via Canvas).
 *
 * Takes wrapped data objects from useAnalytics and renders them as bold,
 * visual summary cards. Each card is self-contained so it can eventually
 * be exported as a standalone image.
 */

function formatWords(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

function WrappedCard({ wrapped, period }) {
  if (wrapped.words === 0 && wrapped.ficsCompleted === 0) {
    return (
      <div className="wrapped-card">
        <h3>{period}</h3>
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          No reading activity {period === wrapped.label ? `in ${wrapped.label}` : 'yet'}. Time to open a fic!
        </div>
      </div>
    );
  }

  return (
    <div className="wrapped-card">
      <h3>
        <span style={{ color: 'var(--accent)' }}>{wrapped.label}</span> Reading Wrapped
      </h3>

      <div className="wrapped-grid">
        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Words Read</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--accent)' }}>
            {formatWords(wrapped.words)}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Fics Completed</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--success)' }}>
            {wrapped.ficsCompleted}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Chapters Read</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--blue)' }}>
            {wrapped.chapters.toLocaleString()}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Fandoms Explored</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--purple)' }}>
            {wrapped.uniqueFandoms}
          </div>
        </div>

        {wrapped.topFandom && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Top Fandom
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
              {wrapped.topFandom}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatWords(wrapped.topFandomWords)} words
            </div>
          </div>
        )}

        {wrapped.topShip && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Top Ship
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--purple)' }}>
              {wrapped.topShip}
            </div>
          </div>
        )}

        {wrapped.longestFic && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Longest Fic Completed
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              {wrapped.longestFic.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatWords(wrapped.longestFic.word_count || 0)} words
              {wrapped.longestFic.authors?.length > 0 && ` by ${wrapped.longestFic.authors[0]}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReadingWrapped({ monthlyWrapped, yearlyWrapped }) {
  const [showWrapped, setShowWrapped] = useState(false);

  return (
    <div className="wrapped-container">
      <div
        className="chart-card full"
        style={{ textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
        onClick={() => setShowWrapped(!showWrapped)}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>
          {showWrapped ? '📖' : '🎁'}
        </div>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {showWrapped ? 'Hide' : 'View'} Your Reading Wrapped
        </h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {showWrapped ? 'Click to collapse' : 'See your reading highlights at a glance'}
        </div>
      </div>

      {showWrapped && (
        <>
          <WrappedCard wrapped={monthlyWrapped} period="This Month" />
          <WrappedCard wrapped={yearlyWrapped} period="This Year" />
        </>
      )}
    </div>
  );
}
