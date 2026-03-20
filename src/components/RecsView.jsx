import { wordCountLabel } from '../utils/helpers';

export default function RecsView({ recommendations, onOpenWork }) {
  return (
    <>
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>Recommended For You</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>Based on fics you've rated 4+ stars. Rate more fics to improve recommendations.</p>
      {recommendations.length === 0 ? (
        <div className="empty"><div className="emoji">🔮</div><p>Rate some fics with 4+ stars and come back for personalized recommendations!</p></div>
      ) : recommendations.map(w => (
        <div key={w.id} className="rec-card" style={{ cursor: 'pointer' }} onClick={() => onOpenWork(w)}>
          <div className="rec-reason">{w.reasons.join(' · ')}</div>
          <div className="work-title">{w.title}</div>
          <div className="work-author">by {(w.authors || []).join(', ') || 'Anonymous'}</div>
          <div className="work-meta" style={{ marginTop: 6 }}>
            {w.word_count && <span>{wordCountLabel(w.word_count)} words</span>}
            {w.kudos && <span>♥ {w.kudos.toLocaleString()}</span>}
            {(w.fandoms || []).slice(0, 2).map(f => <span key={f} className="tag fandom">{f.length > 25 ? f.slice(0, 22) + '...' : f}</span>)}
            {(w.relationships || []).slice(0, 2).map(r => <span key={r} className="tag ship">{r}</span>)}
          </div>
        </div>
      ))}
    </>
  );
}
