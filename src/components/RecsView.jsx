import { useState } from 'react';
import { wordCountLabel } from '../utils/helpers';

function RecCard({ work, onOpenWork, actionButton }) {
  return (
    <div className="rec-card" style={{ position: 'relative' }}>
      <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => onOpenWork(work)}>
        <div className="rec-reason">{(work.reasons || []).join(' · ')}</div>
        <div className="work-title">{work.title}</div>
        <div className="work-author">by {(work.authors || []).join(', ') || 'Anonymous'}</div>
        <div className="work-meta" style={{ marginTop: 6 }}>
          {work.word_count && <span>{wordCountLabel(work.word_count)} words</span>}
          {work.kudos && <span>♥ {work.kudos.toLocaleString()}</span>}
          {work.is_complete !== undefined && work.is_complete !== null && (
            <span style={{ color: work.is_complete ? 'var(--accent-teal)' : 'var(--text-muted)' }}>
              {work.is_complete ? 'Complete' : 'WIP'}
            </span>
          )}
          {(work.fandoms || []).slice(0, 2).map(f => (
            <span key={f} className="tag fandom">{f.length > 25 ? f.slice(0, 22) + '...' : f}</span>
          ))}
          {(work.relationships || []).slice(0, 2).map(r => (
            <span key={r} className="tag ship">{r}</span>
          ))}
        </div>
        {work.summary && (
          <div style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            marginTop: 8,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {work.summary}
          </div>
        )}
      </div>
      {actionButton && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
          {actionButton}
        </div>
      )}
    </div>
  );
}

function AiRecCard({ rec, onAddToLibrary, addingIds, addedIds }) {
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    if (!rec.ao3_id) {
      window.open(rec.ao3_url, '_blank');
      return;
    }
    setAdding(true);
    try {
      await onAddToLibrary(`https://archiveofourown.org/works/${rec.ao3_id}`);
      addedIds.add(rec.ao3_id);
    } catch (e) { console.error(e); }
    setAdding(false);
  }

  const isAdded = addedIds.has(rec.ao3_id);

  return (
    <div className="rec-card" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        {(() => {
          const catStyles = {
            core: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', label: 'Core' },
            adjacent: { bg: 'rgba(52,211,153,0.15)', color: '#34d399', label: 'Adjacent' },
            wildcard: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Wildcard' },
          };
          const cat = catStyles[rec.category] || catStyles.core;
          return (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
              background: cat.bg, color: cat.color, letterSpacing: 0.3, textTransform: 'uppercase',
            }}>
              {cat.label}
            </span>
          );
        })()}
        {rec.verified && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'var(--accent-teal)', color: '#fff', fontWeight: 600 }}>
            Verified
          </span>
        )}
        {rec.kudos_estimate && !rec.kudos && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>~{rec.kudos_estimate} kudos</span>
        )}
      </div>

      <div style={{ cursor: rec.ao3_url ? 'pointer' : 'default' }} onClick={() => rec.ao3_url && window.open(rec.ao3_url, '_blank')}>
        <div className="work-title">{rec.title || 'Unknown Title'}</div>
        <div className="work-author">by {(rec.authors || []).join(', ') || 'Unknown'}</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--accent-purple, #a78bfa)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>
        {rec.ai_reason}
      </div>

      <div className="work-meta" style={{ marginTop: 6 }}>
        {rec.word_count && <span>{wordCountLabel(rec.word_count)} words</span>}
        {rec.kudos && <span>♥ {rec.kudos.toLocaleString()}</span>}
        {rec.is_complete !== undefined && rec.is_complete !== null && (
          <span style={{ color: rec.is_complete ? 'var(--accent-teal)' : 'var(--text-muted)' }}>
            {rec.is_complete ? 'Complete' : 'WIP'}
          </span>
        )}
        {(rec.fandoms || []).slice(0, 2).map(f => (
          <span key={f} className="tag fandom">{f.length > 25 ? f.slice(0, 22) + '...' : f}</span>
        ))}
        {(rec.relationships || []).slice(0, 2).map(r => (
          <span key={r} className="tag ship">{r}</span>
        ))}
      </div>

      {rec.summary && (
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {rec.summary}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        {isAdded ? (
          <span style={{ fontSize: 12, color: 'var(--accent-teal)', fontWeight: 600 }}>✓ Added</span>
        ) : rec.ao3_id ? (
          <button
            className="btn btn-accent btn-sm"
            onClick={(e) => { e.stopPropagation(); handleAdd(); }}
            disabled={adding}
            style={{ fontSize: 11, padding: '4px 12px' }}
          >
            {adding ? 'Adding...' : '+ Add to Library'}
          </button>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => { e.stopPropagation(); window.open(rec.ao3_url, '_blank'); }}
            style={{ fontSize: 11, padding: '4px 12px' }}
          >
            Search on AO3 →
          </button>
        )}
        {rec.ao3_url && rec.ao3_id && (
          <a
            href={rec.ao3_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline' }}
          >
            View on AO3
          </a>
        )}
      </div>
    </div>
  );
}

export default function RecsView({
  recommendations,
  discoveryRecs,
  discoveryLoading,
  tasteProfile,
  onOpenWork,
  onAddToLibrary,
  isPremium,
  aiRecs,
  aiSearchLinks,
  aiRecsLoading,
  aiRecsError,
  aiRecsRemaining,
  onFetchAiRecs,
}) {
  const [addingIds, setAddingIds] = useState(new Set());
  const [addedIds, setAddedIds] = useState(new Set());
  // Track AI rec added IDs separately
  const [aiAddedIds] = useState(new Set());

  async function handleDiscoveryAdd(work) {
    setAddingIds(prev => new Set(prev).add(work.ao3_id));
    try {
      await onAddToLibrary(`https://archiveofourown.org/works/${work.ao3_id}`);
      setAddedIds(prev => new Set(prev).add(work.ao3_id));
    } catch (e) {
      console.error('Add error:', e);
    }
    setAddingIds(prev => {
      const next = new Set(prev);
      next.delete(work.ao3_id);
      return next;
    });
  }

  const hasRatings = tasteProfile?.ratedCount > 0;
  const hasDiscovery = discoveryRecs.length > 0;
  const hasQueue = recommendations.length > 0;
  const hasAiRecs = aiRecs.length > 0;

  return (
    <>
      <h2 style={{ fontSize: 18, marginBottom: 6 }}>For You</h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
        {hasRatings
          ? `Based on your ${tasteProfile.ratedCount} highly-rated fic${tasteProfile.ratedCount === 1 ? '' : 's'}. Rate more to sharpen recommendations.`
          : 'Rate some fics 4+ stars and come back — we\'ll find you new things to read.'}
      </p>

      {!hasRatings && (
        <div className="empty">
          <div className="emoji">🔮</div>
          <p>Rate a few fics with 4+ stars to unlock personalized recommendations.</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            The more you rate, the better the recommendations get.
          </p>
        </div>
      )}

      {/* ---- AI Recommendations (Plus feature) ---- */}
      {hasRatings && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>AI Picks</h3>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, letterSpacing: 0.5,
              background: isPremium ? 'linear-gradient(135deg, #a78bfa, #6d28d9)' : 'var(--surface)',
              color: isPremium ? '#fff' : 'var(--text-muted)',
              border: isPremium ? 'none' : '1px solid var(--border)',
            }}>
              PLUS
            </span>
          </div>

          {isPremium ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                Claude analyzes your taste and finds fics you'd love, plus curated AO3 searches to explore.
              </p>

              {!hasAiRecs && !aiRecsLoading && !aiRecsError && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    className="btn btn-accent"
                    onClick={onFetchAiRecs}
                    disabled={aiRecsLoading || aiRecsRemaining <= 0}
                    style={{
                      background: aiRecsRemaining <= 0 ? 'var(--surface)' : 'linear-gradient(135deg, #a78bfa, #6d28d9)',
                      border: aiRecsRemaining <= 0 ? '1px solid var(--border)' : 'none',
                      color: aiRecsRemaining <= 0 ? 'var(--text-muted)' : '#fff',
                      padding: '10px 20px',
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 10,
                      cursor: aiRecsRemaining <= 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ✨ Get AI Picks
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
                    {aiRecsRemaining} of 3 remaining today
                  </span>
                </div>
              )}

              {aiRecsLoading && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>
                  ✨ Claude is reading your taste profile and finding recommendations...
                </div>
              )}

              {aiRecsError && (
                <div style={{
                  padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 10,
                  border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: 13, color: '#ef4444',
                  marginBottom: 12, lineHeight: 1.5,
                }}>
                  {aiRecsError}
                </div>
              )}

              {(hasAiRecs || (aiSearchLinks && aiSearchLinks.length > 0)) && (
                <>
                  {aiRecs.map((rec, i) => (
                    <AiRecCard
                      key={rec.ao3_id || rec.title || i}
                      rec={rec}
                      onAddToLibrary={onAddToLibrary}
                      addingIds={addingIds}
                      addedIds={aiAddedIds}
                    />
                  ))}

                  {/* AO3 search links — Claude-curated searches for deeper exploration */}
                  {aiSearchLinks && aiSearchLinks.length > 0 && (
                    <div style={{
                      marginTop: 16,
                      padding: '14px 18px',
                      background: 'var(--surface)',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                        Explore more on AO3
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {aiSearchLinks.map((link, i) => {
                          const catColors = {
                            core: { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa', label: 'Core' },
                            adjacent: { bg: 'rgba(52,211,153,0.15)', text: '#34d399', label: 'Adjacent' },
                            wildcard: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', label: 'Wildcard' },
                          };
                          const cat = catColors[link.category] || catColors.core;
                          return (
                            <a
                              key={i}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 12,
                                color: 'var(--accent-purple, #a78bfa)',
                                textDecoration: 'none',
                                lineHeight: 1.6,
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                              }}
                            >
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6,
                                background: cat.bg, color: cat.text, whiteSpace: 'nowrap', marginTop: 2,
                                letterSpacing: 0.3, textTransform: 'uppercase',
                              }}>
                                {cat.label}
                              </span>
                              <span>
                                <span style={{ fontWeight: 600 }}>
                                  {[link.fandom, link.relationship].filter(Boolean).join(' · ')}
                                </span>
                                <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                                  — {link.reason}
                                </span>
                                <span style={{ marginLeft: 4 }}>→</span>
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={onFetchAiRecs}
                      disabled={aiRecsLoading || aiRecsRemaining <= 0}
                      style={{ fontSize: 12 }}
                    >
                      {aiRecsLoading ? 'Generating...' : '↻ Get fresh picks'}
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {aiRecsRemaining} of 3 remaining today
                    </span>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Free user teaser */
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.08), rgba(109, 40, 217, 0.08))',
              borderRadius: 12,
              border: '1px solid rgba(167, 139, 250, 0.2)',
              marginBottom: 12,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 10px 0' }}>
                Upgrade to Plus for AI-powered recommendations. Claude reads your taste profile and suggests
                fics from across AO3 — going beyond what's in the FicTracker community to find hidden gems
                you'd love.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Personalized picks based on your fandoms, ships, and the tropes you actually like.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- Discovery section ---- */}
      {hasRatings && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Discover</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Fics other readers imported that match your taste — not in your library yet.
          </p>

          {discoveryLoading && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '16px 0' }}>
              Finding fics you might love...
            </div>
          )}

          {!discoveryLoading && !hasDiscovery && (
            <div style={{
              padding: '16px 20px',
              background: 'var(--surface)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              marginBottom: 12,
            }}>
              No new discoveries right now. As more readers join FicTracker, this section will grow.
              Try rating more fics to broaden your taste profile.
            </div>
          )}

          {hasDiscovery && discoveryRecs.map(w => (
            <RecCard
              key={w.id}
              work={w}
              onOpenWork={onOpenWork}
              actionButton={
                addedIds.has(w.ao3_id) ? (
                  <span style={{ fontSize: 12, color: 'var(--accent-teal)', fontWeight: 600 }}>
                    ✓ Added to library
                  </span>
                ) : (
                  <button
                    className="btn btn-accent btn-sm"
                    onClick={(e) => { e.stopPropagation(); handleDiscoveryAdd(w); }}
                    disabled={addingIds.has(w.ao3_id)}
                    style={{ fontSize: 11, padding: '4px 12px' }}
                  >
                    {addingIds.has(w.ao3_id) ? 'Adding...' : '+ Add to Library'}
                  </button>
                )
              }
            />
          ))}
        </div>
      )}

      {/* ---- Queue section ---- */}
      {hasRatings && (
        <div>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Your Queue</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            From your library — what to read or pick back up next, based on your taste.
          </p>

          {!hasQueue && (
            <div style={{
              padding: '16px 20px',
              background: 'var(--surface)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              fontSize: 13,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              Nothing queued up. Add some fics with "to read" or "reading" status!
            </div>
          )}

          {hasQueue && recommendations.map(w => (
            <RecCard key={w.id} work={w} onOpenWork={onOpenWork} />
          ))}
        </div>
      )}
    </>
  );
}
