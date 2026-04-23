// SeriesView — shows multi-work AO3 series where you have at least one work
// in your library. Works within a series are displayed in position order so
// you can spot gaps (e.g. you have parts 1, 3, 4 but skipped part 2).
//
// Design note: we intentionally don't fetch the AO3 series page here because
// (a) it's an extra network call per series and (b) the local-first philosophy
// means we don't pull data you haven't explicitly added. We surface what you
// have and let you click through to AO3 for the full picture.

import { ratingClass } from '../utils/helpers';

const STATUS_LABELS = {
  to_read:        { label: 'To Read',   color: 'var(--blue)' },
  reading:        { label: 'Reading',   color: 'var(--warning)' },
  completed:      { label: 'Done',      color: 'var(--success)' },
  on_hold:        { label: 'On Hold',   color: 'var(--purple)' },
  dnf:            { label: 'DNF',       color: '#f97316' },
  dropped:        { label: 'Dropped',   color: 'var(--text-muted)' },
  author_abandoned: { label: 'Abandoned', color: 'var(--rose)' },
};

function progressSummary(works, statuses) {
  const total = works.length;
  const done  = works.filter(w => statuses[w.id]?.status === 'completed').length;
  return { total, done };
}

export default function SeriesView({ seriesMap, statuses, onOpenWork }) {
  const series = Array.from(seriesMap.values());

  if (series.length === 0) {
    return (
      <div className="empty" style={{ padding: '40px 0' }}>
        <div className="emoji">📚</div>
        <p style={{ marginBottom: 8 }}>No series tracked yet.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, lineHeight: 1.6 }}>
          When you add a fic that's part of an AO3 series via URL, it'll appear here
          so you can track which parts you've read.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {series.length} series tracked · {series.reduce((s, sr) => s + sr.works.length, 0)} works
      </div>

      {series.map(sr => {
        const { total, done } = progressSummary(sr.works, statuses);
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const ao3SeriesUrl = `https://archiveofourown.org/series/${sr.ao3_series_id}`;

        return (
          <div
            key={sr.ao3_series_id}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '16px 20px',
            }}
          >
            {/* Series header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{sr.series_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {done}/{total} parts completed in your library
                </div>
              </div>
              <a
                href={ao3SeriesUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flexShrink: 0,
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--accent-teal)',
                  textDecoration: 'none',
                  padding: '5px 10px',
                  border: '1px solid rgba(20,184,166,0.3)',
                  borderRadius: 6,
                  background: 'rgba(20,184,166,0.06)',
                }}
              >
                Full series on AO3 →
              </a>
            </div>

            {/* Progress bar */}
            <div className="progress-bar" style={{ marginBottom: 14 }}>
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>

            {/* Works list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sr.works.map((w, idx) => {
                const st = statuses[w.id]?.status || 'to_read';
                const stInfo = STATUS_LABELS[st] || { label: st, color: 'var(--text-muted)' };
                // Detect position gap: if this work's position is more than 1 ahead
                // of the previous work's position, there's a gap in the series.
                const prevPos = idx > 0 ? (sr.works[idx - 1].position_in_series || 0) : 0;
                const thisPos = w.position_in_series || 0;
                const hasGapBefore = thisPos > 0 && prevPos > 0 && thisPos > prevPos + 1;

                return (
                  <div key={w.id}>
                    {hasGapBefore && (
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)', padding: '4px 10px',
                        background: 'rgba(245,158,11,0.06)',
                        border: '1px dashed rgba(245,158,11,0.3)',
                        borderRadius: 6, marginBottom: 6,
                      }}>
                        ⚠ Parts {prevPos + 1}–{thisPos - 1} not in your library
                      </div>
                    )}
                    <div
                      onClick={() => onOpenWork(w)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      {/* Position badge */}
                      {w.position_in_series && (
                        <div style={{
                          flexShrink: 0,
                          width: 24, height: 24,
                          borderRadius: '50%',
                          background: 'rgba(20,184,166,0.1)',
                          border: '1px solid rgba(20,184,166,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'var(--accent-teal)',
                        }}>
                          {w.position_in_series}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {w.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {(w.authors || []).join(', ')}
                          {w.word_count ? ` · ${w.word_count.toLocaleString()} words` : ''}
                          {w.rating ? ` · ` : ''}
                          {w.rating && <span className={`tag ${ratingClass(w.rating)}`} style={{ fontSize: 10, padding: '1px 6px' }}>{w.rating}</span>}
                        </div>
                      </div>
                      <div style={{
                        flexShrink: 0,
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: 6,
                        background: `color-mix(in srgb, ${stInfo.color} 15%, transparent)`,
                        color: stInfo.color,
                        border: `1px solid color-mix(in srgb, ${stInfo.color} 25%, transparent)`,
                      }}>
                        {stInfo.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
