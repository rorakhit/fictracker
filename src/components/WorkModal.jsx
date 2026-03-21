import { useMemo } from 'react';
import Stars from './Stars';
import { ratingClass } from '../utils/helpers';

export default function WorkModal({ work, status, editStatus, setEditStatus, editRating, setEditRating, editNotes, setEditNotes, editChapter, setEditChapter, onSave, onDelete, onClose }) {
  if (!work) return null;

  // Build the best AO3 link we can for this work + reading progress.
  // Priority: direct chapter link > chapter index (navigate) > plain work URL.
  const ao3Link = useMemo(() => {
    if (!work.ao3_id || work.ao3_id <= 0) return null;
    const base = `https://archiveofourown.org/works/${work.ao3_id}`;

    // If user is actively reading and has chapter progress, try to deep-link
    if (editChapter > 0 && editStatus === 'reading') {
      const chapterIds = work.chapter_ids || [];
      const match = chapterIds.find(ch => ch.num === editChapter);
      if (match?.ao3_id) {
        // Direct chapter link — best UX
        return { url: `${base}/chapters/${match.ao3_id}`, label: `Continue Ch. ${editChapter} on AO3` };
      }
      // No chapter IDs stored yet — fall back to navigate page
      // (the extension will populate chapter_ids next time they visit the work)
      return { url: `${base}/navigate`, label: `Continue Ch. ${editChapter} on AO3` };
    }

    return { url: base, label: 'Open on AO3' };
  }, [work.ao3_id, work.chapter_ids, editChapter, editStatus]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{work.title}</h2>
        <div className="modal-author">by {(work.authors || []).join(', ') || 'Anonymous'}</div>
        {work.summary && <div className="modal-summary">{work.summary}</div>}
        <div className="modal-meta">
          {work.word_count && <span>{work.word_count.toLocaleString()} words</span>}
          {work.chapter_count && <span>{work.chapter_count}{work.chapter_total ? '/' + work.chapter_total : '/?'} chapters</span>}
          {!work.is_complete && <span style={{ color: 'var(--warning)' }}>WIP</span>}
          {work.kudos && <span>♥ {work.kudos.toLocaleString()} kudos</span>}
          {work.hits && <span>{work.hits.toLocaleString()} hits</span>}
        </div>
        <div className="work-tags" style={{ marginBottom: 16 }}>
          {work.rating && <span className={`tag ${ratingClass(work.rating)}`}>{work.rating}</span>}
          {(work.fandoms || []).map(f => <span key={f} className="tag fandom">{f}</span>)}
          {(work.relationships || []).map(r => <span key={r} className="tag ship">{r}</span>)}
          {(work.characters || []).slice(0, 6).map(c => <span key={c} className="tag">{c}</span>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="modal-section">
            <label>Status</label>
            <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
              <option value="to_read">To Read</option>
              <option value="reading">Reading</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="dropped">Dropped</option>
            </select>
          </div>
          <div className="modal-section">
            <label>My Rating</label>
            <div style={{ paddingTop: 6 }}><Stars value={editRating} onChange={setEditRating} /></div>
          </div>
        </div>

        {(editStatus === 'reading' && (work.chapter_total || work.chapter_count > 1)) && (
          <div className="modal-section">
            <label>Current Chapter ({editChapter}/{work.chapter_total || work.chapter_count})</label>
            <input type="range" min="0" max={work.chapter_total || work.chapter_count}
              value={editChapter} onChange={e => setEditChapter(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
            <div className="progress-bar"><div className="progress-fill" style={{ width: `${(editChapter / (work.chapter_total || work.chapter_count)) * 100}%` }}></div></div>
          </div>
        )}

        <div className="modal-section">
          <label>Notes</label>
          <textarea placeholder="Your thoughts, favorite moments, etc..." value={editNotes} onChange={e => setEditNotes(e.target.value)} />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', marginRight: 'auto' }}
            onClick={() => { if (confirm('Remove this fic from your library?')) onDelete(work.id); }}>Remove</button>
          {ao3Link && (
            <a className="btn btn-ghost btn-sm" href={ao3Link.url} target="_blank" rel="noopener"
              onClick={e => e.stopPropagation()}
              style={{ textDecoration: 'none' }}>{ao3Link.label}</a>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
