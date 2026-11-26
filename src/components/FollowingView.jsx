// FollowingView: new works from authors and series you follow, and the
// list of what you follow. The background worker checks each follow's AO3
// page on the same schedule as WIP checks (see Settings); this tab only
// shows the results and sends your choices back to it.

import { useState } from 'react';
import { describeCheck } from '../hooks/useLibrary';

const ao3Link = f => f.kind === 'author'
  ? `https://archiveofourown.org/users/${encodeURIComponent(f.id)}`
  : `https://archiveofourown.org/series/${encodeURIComponent(f.id)}`;

// "skywriter", "https://archiveofourown.org/users/skywriter/pseuds/Sky",
// or "https://archiveofourown.org/series/123" → what to follow.
function parseFollowInput(input) {
  const s = input.trim();
  const series = s.match(/archiveofourown\.org\/series\/(\d+)/);
  if (series) return { kind: 'series', id: series[1], name: `Series ${series[1]}` };
  const user = s.match(/archiveofourown\.org\/users\/([^/?#\s]+)/);
  if (user) return { kind: 'author', id: decodeURIComponent(user[1]), name: decodeURIComponent(user[1]) };
  if (/^[A-Za-z0-9_]+$/.test(s)) return { kind: 'author', id: s, name: s };
  return null;
}

function NewsCard({ item, onAdd, onDismiss }) {
  const w = item.work;
  return (
    <div className="work-card" style={{ cursor: 'default' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="work-title">
            <a href={`https://archiveofourown.org/works/${w.id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
              {w.title}
            </a>
          </div>
          <div className="work-author">by {(w.authors || []).join(', ')}</div>
          <div className="work-meta">
            <span>{item.kind === 'series' ? `New in ${item.follow_name}` : `New from ${item.follow_name}`}</span>
            {w.word_count ? <span>{w.word_count.toLocaleString()} words</span> : null}
            <span>{w.chapter_count || '?'}/{w.chapter_total || '?'} ch</span>
            {w.rating && <span>{w.rating}</span>}
            {w.date_updated && <span>{w.date_updated}</span>}
          </div>
          {w.fandoms?.length > 0 && (
            <div className="work-tags">
              {w.fandoms.slice(0, 3).map(f => <span key={f} className="tag">{f}</span>)}
            </div>
          )}
          {w.summary && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              {w.summary.length > 280 ? w.summary.slice(0, 277) + '…' : w.summary}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-accent btn-sm" onClick={() => onAdd(item.key)}>Add as To Read</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDismiss([item.key])}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export default function FollowingView({ follows, news, follow, unfollow, addNews, dismissNews, checkFollows, check }) {
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const list = Object.entries(follows).map(([key, f]) => ({ key, ...f }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const authors = list.filter(f => f.kind === 'author');
  const series = list.filter(f => f.kind === 'series');
  const running = Boolean(check?.running);
  const checkLine = check && check.scope !== 'wips' ? describeCheck(check) : '';

  async function submit() {
    const target = parseFollowInput(input);
    if (!target) { setMsg('Enter an AO3 username, or a link to an author or series on AO3.'); return; }
    try {
      await follow(target.kind, target.id, target.name);
      setMsg(`Following ${target.name}. Works already there aren't counted as new.`);
      setInput('');
    } catch (e) {
      setMsg(`Couldn't follow: ${e.message}`);
    }
  }

  const act = fn => (...args) => fn(...args).catch(e => setMsg(e.message));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="import-section" style={{ marginBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>New from who you follow</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {news.length > 1 && (
              <button className="btn btn-ghost btn-sm" onClick={() => act(dismissNews)(news.map(n => n.key))}>Dismiss all</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={act(checkFollows)} disabled={!list.length && !running}>
              {running ? 'Stop' : 'Check now'}
            </button>
          </div>
        </div>
        {checkLine && <div style={{ fontSize: 12, color: 'var(--accent-teal)', marginTop: 8, whiteSpace: 'pre-line' }}>{checkLine}</div>}
        {news.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
            {list.length
              ? 'Nothing new yet. FicTracker checks AO3 now and then (see Settings) and lists new works here.'
              : 'Follow an author or series from the FicTracker panel on any AO3 work page, or add one below.'}
          </p>
        ) : (
          <div className="work-list" style={{ marginTop: 12 }}>
            {news.map(n => (
              <NewsCard key={n.key} item={n} onAdd={act(k => addNews(k, 'to_read'))} onDismiss={act(dismissNews)} />
            ))}
          </div>
        )}
      </div>

      <div className="import-section" style={{ marginBottom: 0 }}>
        <h3>Following</h3>
        <div className="add-url-bar">
          <input
            type="text"
            placeholder="AO3 username, or a link to an author or series"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            aria-label="Author or series to follow"
          />
          <button className="btn btn-accent btn-sm" onClick={submit}>Follow</button>
        </div>
        {msg && <div style={{ fontSize: 12, color: 'var(--accent-teal)', marginBottom: 10 }}>{msg}</div>}

        {[['Authors', authors], ['Series', series]].map(([label, items]) => items.length > 0 && (
          <div key={label} style={{ marginBottom: 14 }}>
            <div className="shelf-strip-label" style={{ marginBottom: 6 }}>{label}</div>
            {items.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <a href={ao3Link(f)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, color: 'var(--text)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </a>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {f.checked_at ? `checked ${new Date(f.checked_at).toLocaleDateString()}` : 'not checked yet'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => act(unfollow)(f.key)}>Unfollow</button>
              </div>
            ))}
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          For each author, FicTracker reads the first page of their works on AO3, newest first; for
          each series, the series page. That's one request per follow per check.
        </div>
      </div>
    </div>
  );
}
