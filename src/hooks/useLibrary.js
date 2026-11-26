// src/hooks/useLibrary.js
// The library for the extension's library page. Data lives in extension
// storage; every change goes through the background worker (see
// storage/local.js), and this hook re-renders whenever the data changes,
// including changes made by the panel on an AO3 tab.

import { useState, useEffect, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { getLibrary, libraryOp, subscribe } from '../storage/local';
import { parseWorkPage, isGatedPage } from '../core/scrape';

// ---------------------------------------------------------------------------
// AO3 fetching
// ---------------------------------------------------------------------------
// The extension may fetch archiveofourown.org directly (it has permission
// for that site), using your own AO3 login if you're signed in there, so
// locked and adult works load too. Requests are spaced out: AO3 is run by
// volunteers and asks tools not to hammer it.

const AO3_GAP_MS = 3000;
let lastAo3Request = 0;

async function politeAo3Fetch(url) {
  const wait = lastAo3Request + AO3_GAP_MS - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastAo3Request = Date.now();
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 429) throw new Error('AO3 asked us to slow down. Try again in a few minutes.');
  if (!res.ok) throw new Error(`AO3 returned HTTP ${res.status}`);
  return new DOMParser().parseFromString(await res.text(), 'text/html');
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLibrary() {
  const [library, setLibrary] = useState(getLibrary);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [checkingWips, setCheckingWips] = useState(false);
  const [wipCheckMsg, setWipCheckMsg] = useState('');
  const cancelWipCheck = useRef(false);

  useEffect(() => subscribe(() => setLibrary(getLibrary())), []);

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
      if (!w.is_complete) map[w.id] = { work_id: w.id, has_update: (w.wip_new_chapters || 0) > 0, new_chapters: w.wip_new_chapters || 0 };
    });
    return map;
  }, [works]);

  async function checkWipUpdates() {
    if (checkingWips) { cancelWipCheck.current = true; return; }
    const targets = works.filter(w => {
      const st = statuses[w.id]?.status || 'to_read';
      return !w.is_complete && ['reading', 'to_read', 'on_hold'].includes(st);
    });
    if (!targets.length) { setWipCheckMsg('No unfinished fics to check.'); return; }

    cancelWipCheck.current = false;
    setCheckingWips(true);
    const updated = [];
    let errors = 0;
    for (let i = 0; i < targets.length && !cancelWipCheck.current; i++) {
      const w = targets[i];
      setWipCheckMsg(`Checking ${i + 1} of ${targets.length}: ${w.title}`);
      try {
        const fresh = await fetchAO3Work(w.id);
        const gained = (fresh.chapter_count || 0) - (w.chapter_count || 0);
        const { added_at, source, ...meta } = fresh;
        await libraryOp({
          op: 'upsertWork',
          work: { ...meta, wip_new_chapters: (w.wip_new_chapters || 0) + Math.max(0, gained) },
        });
        if (gained > 0) updated.push(`${w.title} (+${gained})`);
      } catch {
        errors++;
      }
    }
    const stopped = cancelWipCheck.current;
    setCheckingWips(false);
    setWipCheckMsg([
      stopped ? 'Stopped.' : `Checked ${targets.length} fic${targets.length !== 1 ? 's' : ''}.`,
      updated.length ? `New chapters:\n${updated.join('\n')}` : 'No new chapters.',
      errors ? `${errors} couldn't be loaded from AO3.` : '',
    ].filter(Boolean).join(' '));
  }

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

  return {
    works, statuses, readingLog, wipTracking, seriesMap,
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
