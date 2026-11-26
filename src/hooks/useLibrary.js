// src/hooks/useLibrary.js
// The library for the extension's library page. Data lives in extension
// storage; every change goes through the background worker (see
// storage/local.js), and this hook re-renders whenever the data changes,
// including changes made by the panel on an AO3 tab.

import { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import {
  getLibrary, libraryOp, subscribe, background,
  getFollows, getNews, getCheck, getAo3User,
} from '../storage/local';
import { parseWorkPage, isGatedPage } from '../core/scrape';

// ---------------------------------------------------------------------------
// AO3 fetching
// ---------------------------------------------------------------------------
// Requests go through the background worker, which spaces every
// FicTracker request to AO3 a few seconds apart (AO3 is run by volunteers
// and asks tools not to hammer it) and uses your AO3 login if you're signed
// in there, so locked and adult works load too.

async function politeAo3Fetch(url) {
  const { html } = await background({ type: 'AO3_FETCH', url });
  return new DOMParser().parseFromString(html, 'text/html');
}

export async function fetchAO3Work(ao3Id) {
  const doc = await politeAo3Fetch(`https://archiveofourown.org/works/${ao3Id}?view_adult=true`);
  if (isGatedPage(doc)) {
    throw new Error("AO3 only shows this work to logged-in users. Log in to AO3 in this browser and try again.");
  }
  return parseWorkPage(doc, ao3Id);
}

// ---------------------------------------------------------------------------
// EPUB import (reads the AO3 link and tags inside an AO3-downloaded EPUB)
// ---------------------------------------------------------------------------

async function parseEpubMetadata(file) {
  const zip = await JSZip.loadAsync(file);
  let opfContent = null;

  const container = zip.file('META-INF/container.xml');
  if (container) {
    const m = (await container.async('text')).match(/full-path="([^"]+\.opf)"/);
    const opfFile = m && zip.file(m[1]);
    if (opfFile) opfContent = await opfFile.async('text');
  }
  if (!opfContent) {
    const opfPath = Object.keys(zip.files).find(p => p.endsWith('.opf'));
    if (opfPath) opfContent = await zip.file(opfPath).async('text');
  }
  if (!opfContent) return null;

  const ao3Id = opfContent.match(/archiveofourown\.org\/works\/(\d+)/)?.[1];
  if (!ao3Id) return null;

  const doc = new DOMParser().parseFromString(opfContent, 'text/xml');
  const all = name => Array.from(doc.getElementsByTagNameNS('*', name))
    .map(e => e.textContent?.trim()).filter(Boolean);
  const description = all('description')[0] || '';

  return {
    id: ao3Id,
    ao3_id: Number(ao3Id),
    title: all('title')[0] || file.name.replace(/\.epub$/i, ''),
    authors: all('creator').length ? all('creator') : ['Anonymous'],
    fandoms: [],
    relationships: [],
    characters: [],
    freeform_tags: all('subject'),
    warnings: [],
    categories: [],
    rating: null,
    language: 'English',
    word_count: null,
    chapter_count: null,
    chapter_total: null,
    is_complete: false,
    summary: description.replace(/<[^>]*>/g, '').slice(0, 2000),
    source: 'epub',
  };
}

// A line about the current or last check, for the Library and Following tabs.
export function describeCheck(c) {
  if (!c) return '';
  if (c.running) {
    return c.total
      ? `Checking ${Math.min(c.done + 1, c.total)} of ${c.total}${c.current ? `: ${c.current}` : ''}…`
      : 'Starting check…';
  }
  if (!c.finished_at && !c.interrupted) return '';
  const when = new Date(c.finished_at || c.started_at).toLocaleString();
  const parts = [
    c.interrupted ? 'The last check was interrupted.'
      : c.stopped ? `Stopped after ${c.done} of ${c.total}.`
      : c.rate_limited ? `Paused after ${c.done} of ${c.total}.`
      : `${c.manual ? 'Checked' : 'Checked automatically'} ${when}.`,
  ];
  if (c.new_chapters?.length) {
    parts.push(`New chapters:\n${c.new_chapters.map(n => `${n.title} (+${n.gained})`).join('\n')}`);
  } else if (c.scope !== 'follows' && c.total) {
    parts.push('No new chapters.');
  }
  if (c.new_works) parts.push(`${c.new_works} new work${c.new_works !== 1 ? 's' : ''} from people and series you follow.`);
  if (c.locked) parts.push(`${c.locked} fic${c.locked !== 1 ? 's' : ''} need you logged in to AO3 in this browser.`);
  if (c.errors) parts.push(`${c.errors} couldn't be loaded from AO3.`);
  if (c.rate_limited) parts.push(c.rate_limited);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLibrary() {
  const [library, setLibrary] = useState(getLibrary);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [follows, setFollows] = useState(getFollows);
  const [rawNews, setRawNews] = useState(getNews);
  const [check, setCheck] = useState(getCheck);
  const [ao3User, setAo3User] = useState(getAo3User);
  const [checkError, setCheckError] = useState('');

  useEffect(() => subscribe(() => {
    setLibrary(getLibrary());
    setFollows(getFollows());
    setRawNews(getNews());
    setCheck(getCheck());
    setAo3User(getAo3User());
  }), []);

  const works = library.works;
  const statuses = library.statuses;
  const readingLog = library.reading_log;

  const run = op => libraryOp(op).catch(e => setImportMsg(`Couldn't save: ${e.message}`));

  const updateStatus = (workId, updates) => run({ op: 'updateStatus', workId, updates });
  const deleteWork = workId => run({ op: 'deleteWork', workId });
  const importWork = work => run({ op: 'upsertWork', work });

  // ---- Add by URL ----
  async function addByUrl(url) {
    const ao3Id = url.trim().match(/works\/(\d+)/)?.[1];
    if (!ao3Id) { setImportMsg('Could not find an AO3 work ID in that URL'); return; }
    if (works.some(w => w.id === ao3Id)) { setImportMsg('This fic is already in your library.'); return; }

    setImporting(true);
    setImportMsg('Fetching from AO3…');
    try {
      const work = await fetchAO3Work(ao3Id);
      await libraryOp({ op: 'upsertWork', work: { ...work, source: 'url' } });
      setImportMsg(`Added: ${work.title}`);
    } catch (e) {
      setImportMsg(`Could not add work: ${e.message}`);
    }
    setImporting(false);
  }

  // ---- EPUB import ----
  async function handleEpubFiles(files) {
    if (!files.length) return;
    setImporting(true);
    setImportMsg(`Reading ${files.length} EPUB file(s)…`);
    const found = [];
    const failed = [];
    for (const file of files) {
      try {
        const work = await parseEpubMetadata(file);
        if (work) found.push(work); else failed.push(file.name);
      } catch {
        failed.push(file.name);
      }
    }
    // Don't overwrite richer metadata from AO3 with the EPUB's thinner copy.
    const known = new Set(works.map(w => w.id));
    const fresh = found.filter(w => !known.has(w.id));
    if (fresh.length) await libraryOp({ op: 'upsertWorks', works: fresh });
    const skipped = found.length - fresh.length;
    setImportMsg([
      `Added ${fresh.length} fic${fresh.length !== 1 ? 's' : ''} from EPUBs.`,
      skipped ? `${skipped} already in your library.` : '',
      failed.length ? `No AO3 link found in: ${failed.join(', ')}` : '',
    ].filter(Boolean).join(' '));
    setImporting(false);
  }

  // ---- Bulk ops ----
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
    await run({
      op: 'updateMany',
      items: ids.map(workId => {
        const updates = { status: newStatus };
        if (newStatus === 'completed') updates.completed_at = now;
        if (newStatus === 'reading' && !statuses[workId]?.started_at) updates.started_at = now;
        return { workId, updates };
      }),
    });
    setBulkSelected(new Set());
    setBulkMode(false);
  }

  async function bulkDelete() {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    await run({ op: 'deleteMany', workIds: ids });
    setBulkSelected(new Set());
    setBulkMode(false);
  }

  // ---- WIP updates ----
  // "Check WIPs" re-reads each unfinished fic you're reading or plan to read
  // from AO3, one every few seconds, and flags the ones with new chapters.
  const wipTracking = useMemo(() => {
    const map = {};
    works.forEach(w => {
      // A WIP that just finished can still have chapters you haven't read.
      if (!w.is_complete || w.wip_new_chapters > 0) map[w.id] = { work_id: w.id, has_update: (w.wip_new_chapters || 0) > 0, new_chapters: w.wip_new_chapters || 0 };
    });
    return map;
  }, [works]);

  // Checks run in the background worker, so they keep going if you close
  // this tab, and share AO3's pace with everything else.
  const checkingWips = Boolean(check?.running);

  async function startCheck(scope) {
    setCheckError('');
    try {
      await background(checkingWips ? { type: 'CHECK_STOP' } : { type: 'CHECK_START', scope });
    } catch (e) {
      setCheckError(e.message);
    }
  }
  const checkWipUpdates = () => {
    if (!checkingWips && !works.some(w => !w.is_complete)) { setCheckError('No unfinished fics to check.'); return; }
    return startCheck('wips');
  };
  const checkFollows = () => startCheck('follows');

  const wipCheckMsg = checkError || describeCheck(check);

  const dismissWipUpdate = workId => {
    const w = works.find(x => x.id === workId);
    if (w) run({ op: 'upsertWork', work: { id: workId, wip_new_chapters: 0 } });
  };
  const dismissAllWipUpdates = () => {
    const flagged = works.filter(w => w.wip_new_chapters > 0).map(w => ({ id: w.id, wip_new_chapters: 0 }));
    if (flagged.length) run({ op: 'upsertWorks', works: flagged });
  };

  // ---- Stats ----
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
    const topN = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
    const clip = (s, n) => (s.length > n ? s.slice(0, n - 3) + '…' : s);

    const topFandoms = topN(count(works.flatMap(w => w.fandoms || [])), 8)
      .map(([name, value]) => ({ name: clip(name, 25), value }));
    const ratingDist = Object.entries(count(works.map(w => w.rating || 'Not Rated')))
      .map(([name, value]) => ({ name, value }));
    const topShips = topN(count(works.flatMap(w => w.relationships || [])), 10)
      .map(([name, value]) => ({ name: clip(name, 30), value }));

    const wcBuckets = { '<1k': 0, '1-5k': 0, '5-10k': 0, '10-50k': 0, '50-100k': 0, '100k+': 0 };
    works.forEach(w => {
      const wc = w.word_count || 0;
      if (wc < 1000) wcBuckets['<1k']++;
      else if (wc < 5000) wcBuckets['1-5k']++;
      else if (wc < 10000) wcBuckets['5-10k']++;
      else if (wc < 50000) wcBuckets['10-50k']++;
      else if (wc < 100000) wcBuckets['50-100k']++;
      else wcBuckets['100k+']++;
    });
    const wcDist = Object.entries(wcBuckets).map(([name, value]) => ({ name, value }));

    return { total, totalWords, statusCounts, wips, topFandoms, ratingDist, topShips, wcDist };
  }, [works, statuses]);

  // ---- Taste profile + queue (your own unread fics, ranked by what you rate highly) ----
  const tasteProfile = useMemo(() => {
    const rated = works.filter(w => (statuses[w.id]?.rating_personal || 0) >= 4);
    const likedFandoms = {};
    const likedShips = {};
    rated.forEach(w => {
      (w.fandoms || []).forEach(f => { likedFandoms[f] = (likedFandoms[f] || 0) + 1; });
      (w.relationships || []).forEach(r => { likedShips[r] = (likedShips[r] || 0) + 1; });
    });
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
    return { likedFandoms, likedShips, topFandoms: top(likedFandoms, 6), topShips: top(likedShips, 8), ratedCount: rated.length };
  }, [works, statuses]);

  const rotationSeed = useMemo(() => Math.floor(Date.now() / (2 * 60 * 60 * 1000)), []);

  const recommendations = useMemo(() => {
    const { likedFandoms, likedShips } = tasteProfile;
    const hash = (str, seed) => {
      let h = seed | 0;
      for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      return h;
    };
    return works
      .filter(w => ['to_read', 'reading'].includes(statuses[w.id]?.status || 'to_read'))
      .map(w => {
        let score = 0;
        const reasons = [];
        (w.fandoms || []).forEach(f => { if (likedFandoms[f]) { score += likedFandoms[f] * 2; reasons.push(`You like ${f}`); } });
        (w.relationships || []).forEach(r => { if (likedShips[r]) { score += likedShips[r] * 3; reasons.push(`You enjoy ${r}`); } });
        if (w.kudos > 1000) { score += 1; reasons.push('Popular fic'); }
        if (statuses[w.id]?.status === 'reading') { score += 2; reasons.unshift('Currently reading'); }
        return { ...w, score, reasons: [...new Set(reasons)].slice(0, 3) };
      })
      .filter(w => w.score > 0)
      .map(w => ({ ...w, sortKey: w.score + ((hash(w.id, rotationSeed) & 0x7fffffff) % 100) / 100 }))
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 10);
  }, [works, statuses, tasteProfile, rotationSeed]);

  // ---- Series ----
  const seriesMap = useMemo(() => {
    const map = new Map();
    works.forEach(w => {
      (w.series_memberships || []).forEach(({ ao3_series_id, series_name, position_in_series }) => {
        if (!map.has(ao3_series_id)) map.set(ao3_series_id, { ao3_series_id, series_name, works: [] });
        map.get(ao3_series_id).works.push({ ...w, position_in_series });
      });
    });
    map.forEach(s => s.works.sort((a, b) => (a.position_in_series || 999) - (b.position_in_series || 999)));
    return map;
  }, [works]);

  // ---- Following ----
  const libraryIds = useMemo(() => new Set(works.map(w => w.id)), [works]);
  const news = useMemo(() => rawNews.filter(n => !libraryIds.has(n.work.id)), [rawNews, libraryIds]);
  const follow = (kind, id, name) => background({ type: 'FOLLOW', kind, id: String(id), name });
  const unfollow = key => background({ type: 'UNFOLLOW', key });
  const addNews = (key, status) => background({ type: 'NEWS_ADD', key, status });
  const dismissNews = keys => background({ type: 'NEWS_DISMISS', keys });

  return {
    works, statuses, readingLog, wipTracking, seriesMap,
    follows, news, follow, unfollow, addNews, dismissNews, checkFollows, check, ao3User,
    stats, recommendations, tasteProfile,
    importing, importMsg, setImportMsg,
    checkingWips, wipCheckMsg,
    bulkMode, setBulkMode, bulkSelected, setBulkSelected,
    importWork, updateStatus, deleteWork,
    toggleBulkSelect, bulkSetStatus, bulkDelete,
    addByUrl, handleEpubFiles,
    checkWipUpdates, dismissWipUpdate, dismissAllWipUpdates,
  };
}
