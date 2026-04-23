// src/hooks/useLocalLibrary.js
// Local-first replacement for useLibrary.js.
// All reading data lives in the browser's localStorage — nothing personal
// is sent to a server. When a user adds a fic by URL, we fetch its
// public metadata from AO3 via a CORS proxy and store the result locally.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { getLibrary, saveLibrary } from '../storage/local';

// ---------------------------------------------------------------------------
// AO3 HTML scraper (client-side, via CORS proxy)
// ---------------------------------------------------------------------------
// We use corsproxy.io to fetch public AO3 work pages. This is the only
// external service called — and only when the user explicitly adds a fic
// by URL. Your reading data (statuses, ratings, notes) never leaves the
// browser.

const CORS_PROXY = 'https://corsproxy.io/?url=';

async function fetchAO3Metadata(ao3Id) {
  // view_adult=true bypasses the explicit content gate for anonymous visitors
  const ao3Url = `https://archiveofourown.org/works/${ao3Id}?view_adult=true`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(ao3Url));
  if (!res.ok) throw new Error(`Could not fetch AO3 page (HTTP ${res.status})`);
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // AO3 sometimes returns an adult-content gate even with view_adult=true
  // if the work has been flagged. Surface a clear message rather than
  // returning garbage parsed data.
  if (doc.querySelector('#adult-gate-form')) {
    throw new Error(
      'This work requires an AO3 login to view. Use the browser extension instead, or add it while logged in.'
    );
  }

  const title = doc.querySelector('h2.title')?.textContent.trim() || 'Unknown Title';

  const authorEls = doc.querySelectorAll('h3.byline a[rel="author"]');
  const authors = Array.from(authorEls).map(a => a.textContent.trim());
  if (authors.length === 0) authors.push('Anonymous');

  const sel = s => Array.from(doc.querySelectorAll(s)).map(e => e.textContent.trim());

  const fandoms       = sel('dd.fandom a.tag');
  const relationships = sel('dd.relationship a.tag');
  const characters    = sel('dd.character a.tag');
  const freeform_tags = sel('dd.freeform a.tag');
  const warnings      = sel('dd.warning a.tag');
  const categories    = sel('dd.category a.tag');

  const rating = doc.querySelector('dd.rating a.tag')?.textContent.trim() || null;
  const language = doc.querySelector('dd.language')?.textContent.trim() || 'English';

  // Word count, chapters, kudos, hits
  const numText = el => parseInt((el?.textContent || '').replace(/[^0-9]/g, '')) || null;
  const word_count = numText(doc.querySelector('dd.words'));
  const kudos      = numText(doc.querySelector('dd.kudos'));
  const hits       = numText(doc.querySelector('dd.hits'));

  let chapter_count = null;
  let chapter_total = null;
  let is_complete = false;
  const chapEl = doc.querySelector('dd.chapters');
  if (chapEl) {
    const m = chapEl.textContent.match(/(\d+)\/?(\d+|\?)?/);
    if (m) {
      chapter_count = parseInt(m[1]) || null;
      chapter_total = m[2] && m[2] !== '?' ? parseInt(m[2]) : null;
      is_complete = chapter_total !== null && chapter_count !== null && chapter_count >= chapter_total;
    }
  }

  const summaryEl = doc.querySelector('.summary blockquote');
  const summary = summaryEl?.textContent.trim() || null;

  // Series membership — a work can belong to multiple series.
  // Each dd.series > span.series contains: "Part <n> of <a href='/series/id'>Name</a>"
  const series_memberships = [];
  doc.querySelectorAll('dd.series .series').forEach(el => {
    const link = el.querySelector('a');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    const idMatch = href.match(/\/series\/(\d+)/);
    if (!idMatch) return;
    const posEl = el.querySelector('.position');
    series_memberships.push({
      ao3_series_id: parseInt(idMatch[1]),
      series_name: link.textContent.trim(),
      position_in_series: posEl ? parseInt(posEl.textContent) || null : null,
    });
  });

  return {
    id: ao3Id.toString(),
    ao3_id: ao3Id,
    title,
    authors,
    fandoms,
    relationships,
    characters,
    freeform_tags,
    warnings,
    categories,
    rating,
    language,
    word_count,
    chapter_count,
    chapter_total,
    is_complete,
    kudos,
    hits,
    summary,
    series_memberships,
    added_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// EPUB metadata parser (unchanged from original, runs entirely client-side)
// ---------------------------------------------------------------------------

async function parseEpubMetadata(file) {
  const zip = await JSZip.loadAsync(file);
  let opfContent = null;

  for (const [path, entry] of Object.entries(zip.files)) {
    if (path.endsWith('.opf') || path.includes('content.opf')) {
      opfContent = await entry.async('text');
      break;
    }
  }

  if (!opfContent) {
    const container = zip.file('META-INF/container.xml');
    if (container) {
      const containerXml = await container.async('text');
      const m = containerXml.match(/full-path="([^"]+\.opf)"/);
      if (m) {
        const opfFile = zip.file(m[1]);
        if (opfFile) opfContent = await opfFile.async('text');
      }
    }
  }

  if (!opfContent) return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(opfContent, 'text/xml');

  const getMeta = name => {
    const el = doc.querySelector(`metadata > *[name="${name}"], dc\\:${name}, ${name}`);
    return el ? el.textContent?.trim() : null;
  };
  const getAllMeta = name => {
    const els = doc.querySelectorAll(`dc\\:${name}, ${name}`);
    return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
  };

  const title    = getMeta('title') || file.name.replace('.epub', '');
  const creators = getAllMeta('creator');
  const source   = getMeta('source') || '';
  const subjects = getAllMeta('subject');
  const description = getMeta('description') || '';

  let ao3Id = null;
  const ao3Match = source.match(/archiveofourown\.org\/works\/(\d+)/);
  if (ao3Match) { ao3Id = parseInt(ao3Match[1]); }

  if (!ao3Id) {
    const identifiers = doc.querySelectorAll('identifier');
    for (const ident of identifiers) {
      const text = ident.textContent || '';
      const m = text.match(/archiveofourown\.org\/works\/(\d+)/);
      if (m) { ao3Id = parseInt(m[1]); break; }
    }
  }

  if (!ao3Id) {
    const lastResort = opfContent.match(/archiveofourown\.org\/works\/(\d+)/);
    if (lastResort) ao3Id = parseInt(lastResort[1]);
  }

  if (!ao3Id) return null;

  return {
    id: ao3Id.toString(),
    ao3_id: ao3Id,
    title,
    authors: creators.length ? creators : ['Anonymous'],
    fandoms: [],
    relationships: [],
    characters: [],
    freeform_tags: subjects,
    warnings: [],
    categories: [],
    rating: null,
    language: 'English',
    word_count: null,
    chapter_count: null,
    chapter_total: null,
    is_complete: false,
    kudos: null,
    hits: null,
    summary: description.replace(/<[^>]*>/g, '').substring(0, 2000),
    added_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Simple UUID shim (crypto.randomUUID is available in all modern browsers)
// ---------------------------------------------------------------------------
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLocalLibrary() {
  // We keep a single `library` object in state and sync it to localStorage
  // on every mutation. Reads are instant (from state); writes hit both.
  const [library, setLibrary] = useState(() => getLibrary());
  const [loading, setLoading] = useState(false); // local reads are synchronous
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());

  // Persist any library state change to localStorage
  useEffect(() => {
    saveLibrary(library);
  }, [library]);

  // Derived convenience accessors
  const works      = library.works;
  const statuses   = library.statuses;
  const readingLog = library.reading_log;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  function mutate(updater) {
    setLibrary(prev => {
      const next = updater(prev);
      return next;
    });
  }

  // Upsert a work (add or replace by id)
  function upsertWork(work) {
    mutate(prev => {
      const exists = prev.works.find(w => w.id === work.id);
      const works = exists
        ? prev.works.map(w => (w.id === work.id ? { ...w, ...work } : w))
        : [...prev.works, work];
      return { ...prev, works };
    });
  }

  function logReadingEvent(workId, chaptersRead, wordCountRead) {
    if (chaptersRead <= 0 && !wordCountRead) return;
    const entry = {
      id: uid(),
      work_id: workId,
      chapters_read: chaptersRead || 0,
      word_count_read: wordCountRead || 0,
      read_at: new Date().toISOString(),
    };
    mutate(prev => ({ ...prev, reading_log: [...prev.reading_log, entry] }));
  }

  function updateStatus(workId, updates) {
    const existing  = statuses[workId];
    const work      = works.find(w => w.id === workId);
    const wordsPerCh = work?.word_count && work?.chapter_count
      ? Math.round(work.word_count / work.chapter_count) : 0;

    // Log chapter advances
    if (updates.current_chapter !== undefined && existing) {
      const delta = (updates.current_chapter || 0) - (existing.current_chapter || 0);
      if (delta > 0) logReadingEvent(workId, delta, delta * wordsPerCh);
    }

    // Log completion
    if (updates.status === 'completed' && existing?.status !== 'completed' && work) {
      const currentCh = updates.current_chapter ?? existing?.current_chapter ?? 0;
      const totalCh   = work.chapter_total || work.chapter_count || 1;
      const remaining = Math.max(0, totalCh - currentCh);
      if (remaining > 0) logReadingEvent(workId, remaining, remaining * wordsPerCh);
      else if (currentCh === 0 && work.word_count) logReadingEvent(workId, totalCh, work.word_count);
    }

    // Log starting to read
    if (updates.status === 'reading' && (!existing || existing.status !== 'reading')) {
      if ((existing?.current_chapter || 0) === 0 && wordsPerCh > 0) {
        logReadingEvent(workId, 1, wordsPerCh);
      }
    }

    const now = new Date().toISOString();
    const newStatus = existing
      ? { ...existing, ...updates, updated_at: now }
      : { work_id: workId, ...updates, updated_at: now };

    mutate(prev => ({
      ...prev,
      statuses: { ...prev.statuses, [workId]: newStatus },
    }));
  }

  function deleteWork(workId) {
    mutate(prev => ({
      works: prev.works.filter(w => w.id !== workId),
      statuses: Object.fromEntries(
        Object.entries(prev.statuses).filter(([k]) => k !== workId)
      ),
      reading_log: prev.reading_log.filter(e => e.work_id !== workId),
    }));
  }

  // ---------------------------------------------------------------------------
  // Add by URL
  // ---------------------------------------------------------------------------

  async function addByUrl(url) {
    if (!url.trim()) return;
    const match = url.match(/works\/(\d+)/);
    if (!match) { setImportMsg('Could not find an AO3 work ID in that URL'); return; }
    const ao3Id = parseInt(match[1]);
    const workId = ao3Id.toString();

    if (works.find(w => w.id === workId)) {
      setImportMsg('This fic is already in your library.');
      return;
    }

    setImporting(true);
    setImportMsg('Fetching from AO3…');
    try {
      const work = await fetchAO3Metadata(ao3Id);
      upsertWork(work);
      setImportMsg(`Added: ${work.title}`);
    } catch (e) {
      setImportMsg(`Could not add work: ${e.message}`);
    }
    setImporting(false);
  }

  // ---------------------------------------------------------------------------
  // EPUB import
  // ---------------------------------------------------------------------------

  async function handleEpubFiles(files) {
    setImporting(true);
    setImportMsg(`Processing ${files.length} EPUB file(s)…`);
    let added = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const work = await parseEpubMetadata(file);
        if (work) {
          upsertWork(work);
          added++;
        } else {
          failed++;
          setImportMsg(prev => prev + `\nNo AO3 ID found in ${file.name}`);
        }
      } catch (e) {
        failed++;
        console.error('EPUB parse error:', e);
      }
    }

    setImportMsg(
      `Imported ${added} fic${added !== 1 ? 's' : ''}${failed ? ` (${failed} failed)` : ''} from EPUBs.`
    );
    setImporting(false);
  }

  // ---------------------------------------------------------------------------
  // Bulk ops
  // ---------------------------------------------------------------------------

  function toggleBulkSelect(workId) {
    setBulkSelected(prev => {
      const next = new Set(prev);
      next.has(workId) ? next.delete(workId) : next.add(workId);
      return next;
    });
  }

  async function bulkSetStatus(newStatus) {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    const now = new Date().toISOString();
    ids.forEach(workId => {
      const updates = { status: newStatus, updated_at: now };
      if (newStatus === 'completed') updates.completed_at = now;
      if (newStatus === 'reading' && !statuses[workId]?.started_at) updates.started_at = now;
      updateStatus(workId, updates);
    });
    setBulkSelected(new Set());
    setBulkMode(false);
  }

  async function bulkDelete() {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    ids.forEach(deleteWork);
    setBulkSelected(new Set());
    setBulkMode(false);
  }

  // ---------------------------------------------------------------------------
  // WIP tracking (local — just note last known chapter count)
  // ---------------------------------------------------------------------------
  // We keep wipTracking as a simple in-library map for backward compat with
  // Library.jsx. In local-first mode there's no server polling; users can
  // check AO3 manually. We surface a "no server check needed" state.
  const wipTracking = useMemo(() => {
    const map = {};
    works.forEach(w => {
      if (!w.is_complete) map[w.id] = { work_id: w.id, has_update: false };
    });
    return map;
  }, [works]);

  const [checkingWips] = useState(false);
  const [wipCheckMsg]  = useState('');

  // No-op stubs for WIP checking (no server in local-first mode)
  function checkWipUpdates()    { return Promise.resolve(); }
  function dismissWipUpdate()   {}
  function dismissAllWipUpdates() {}

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const total = works.length;
    const totalWords = works.reduce((s, w) => s + (w.word_count || 0), 0);
    const statusCounts = { to_read: 0, reading: 0, completed: 0, dnf: 0, dropped: 0, on_hold: 0, author_abandoned: 0 };
    works.forEach(w => {
      const st = statuses[w.id]?.status || 'to_read';
      if (statusCounts[st] !== undefined) statusCounts[st]++;
    });
    const wips = works.filter(w => !w.is_complete).length;

    const count = arr => arr.reduce((m, v) => { m[v] = (m[v] || 0) + 1; return m; }, {});
    const topN  = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

    const fandomCount = count(works.flatMap(w => w.fandoms || []));
    const topFandoms  = topN(fandomCount, 8).map(([name, value]) => ({
      name: name.length > 25 ? name.slice(0, 22) + '…' : name, value,
    }));

    const ratingCount = count(works.map(w => w.rating || 'Not Rated'));
    const ratingDist  = Object.entries(ratingCount).map(([name, value]) => ({ name, value }));

    const shipCount = count(works.flatMap(w => w.relationships || []));
    const topShips  = topN(shipCount, 10).map(([name, value]) => ({
      name: name.length > 30 ? name.slice(0, 27) + '…' : name, value,
    }));

    const wcBuckets = { '<1k': 0, '1-5k': 0, '5-10k': 0, '10-50k': 0, '50-100k': 0, '100k+': 0 };
    works.forEach(w => {
      const wc = w.word_count || 0;
      if      (wc < 1000)   wcBuckets['<1k']++;
      else if (wc < 5000)   wcBuckets['1-5k']++;
      else if (wc < 10000)  wcBuckets['5-10k']++;
      else if (wc < 50000)  wcBuckets['10-50k']++;
      else if (wc < 100000) wcBuckets['50-100k']++;
      else                  wcBuckets['100k+']++;
    });
    const wcDist = Object.entries(wcBuckets).map(([name, value]) => ({ name, value }));

    return { total, totalWords, statusCounts, wips, topFandoms, ratingDist, topShips, wcDist };
  }, [works, statuses]);

  // ---------------------------------------------------------------------------
  // Taste profile (for queue recs)
  // ---------------------------------------------------------------------------
  const tasteProfile = useMemo(() => {
    const rated = works.filter(w => (statuses[w.id]?.rating_personal || 0) >= 4);
    const likedFandoms = {};
    const likedShips   = {};
    rated.forEach(w => {
      (w.fandoms        || []).forEach(f => { likedFandoms[f] = (likedFandoms[f] || 0) + 1; });
      (w.relationships  || []).forEach(r => { likedShips[r]   = (likedShips[r]   || 0) + 1; });
    });
    const topFandoms = Object.entries(likedFandoms).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
    const topShips   = Object.entries(likedShips).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
    return { likedFandoms, likedShips, topFandoms, topShips, ratedCount: rated.length };
  }, [works, statuses]);

  // ---------------------------------------------------------------------------
  // Queue recommendations (fics already in library, matching taste)
  // ---------------------------------------------------------------------------
  const queueRotationSeed = useMemo(() => Math.floor(Date.now() / (2 * 60 * 60 * 1000)), []);

  const recommendations = useMemo(() => {
    const { likedFandoms, likedShips } = tasteProfile;
    const queue = works.filter(w => {
      const st = statuses[w.id]?.status || 'to_read';
      return st === 'to_read' || st === 'reading';
    });

    function hashCode(str, seed = 0) {
      let h = seed | 0;
      for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      return h;
    }

    const scored = queue.map(w => {
      let score = 0;
      const reasons = [];
      (w.fandoms       || []).forEach(f => { if (likedFandoms[f]) { score += likedFandoms[f] * 2; reasons.push(`You like ${f}`); } });
      (w.relationships || []).forEach(r => { if (likedShips[r])   { score += likedShips[r] * 3;   reasons.push(`You enjoy ${r}`); } });
      if (w.kudos > 1000) { score += 1; reasons.push('Popular fic'); }
      if (statuses[w.id]?.status === 'reading') { score += 2; reasons.unshift('Currently reading'); }
      return { ...w, score, reasons: [...new Set(reasons)].slice(0, 3) };
    }).filter(w => w.score > 0);

    return scored
      .map(w => {
        const jitter = (hashCode(w.id, queueRotationSeed) & 0x7fffffff) % 100 / 100;
        return { ...w, sortKey: w.score + jitter };
      })
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 10);
  }, [works, statuses, tasteProfile, queueRotationSeed]);

  // ---------------------------------------------------------------------------
  // Series map — group library works by series
  // ---------------------------------------------------------------------------
  // seriesMap: Map<ao3_series_id, { ao3_series_id, series_name, works: [work] }>
  // Only includes series where at least one work is in the library AND has
  // series_memberships populated (i.e. added via URL after this feature shipped).
  const seriesMap = useMemo(() => {
    const map = new Map();
    works.forEach(w => {
      (w.series_memberships || []).forEach(({ ao3_series_id, series_name, position_in_series }) => {
        if (!map.has(ao3_series_id)) {
          map.set(ao3_series_id, { ao3_series_id, series_name, works: [] });
        }
        map.get(ao3_series_id).works.push({ ...w, position_in_series });
      });
    });
    // Sort works within each series by position
    map.forEach(series => {
      series.works.sort((a, b) => (a.position_in_series || 999) - (b.position_in_series || 999));
    });
    return map;
  }, [works]);

  // ---------------------------------------------------------------------------
  // Discovery recs (fics not in library — sourced from all works in localStorage
  // across any shared pool; in local-first mode this is just the user's own
  // collection filtered to unread works scored against taste)
  // ---------------------------------------------------------------------------
  // In Supabase mode, discovery pulled from a shared works table (other users'
  // imports). In local-first mode there's no shared pool, so we show a curated
  // empty-state that directs users to AO3 search via Fic Finder instead.
  const discoveryRecs    = [];
  const discoveryLoading = false;

  // ---------------------------------------------------------------------------
  // No-op AI rec stubs (replaced by Fic Finder in FicFinderView)
  // ---------------------------------------------------------------------------
  const aiRecs           = [];
  const aiSearchLinks    = [];
  const aiRecsLoading    = false;
  const aiRecsError      = '';
  const aiRecsRemaining  = 0;
  const fetchAiRecs      = () => Promise.resolve();

  // Bookmark sync stubs (local-first: use bookmarklet/extension/EPUB instead)
  const syncingBookmarks = false;
  const syncMsg          = '';
  const syncJob          = null;
  const syncBookmarks    = () => Promise.resolve();
  const ao3Username      = '';

  return {
    works, statuses, readingLog, wipTracking, loading, seriesMap,
    importWork: upsertWork,
    importing, importMsg, setImportMsg,
    checkingWips, wipCheckMsg, setWipCheckMsg: () => {},
    bulkMode, setBulkMode, bulkSelected, setBulkSelected,
    stats, recommendations, discoveryRecs, discoveryLoading, tasteProfile,
    aiRecs, aiSearchLinks, aiRecsLoading, aiRecsError, aiRecsRemaining, fetchAiRecs,
    syncingBookmarks, syncMsg, syncJob, syncBookmarks,
    ao3Username,
    subscriptionTier: 'plus',
    isPremium: true,
    isAtFicLimit: false,
    ficsRemaining: Infinity,
    FREE_FIC_LIMIT: Infinity,
    // mutations
    loadData: () => setLibrary(getLibrary()),
    getStatusForWork: id => statuses[id] || null,
    updateStatus,
    deleteWork,
    toggleBulkSelect,
    bulkSetStatus,
    bulkDelete,
    addByUrl,
    handleEpubFiles,
    checkWipUpdates,
    dismissWipUpdate,
    dismissAllWipUpdates,
  };
}
