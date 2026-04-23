// src/components/FicFinderView.jsx
// Fic Finder — user-defined filter presets.
//
// The whole point of this view is to put the user in control:
//   you write the rules, we apply them.
// No algorithms, no suggestions — just your preferences expressed
// as saved filters you can run against your library or send to AO3.
//
// Two sections:
//   1. Your Queue  — taste-based ordering of your existing to_read/reading
//   2. Fic Finder  — create/run/save filter presets

import { useState, useMemo } from 'react';
import { getFinderPresets, saveFinderPresets } from '../storage/local';
import { wordCountLabel } from '../utils/helpers';

// ---------------------------------------------------------------------------
// AO3 search URL builder
// AO3's search form uses array-style query params: work_search[fandom_names][]
// ---------------------------------------------------------------------------
function buildAO3SearchUrl(preset) {
  const params = new URLSearchParams();

  (preset.fandoms_include || []).forEach(f => {
    params.append('work_search[fandom_names][]', f);
  });
  (preset.ships_include || []).forEach(r => {
    params.append('work_search[relationship_names][]', r);
  });
  (preset.tags_include || []).forEach(t => {
    params.append('work_search[freeform_names][]', t);
  });
  (preset.tags_exclude || []).forEach(t => {
    params.append('work_search[excluded_tag_names][]', t);
  });

  if (preset.word_count_min) params.set('work_search[word_count_min]', preset.word_count_min);
  if (preset.word_count_max) params.set('work_search[word_count_max]', preset.word_count_max);

  if (preset.completion === 'complete') params.set('work_search[complete]', 'T');
  if (preset.completion === 'wip')      params.set('work_search[complete]', 'F');

  params.set('commit', 'Search Works');
  return `https://archiveofourown.org/works/search?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Filter a works array against a preset
// ---------------------------------------------------------------------------
function applyPreset(works, statuses, preset) {
  return works.filter(w => {
    const fandoms  = w.fandoms        || [];
    const ships    = w.relationships  || [];
    const tags     = w.freeform_tags  || [];
    const wc       = w.word_count     || 0;

    if ((preset.fandoms_include || []).length > 0) {
      if (!preset.fandoms_include.some(f => fandoms.includes(f))) return false;
    }
    if ((preset.fandoms_exclude || []).length > 0) {
      if (preset.fandoms_exclude.some(f => fandoms.includes(f))) return false;
    }
    if ((preset.ships_include || []).length > 0) {
      if (!preset.ships_include.some(r => ships.includes(r))) return false;
    }
    if ((preset.ships_exclude || []).length > 0) {
      if (preset.ships_exclude.some(r => ships.includes(r))) return false;
    }
    if ((preset.tags_include || []).length > 0) {
      if (!preset.tags_include.some(t => tags.includes(t))) return false;
    }
    if ((preset.tags_exclude || []).length > 0) {
      if (preset.tags_exclude.some(t => tags.includes(t))) return false;
    }
    if (preset.word_count_min && wc < Number(preset.word_count_min)) return false;
    if (preset.word_count_max && wc > Number(preset.word_count_max)) return false;
    if (preset.completion === 'complete' && !w.is_complete)  return false;
    if (preset.completion === 'wip'      &&  w.is_complete)  return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Empty preset factory
// ---------------------------------------------------------------------------
function newPreset(name = '') {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name,
    fandoms_include: [],
    fandoms_exclude: [],
    ships_include:   [],
    ships_exclude:   [],
    tags_include:    [],
    tags_exclude:    [],
    word_count_min:  '',
    word_count_max:  '',
    completion:      'any', // 'any' | 'complete' | 'wip'
  };
}

// ---------------------------------------------------------------------------
// Tag chip input component (type a tag, press Enter/comma to add)
// ---------------------------------------------------------------------------
function TagInput({ label, values, onChange, placeholder, accentColor }) {
  const [input, setInput] = useState('');

  function commit() {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput('');
  }

  function onKey(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !input && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  const chipColor = accentColor || 'var(--accent)';

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        padding: '6px 8px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        minHeight: 36,
        cursor: 'text',
      }}>
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            background: chipColor + '22',
            color: chipColor,
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {v}
            <button
              onClick={() => onChange(values.filter(x => x !== v))}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: chipColor, padding: 0, lineHeight: 1, fontSize: 14,
              }}
            >×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ''}
          style={{
            flex: '1 1 120px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 12,
            color: 'var(--text)',
            minWidth: 80,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset editor panel
// ---------------------------------------------------------------------------
function PresetEditor({ preset, onChange, onSave, onCancel }) {
  function update(field, val) { onChange({ ...preset, [field]: val }); }

  return (
    <div style={{
      padding: '16px 18px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      marginBottom: 16,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Preset name</div>
        <input
          value={preset.name}
          onChange={e => update('name', e.target.value)}
          placeholder="e.g. Long Dramione complete fics"
          style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0 16px',
      }}>
        <TagInput
          label="Fandoms — include any of"
          values={preset.fandoms_include}
          onChange={v => update('fandoms_include', v)}
          placeholder="Bridgerton, Harry Potter…"
          accentColor="var(--accent-teal)"
        />
        <TagInput
          label="Fandoms — exclude"
          values={preset.fandoms_exclude}
          onChange={v => update('fandoms_exclude', v)}
          placeholder="type and press Enter"
          accentColor="#e04666"
        />
        <TagInput
          label="Ships — include any of"
          values={preset.ships_include}
          onChange={v => update('ships_include', v)}
          placeholder="Hermione Granger/Draco Malfoy…"
          accentColor="var(--accent-teal)"
        />
        <TagInput
          label="Ships — exclude"
          values={preset.ships_exclude}
          onChange={v => update('ships_exclude', v)}
          placeholder="type and press Enter"
          accentColor="#e04666"
        />
        <TagInput
          label="Tags — include any of"
          values={preset.tags_include}
          onChange={v => update('tags_include', v)}
          placeholder="hurt/comfort, slow burn…"
          accentColor="var(--accent-teal)"
        />
        <TagInput
          label="Tags — exclude"
          values={preset.tags_exclude}
          onChange={v => update('tags_exclude', v)}
          placeholder="character death…"
          accentColor="#e04666"
        />
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 100px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Min word count</div>
          <input
            type="number"
            min="0"
            placeholder="e.g. 10000"
            value={preset.word_count_min}
            onChange={e => update('word_count_min', e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
          />
        </div>
        <div style={{ flex: '1 1 100px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Max word count</div>
          <input
            type="number"
            min="0"
            placeholder="e.g. 100000"
            value={preset.word_count_max}
            onChange={e => update('word_count_max', e.target.value)}
            style={{ width: '100%', fontSize: 13, padding: '6px 10px' }}
          />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Completion</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['any', 'complete', 'wip'].map(opt => (
              <button
                key={opt}
                onClick={() => update('completion', opt)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: preset.completion === opt ? 'var(--accent)' : 'var(--bg)',
                  color: preset.completion === opt ? '#171520' : 'var(--text-muted)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {opt === 'any' ? 'Any' : opt === 'complete' ? 'Complete' : 'WIP'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn btn-accent btn-sm" onClick={onSave} disabled={!preset.name.trim()}>
          Save preset
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Work card (shared between queue and results)
// ---------------------------------------------------------------------------
function WorkCard({ work, status, onOpenWork }) {
  const st = status?.status || 'to_read';
  const stLabel = { to_read: 'To read', reading: 'Reading', completed: 'Completed', dropped: 'Dropped', on_hold: 'On hold', author_abandoned: 'Abandoned' };

  return (
    <div className="rec-card" style={{ cursor: 'pointer' }} onClick={() => onOpenWork(work)}>
      {work.reasons && work.reasons.length > 0 && (
        <div className="rec-reason">{work.reasons.join(' · ')}</div>
      )}
      <div className="work-title">{work.title}</div>
      <div className="work-author">by {(work.authors || []).join(', ') || 'Anonymous'}</div>
      <div className="work-meta" style={{ marginTop: 6 }}>
        {work.word_count && <span>{wordCountLabel(work.word_count)} words</span>}
        {work.kudos     && <span>♥ {work.kudos.toLocaleString()}</span>}
        {work.is_complete !== undefined && (
          <span style={{ color: work.is_complete ? 'var(--accent-teal)' : 'var(--text-muted)' }}>
            {work.is_complete ? 'Complete' : 'WIP'}
          </span>
        )}
        <span style={{ color: 'var(--text-muted)' }}>{stLabel[st] || st}</span>
        {(work.fandoms || []).slice(0, 2).map(f => (
          <span key={f} className="tag fandom">{f.length > 25 ? f.slice(0, 22) + '…' : f}</span>
        ))}
        {(work.relationships || []).slice(0, 2).map(r => (
          <span key={r} className="tag ship">{r}</span>
        ))}
      </div>
      {work.summary && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {work.summary}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved preset card
// ---------------------------------------------------------------------------
function PresetCard({ preset, works, statuses, onOpenWork, onEdit, onDelete }) {
  const [resultsOpen, setResultsOpen] = useState(false);

  const results = useMemo(
    () => resultsOpen ? applyPreset(works, statuses, preset) : [],
    [resultsOpen, works, statuses, preset]
  );

  const ao3Url = buildAO3SearchUrl(preset);

  const hasAnyCriteria = (
    (preset.fandoms_include?.length || 0) +
    (preset.fandoms_exclude?.length || 0) +
    (preset.ships_include?.length || 0) +
    (preset.ships_exclude?.length || 0) +
    (preset.tags_include?.length || 0) +
    (preset.tags_exclude?.length || 0) +
    (preset.word_count_min ? 1 : 0) +
    (preset.word_count_max ? 1 : 0) +
    (preset.completion !== 'any' ? 1 : 0)
  ) > 0;

  // Summary line of the preset's rules
  const summary = [
    ...(preset.fandoms_include || []).map(f => `fandom: ${f}`),
    ...(preset.ships_include   || []).map(r => `ship: ${r}`),
    ...(preset.tags_include    || []).map(t => `tag: ${t}`),
    ...(preset.fandoms_exclude || []).map(f => `not: ${f}`),
    ...(preset.tags_exclude    || []).map(t => `no: ${t}`),
    preset.word_count_min ? `${Number(preset.word_count_min).toLocaleString()}+ words` : null,
    preset.word_count_max ? `under ${Number(preset.word_count_max).toLocaleString()} words` : null,
    preset.completion !== 'any' ? (preset.completion === 'complete' ? 'complete only' : 'WIP only') : null,
  ].filter(Boolean);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{preset.name}</div>
          {summary.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
              {summary.join(' · ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={onEdit}>Edit</button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, color: '#e04666' }}
            onClick={onDelete}
          >Delete</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-accent btn-sm"
          style={{ fontSize: 12 }}
          onClick={() => setResultsOpen(v => !v)}
          disabled={!hasAnyCriteria}
        >
          {resultsOpen ? 'Hide results' : `Search my library`}
        </button>
        <a
          href={ao3Url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 8,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            textDecoration: 'none',
          }}
        >
          Find on AO3 →
        </a>
      </div>

      {resultsOpen && (
        <div style={{ marginTop: 14 }}>
          {results.length === 0 ? (
            <div style={{
              padding: '12px 14px',
              background: 'var(--bg)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text-muted)',
            }}>
              No fics in your library match these rules. Try "Find on AO3" to search outside your library.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                {results.length} fic{results.length !== 1 ? 's' : ''} matched in your library
              </div>
              {results.map(w => (
                <WorkCard key={w.id} work={w} status={statuses[w.id]} onOpenWork={onOpenWork} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export default function FicFinderView({ recommendations, tasteProfile, onOpenWork, works, statuses }) {
  const [presets, setPresets]   = useState(() => getFinderPresets());
  const [editing, setEditing]   = useState(null);   // preset being edited (or null)
  const [creating, setCreating] = useState(false);
  const [draft, setDraft]       = useState(null);

  function persistPresets(next) {
    setPresets(next);
    saveFinderPresets(next);
  }

  function startCreate() {
    setDraft(newPreset());
    setCreating(true);
    setEditing(null);
  }

  function startEdit(preset) {
    setDraft({ ...preset });
    setEditing(preset.id);
    setCreating(false);
  }

  function savePreset() {
    if (!draft) return;
    if (creating) {
      persistPresets([...presets, draft]);
    } else {
      persistPresets(presets.map(p => (p.id === draft.id ? draft : p)));
    }
    setDraft(null);
    setCreating(false);
    setEditing(null);
  }

  function cancelEdit() {
    setDraft(null);
    setCreating(false);
    setEditing(null);
  }

  function deletePreset(id) {
    persistPresets(presets.filter(p => p.id !== id));
    if (editing === id) cancelEdit();
  }

  const hasRatings = tasteProfile?.ratedCount > 0;
  const hasQueue   = recommendations.length > 0;

  return (
    <>
      {/* ---- Fic Finder ---- */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Fic Finder</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Save your own filter rules as presets. Run them against your library, or open a matching search
          on AO3 — no algorithms, just your criteria.
        </p>

        {/* Editor (create or edit) */}
        {(creating || editing) && draft && (
          <PresetEditor
            preset={draft}
            onChange={setDraft}
            onSave={savePreset}
            onCancel={cancelEdit}
          />
        )}

        {/* Saved presets */}
        {presets.length === 0 && !creating && (
          <div style={{
            padding: '20px 24px',
            background: 'var(--surface)',
            borderRadius: 12,
            border: '1px dashed var(--border)',
            textAlign: 'center',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No presets yet</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              Create a preset with your preferred fandoms, ships, tags, and word count range.
              Then search your library or jump straight to AO3.
            </p>
          </div>
        )}

        {presets.map(preset => (
          editing === preset.id && draft ? (
            <PresetEditor
              key={preset.id}
              preset={draft}
              onChange={setDraft}
              onSave={savePreset}
              onCancel={cancelEdit}
            />
          ) : (
            <PresetCard
              key={preset.id}
              preset={preset}
              works={works}
              statuses={statuses}
              onOpenWork={onOpenWork}
              onEdit={() => startEdit(preset)}
              onDelete={() => deletePreset(preset.id)}
            />
          )
        ))}

        {!creating && !editing && (
          <button className="btn btn-accent btn-sm" onClick={startCreate} style={{ marginTop: 4 }}>
            + New filter preset
          </button>
        )}
      </div>

      {/* ---- Your Queue ---- */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Your Queue</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          {hasRatings
            ? `From your library — what to read or pick back up next, ranked by your taste (based on ${tasteProfile.ratedCount} highly-rated fic${tasteProfile.ratedCount === 1 ? '' : 's'}).`
            : 'Rate a few fics 4+ stars and your queue will be sorted by taste.'}
        </p>

        {!hasQueue && (
          <div style={{
            padding: '14px 16px',
            background: 'var(--surface)',
            borderRadius: 10,
            border: '1px solid var(--border)',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}>
            Nothing queued up — add some fics with "to read" or "reading" status.
          </div>
        )}

        {recommendations.map(w => (
          <WorkCard key={w.id} work={w} status={statuses[w.id]} onOpenWork={onOpenWork} />
        ))}
      </div>
    </>
  );
}
