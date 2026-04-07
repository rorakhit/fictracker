import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import JSZip from 'jszip';

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';

// Free tier limit — enforced client-side for now. When Stripe is
// integrated, this check will also happen server-side in the Edge
// Function. The subscription_tier field on user_preferences will
// be set by the Stripe webhook.
const FREE_FIC_LIMIT = 50;

export function useLibrary(userId) {
  const [works, setWorks] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [readingLog, setReadingLog] = useState([]);
  const [wipTracking, setWipTracking] = useState({}); // keyed by work_id
  const [checkingWips, setCheckingWips] = useState(false);
  const [wipCheckMsg, setWipCheckMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [subscriptionTier, setSubscriptionTier] = useState('free'); // 'free' | 'plus'
  const [ao3Username, setAo3Username] = useState('');

  useEffect(() => {
    async function claimData() {
      try {
        const { data } = await supabase.rpc('claim_existing_data', { target_user_id: userId });
        if (data && (data.reading_status > 0 || data.reading_log > 0 || data.wip_tracking > 0)) {
          console.log('Claimed existing data:', data);
          loadData();
        }
      } catch (e) { console.error('Claim error:', e); }
    }
    claimData();
  }, [userId]);

  const loadData = useCallback(async () => {
    try {
      const { data: statusRows, error: statusError } = await supabase
        .from('reading_status')
        .select('*, work:works(*)')
        .eq('user_id', userId);
      if (statusError) throw statusError;

      const worksArr = [];
      const statusMap = {};
      (statusRows || []).forEach(row => {
        if (row.work) {
          worksArr.push(row.work);
          statusMap[row.work.id] = row;
        }
      });
      setWorks(worksArr);
      setStatuses(statusMap);

      // Load reading log for analytics
      const { data: logRows } = await supabase
        .from('reading_log')
        .select('*')
        .eq('user_id', userId)
        .order('read_at', { ascending: true });
      setReadingLog(logRows || []);

      // Load WIP tracking data for badges
      const { data: wipRows } = await supabase
        .from('wip_tracking')
        .select('*')
        .eq('user_id', userId);
      const wipMap = {};
      (wipRows || []).forEach(row => { wipMap[row.work_id] = row; });
      setWipTracking(wipMap);

      // Load subscription tier (defaults to 'free' if no row or no column yet)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('subscription_tier, ao3_username')
        .eq('user_id', userId)
        .single();
      if (prefs?.subscription_tier) setSubscriptionTier(prefs.subscription_tier);
      if (prefs?.ao3_username) setAo3Username(prefs.ao3_username);
    } catch (e) { console.error('Load error:', e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  function getStatusForWork(workId) {
    return statuses[workId] || null;
  }

  // Log a reading event to the append-only reading_log table.
  // This powers the analytics engine — every status change or chapter
  // advance becomes a data point we can chart over time.
  async function logReadingEvent(workId, chaptersRead, wordCountRead) {
    if (chaptersRead <= 0 && !wordCountRead) return;
    await supabase.from('reading_log').insert({
      work_id: workId,
      user_id: userId,
      chapters_read: chaptersRead || 0,
      word_count_read: wordCountRead || 0,
      read_at: new Date().toISOString(),
    });
  }

  async function updateStatus(workId, updates) {
    const existing = statuses[workId];
    const work = works.find(w => w.id === workId);
    const wordsPerChapter = work && work.word_count && work.chapter_count
      ? Math.round(work.word_count / work.chapter_count) : 0;

    // Detect chapter advancement for reading_log
    if (updates.current_chapter !== undefined && existing) {
      const oldChapter = existing.current_chapter || 0;
      const newChapter = updates.current_chapter || 0;
      const chapterDelta = newChapter - oldChapter;
      if (chapterDelta > 0) {
        await logReadingEvent(workId, chapterDelta, chapterDelta * wordsPerChapter);
      }
    }

    // Log completion as a reading event (remaining chapters)
    if (updates.status === 'completed' && existing?.status !== 'completed' && work) {
      const currentCh = updates.current_chapter || existing?.current_chapter || 0;
      const totalCh = work.chapter_total || work.chapter_count || 1;
      const remaining = Math.max(0, totalCh - currentCh);
      if (remaining > 0) {
        await logReadingEvent(workId, remaining, remaining * wordsPerChapter);
      } else if (currentCh === 0 && work.word_count) {
        // Single-chapter or never tracked chapters — log the whole thing
        await logReadingEvent(workId, totalCh, work.word_count);
      }
    }

    // Log starting to read (first chapter) if no chapters were tracked yet
    if (updates.status === 'reading' && (!existing || existing.status !== 'reading')) {
      const currentCh = existing?.current_chapter || 0;
      if (currentCh === 0 && wordsPerChapter > 0) {
        await logReadingEvent(workId, 1, wordsPerChapter);
      }
    }

    if (existing) {
      await supabase.from('reading_status')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('work_id', workId)
        .eq('user_id', userId);
    } else {
      await supabase.from('reading_status')
        .insert({ work_id: workId, user_id: userId, ...updates });
    }
    loadData();
  }

  async function deleteWork(workId) {
    await supabase.from('reading_status').delete().eq('work_id', workId).eq('user_id', userId);
    await supabase.from('wip_tracking').delete().eq('work_id', workId).eq('user_id', userId);
    await supabase.from('reading_log').delete().eq('work_id', workId).eq('user_id', userId);
    loadData();
  }

  function toggleBulkSelect(workId) {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      return next;
    });
  }

  async function bulkSetStatus(newStatus, filteredIds) {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    for (const workId of ids) {
      const updates = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'completed') updates.completed_at = new Date().toISOString();
      if (newStatus === 'reading') {
        const existing = statuses[workId];
        if (!existing?.started_at) updates.started_at = new Date().toISOString();
      }
      await updateStatus(workId, updates);
    }
    setBulkSelected(new Set());
    setBulkMode(false);
    loadData();
  }

  async function bulkDelete() {
    const ids = Array.from(bulkSelected);
    if (ids.length === 0) return;
    for (const workId of ids) {
      await deleteWork(workId);
    }
    setBulkSelected(new Set());
    setBulkMode(false);
  }

  // Check if user has hit the free tier fic limit.
  // 'plus' and 'beta' users get unlimited fics — beta is the same as
  // plus but without payment, for testers.
  const isPremium = subscriptionTier === 'plus' || subscriptionTier === 'beta';
  const isAtFicLimit = !isPremium && works.length >= FREE_FIC_LIMIT;
  const ficsRemaining = isPremium ? Infinity : Math.max(0, FREE_FIC_LIMIT - works.length);

  async function addByUrl(url) {
    if (!url.trim()) return;
    if (isAtFicLimit) {
      setImportMsg(`You've reached the free tier limit of ${FREE_FIC_LIMIT} fics. Upgrade to Plus for unlimited fics!`);
      return;
    }
    const match = url.match(/works\/(\d+)/);
    if (!match) { setImportMsg('Could not find an AO3 work ID in that URL'); return; }
    const ao3Id = parseInt(match[1]);
    setImporting(true);
    setImportMsg('Adding work...');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-works`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`
        },
        body: JSON.stringify({ works: [{ ao3_id: ao3Id, source: 'manual' }], source: 'manual' })
      });
      const data = await res.json().catch(() => ({}));
      // The edge function now scrapes AO3 server-side, so a successful add
      // means the work landed with real metadata. Treat any non-2xx, an
      // `imported` count of 0, or a returned `errors` array as a failure so
      // the user actually sees what went wrong instead of the old silent
      // "Loading..." row sitting in their library forever.
      if (!res.ok || !data.imported) {
        const detail = (data.errors && data.errors[0]) || data.message || data.error || `HTTP ${res.status}`;
        setImportMsg(`Could not add work: ${detail}`);
      } else {
        setImportMsg('Added!');
        loadData();
      }
    } catch (e) { setImportMsg('Error: ' + e.message); }
    setImporting(false);
  }

  async function handleEpubFiles(files) {
    setImporting(true);
    setImportMsg(`Processing ${files.length} EPUB file(s)...`);
    const worksToImport = [];

    for (const file of files) {
      try {
        const zip = await JSZip.loadAsync(file);
        let opfContent = null;
        for (const [path, zipEntry] of Object.entries(zip.files)) {
          if (path.endsWith('.opf') || path.includes('content.opf')) {
            opfContent = await zipEntry.async('text');
            break;
          }
        }
        if (!opfContent) {
          const container = zip.file('META-INF/container.xml');
          if (container) {
            const containerXml = await container.async('text');
            const rootfileMatch = containerXml.match(/full-path="([^"]+\.opf)"/);
            if (rootfileMatch) {
              const opfFile = zip.file(rootfileMatch[1]);
              if (opfFile) opfContent = await opfFile.async('text');
            }
          }
        }

        if (opfContent) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(opfContent, 'text/xml');

          const getMeta = (name) => {
            const el = doc.querySelector(`metadata > *[name="${name}"], dc\\:${name}, ${name}`);
            return el ? el.textContent?.trim() : null;
          };
          const getAllMeta = (name) => {
            const els = doc.querySelectorAll(`dc\\:${name}, ${name}`);
            return Array.from(els).map(e => e.textContent?.trim()).filter(Boolean);
          };

          const title = getMeta('title') || file.name.replace('.epub', '');
          const creators = getAllMeta('creator');
          const source = getMeta('source') || '';
          const description = getMeta('description') || '';
          const subjects = getAllMeta('subject');

          let finalId = null;
          const ao3Match = source.match(/archiveofourown\.org\/works\/(\d+)/);
          if (ao3Match) finalId = parseInt(ao3Match[1]);

          if (!finalId) {
            const identifiers = doc.querySelectorAll('identifier');
            for (const ident of identifiers) {
              const text = ident.textContent || '';
              const urlMatch = text.match(/archiveofourown\.org\/works\/(\d+)/);
              if (urlMatch) { finalId = parseInt(urlMatch[1]); break; }
            }
          }

          if (!finalId) {
            const identifiers = doc.querySelectorAll('identifier');
            for (const ident of identifiers) {
              const scheme = ident.getAttribute('opf:scheme') || ident.getAttribute('scheme') || '';
              if (scheme.toLowerCase().includes('ao3') || scheme.toLowerCase().includes('archive')) {
                const idMatch = ident.textContent?.match(/(\d+)/);
                if (idMatch) { finalId = parseInt(idMatch[1]); break; }
              }
            }
          }

          if (!finalId) {
            const lastResort = opfContent.match(/archiveofourown\.org\/works\/(\d+)/);
            if (lastResort) finalId = parseInt(lastResort[1]);
          }

          if (finalId) {
            worksToImport.push({
              ao3_id: finalId,
              title,
              authors: creators,
              summary: description.replace(/<[^>]*>/g, '').substring(0, 2000),
              freeform_tags: subjects,
              source: 'epub'
            });
          } else {
            setImportMsg(prev => prev + `\nCouldn't find AO3 ID in ${file.name}`);
          }
        }
      } catch (e) {
        console.error('EPUB parse error:', e);
      }
    }

    if (worksToImport.length > 0) {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/import-works`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`
          },
          body: JSON.stringify({ works: worksToImport, source: 'epub' })
        });
        const data = await res.json();
        setImportMsg(`Imported ${data.imported} of ${worksToImport.length} fics from EPUBs!`);
        loadData();
      } catch (e) { setImportMsg('Import error: ' + e.message); }
    } else {
      setImportMsg('No AO3 work IDs found in the EPUB files. They may not be AO3 downloads.');
    }
    setImporting(false);
  }

  // --- WIP update checking ---
  // Uses supabase.functions.invoke() instead of raw fetch() because the
  // Supabase client automatically handles token refresh and sends the
  // correct auth headers. Raw fetch was causing 401s when the cached
  // access token was stale.
  async function checkWipUpdates() {
    setCheckingWips(true);
    setWipCheckMsg('Checking AO3 for updates...');
    try {
      const { data, error } = await supabase.functions.invoke('check-wip-updates');
      if (error) {
        setWipCheckMsg('Error: ' + error.message);
      } else if (data?.error) {
        setWipCheckMsg('Error: ' + data.error);
      } else if (data?.updated > 0) {
        // Show which fics actually got new chapters — the Edge Function
        // returns an updates array with { title, oldChapters, newChapters }
        const lines = data.updates.map(u =>
          `📖 ${u.title}: ${u.oldChapters} → ${u.newChapters} chapters`
        );
        const suffix = data.timedOut ? ` (checked ${data.checked} of ${data.total})` : '';
        setWipCheckMsg(`Found ${data.updated} with new chapters!${suffix}\n${lines.join('\n')}`);
      } else {
        const suffix = data?.timedOut ? ` of ${data.total}` : '';
        setWipCheckMsg(`Checked ${data?.checked || 0}${suffix} WIPs — no new chapters yet.`);
      }
      loadData(); // Refresh to pick up new has_update flags
    } catch (e) {
      setWipCheckMsg('Error checking for updates: ' + e.message);
    }
    setCheckingWips(false);
  }

  // Dismiss a single WIP update badge
  async function dismissWipUpdate(workId) {
    await supabase
      .from('wip_tracking')
      .update({ has_update: false, last_known_chapters: wipTracking[workId]?.updated_chapter_count || null })
      .eq('work_id', workId)
      .eq('user_id', userId);
    loadData();
  }

  // Dismiss all WIP update badges
  async function dismissAllWipUpdates() {
    const updatedWips = Object.values(wipTracking).filter(w => w.has_update);
    for (const wip of updatedWips) {
      await supabase
        .from('wip_tracking')
        .update({ has_update: false, last_known_chapters: wip.updated_chapter_count || wip.last_known_chapters })
        .eq('id', wip.id);
    }
    loadData();
  }

  const stats = useMemo(() => {
    const total = works.length;
    const totalWords = works.reduce((s, w) => s + (w.word_count || 0), 0);
    const statusCounts = { to_read: 0, reading: 0, completed: 0, dropped: 0, on_hold: 0, author_abandoned: 0 };
    works.forEach(w => {
      const st = statuses[w.id]?.status || 'to_read';
      if (statusCounts[st] !== undefined) statusCounts[st]++;
    });
    const wips = works.filter(w => !w.is_complete).length;

    const fandomCount = {};
    works.forEach(w => (w.fandoms || []).forEach(f => { fandomCount[f] = (fandomCount[f] || 0) + 1; }));
    const topFandoms = Object.entries(fandomCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 22) + '...' : name, value }));

    const ratingCount = {};
    works.forEach(w => { const r = w.rating || 'Not Rated'; ratingCount[r] = (ratingCount[r] || 0) + 1; });
    const ratingDist = Object.entries(ratingCount).map(([name, value]) => ({ name, value }));

    const shipCount = {};
    works.forEach(w => (w.relationships || []).forEach(r => { shipCount[r] = (shipCount[r] || 0) + 1; }));
    const topShips = Object.entries(shipCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name: name.length > 30 ? name.slice(0, 27) + '...' : name, value }));

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

  // --- Taste profile (shared by queue recs + discovery) ---
  const tasteProfile = useMemo(() => {
    const rated = works.filter(w => (statuses[w.id]?.rating_personal || 0) >= 4);
    const likedFandoms = {};
    const likedShips = {};
    rated.forEach(w => {
      (w.fandoms || []).forEach(f => { likedFandoms[f] = (likedFandoms[f] || 0) + 1; });
      (w.relationships || []).forEach(r => { likedShips[r] = (likedShips[r] || 0) + 1; });
    });
    // Top fandoms and ships, sorted by how often the user rates them highly
    const topFandoms = Object.entries(likedFandoms).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
    const topShips = Object.entries(likedShips).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
    return { likedFandoms, likedShips, topFandoms, topShips, ratedCount: rated.length };
  }, [works, statuses]);

  // --- Queue recommendations (in-library: to_read + reading, matching taste) ---
  // Rotates every 2 hours so the same fics don't sit at the top forever.
  // Uses a seeded shuffle: deterministic within a 2-hour window so it
  // doesn't flicker on re-renders, but gives a fresh order each rotation.
  const queueRotationSeed = useMemo(() => Math.floor(Date.now() / (2 * 60 * 60 * 1000)), []);

  const queueRecs = useMemo(() => {
    const { likedFandoms, likedShips } = tasteProfile;
    const queue = works.filter(w => {
      const st = statuses[w.id]?.status || 'to_read';
      return st === 'to_read' || st === 'reading';
    });

    const scored = queue.map(w => {
      let score = 0;
      let reasons = [];
      (w.fandoms || []).forEach(f => {
        if (likedFandoms[f]) { score += likedFandoms[f] * 2; reasons.push(`You like ${f}`); }
      });
      (w.relationships || []).forEach(r => {
        if (likedShips[r]) { score += likedShips[r] * 3; reasons.push(`You enjoy ${r}`); }
      });
      if (w.kudos > 1000) { score += 1; reasons.push('Popular fic'); }
      const st = statuses[w.id]?.status;
      if (st === 'reading') { score += 2; reasons.unshift('Currently reading'); }
      return { ...w, score, reasons: [...new Set(reasons)].slice(0, 3) };
    });

    const eligible = scored.filter(w => w.score > 0);

    // Seeded shuffle: mix a hash of the work ID with the rotation seed
    // to get a stable-but-rotating pseudo-random order. Works with the
    // same score get shuffled; higher-scored works still tend to rank
    // higher because we add a random jitter rather than fully randomizing.
    function hashCode(str, seed = 0) {
      let h = seed | 0;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      }
      return h;
    }

    const shuffled = eligible.map(w => {
      const jitter = (hashCode(w.id, queueRotationSeed) & 0x7fffffff) % 100 / 100;
      return { ...w, sortKey: w.score + jitter };
    }).sort((a, b) => b.sortKey - a.sortKey).slice(0, 10);

    return shuffled;
  }, [works, statuses, tasteProfile, queueRotationSeed]);

  // --- Discovery recommendations (fics NOT in your library, from the community) ---
  const [discoveryRecs, setDiscoveryRecs] = useState([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  // Track which works we've fetched for so we don't re-fetch unnecessarily
  const discoveryFetchKey = useRef('');

  // Score a discovery work against the user's taste profile
  function scoreDiscoveryWork(w, likedFandoms, likedShips) {
    let score = 0;
    let reasons = [];
    (w.fandoms || []).forEach(f => {
      if (likedFandoms[f]) { score += likedFandoms[f] * 2; reasons.push(`You like ${f}`); }
    });
    (w.relationships || []).forEach(r => {
      if (likedShips[r]) { score += likedShips[r] * 3; reasons.push(`You enjoy ${r}`); }
    });
    // Popularity signals — kudos and hits give a small boost, not dominant
    if (w.kudos > 5000) { score += 3; reasons.push('Highly popular'); }
    else if (w.kudos > 1000) { score += 1; reasons.push('Popular fic'); }
    // Completed fics get a small nudge — readers prefer not picking up abandoned WIPs
    if (w.is_complete) { score += 1; }
    return { ...w, score, reasons: [...new Set(reasons)].slice(0, 3) };
  }

  const fetchDiscoveryRecs = useCallback(async () => {
    const { topFandoms, topShips, likedFandoms, likedShips, ratedCount } = tasteProfile;
    if (ratedCount < 1 || topFandoms.length === 0) {
      setDiscoveryRecs([]);
      return;
    }

    // Build a cache key to avoid re-fetching when nothing changed
    const key = topFandoms.join('|') + '::' + topShips.join('|') + '::' + works.length;
    if (key === discoveryFetchKey.current) return;
    discoveryFetchKey.current = key;

    setDiscoveryLoading(true);
    try {
      // IDs of works already in the user's library — we exclude these
      const libraryWorkIds = new Set(works.map(w => w.id));

      // Query the shared works table for fics matching the user's top fandoms.
      // We use PostgREST's `cs` (contains) filter: fandoms.cs.["Fandom Name"]
      // means "the fandoms JSONB array contains this value". Combined with .or()
      // this gives us "matches ANY of these fandoms".
      const fandomFilters = topFandoms.map(f => `fandoms.cs.${JSON.stringify([f])}`).join(',');
      // Also query by ships if we have them
      const shipFilters = topShips.slice(0, 4).map(r => `relationships.cs.${JSON.stringify([r])}`).join(',');
      const allFilters = [fandomFilters, shipFilters].filter(Boolean).join(',');

      const { data: candidates, error } = await supabase
        .from('works')
        .select('*')
        .or(allFilters)
        .order('kudos', { ascending: false, nullsFirst: false })
        .limit(200);

      if (error) { console.error('Discovery fetch error:', error); setDiscoveryLoading(false); return; }

      // Filter out works already in library, score, and rank
      const scored = (candidates || [])
        .filter(w => !libraryWorkIds.has(w.id))
        .map(w => scoreDiscoveryWork(w, likedFandoms, likedShips))
        .filter(w => w.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

      setDiscoveryRecs(scored);
    } catch (e) { console.error('Discovery recs error:', e); }
    setDiscoveryLoading(false);
  }, [tasteProfile, works]);

  // Fetch discovery recs when taste profile or library changes
  useEffect(() => {
    if (!loading) fetchDiscoveryRecs();
  }, [fetchDiscoveryRecs, loading]);

  // Keep the old `recommendations` name as an alias for backward compat,
  // but point it at queueRecs so existing code doesn't break.
  const recommendations = queueRecs;

  // --- Server-side bookmark sync ---
  // Calls the sync-bookmarks Edge Function, which scrapes the user's
  // public AO3 bookmarks page server-side. The function creates/resumes
  // an import_jobs row to track progress. If it times out (150s limit),
  // the user can call again to resume from where it left off.
  const [syncingBookmarks, setSyncingBookmarks] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncJob, setSyncJob] = useState(null); // latest import_jobs row

  const syncBookmarks = useCallback(async () => {
    setSyncingBookmarks(true);
    setSyncMsg('Starting AO3 bookmark sync...');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      });
      const data = await res.json();
      if (data.error) {
        setSyncMsg(data.error);
      } else {
        setSyncMsg(data.message || `Imported ${data.imported} fics.`);
        if (data.job_id) {
          // Fetch the full job record for progress display
          const { data: job } = await supabase
            .from('import_jobs')
            .select('*')
            .eq('id', data.job_id)
            .single();
          setSyncJob(job);
        }
        loadData(); // Refresh library with new imports
      }
    } catch (e) {
      setSyncMsg('Sync failed: ' + e.message);
    }
    setSyncingBookmarks(false);
  }, [loadData]);

  // Load latest sync job on mount for progress display
  useEffect(() => {
    async function loadLatestJob() {
      const { data: jobs } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('user_id', userId)
        .eq('job_type', 'bookmarks')
        .order('created_at', { ascending: false })
        .limit(1);
      if (jobs && jobs.length > 0) setSyncJob(jobs[0]);
    }
    loadLatestJob();
  }, [userId]);

  // --- AI-powered recommendations (Plus feature) ---
  const [aiRecs, setAiRecs] = useState([]);
  const [aiSearchLinks, setAiSearchLinks] = useState([]);
  const [aiRecsLoading, setAiRecsLoading] = useState(false);
  const [aiRecsError, setAiRecsError] = useState('');
  const [aiRecsRemaining, setAiRecsRemaining] = useState(3); // default to max

  const fetchAiRecs = useCallback(async () => {
    if (!isPremium) return;
    setAiRecsLoading(true);
    setAiRecsError('');
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
        },
      });
      const data = await res.json();
      // Update remaining count from server response
      if (data.rate_limit) setAiRecsRemaining(data.rate_limit.remaining ?? (data.rate_limit.max - data.rate_limit.used));
      if (data.error) {
        setAiRecsError(data.error);
        if (!data.rate_limit) { setAiRecs([]); setAiSearchLinks([]); }
      } else {
        setAiRecs(data.recommendations || []);
        setAiSearchLinks(data.ao3_search_links || []);
      }
    } catch (e) {
      setAiRecsError('Failed to get AI recommendations: ' + e.message);
    }
    setAiRecsLoading(false);
  }, [isPremium]);

  return {
    works, statuses, readingLog, wipTracking, loading, importing, importMsg, setImportMsg,
    checkingWips, wipCheckMsg, setWipCheckMsg,
    bulkMode, setBulkMode, bulkSelected, setBulkSelected,
    stats, recommendations, discoveryRecs, discoveryLoading, tasteProfile,
    aiRecs, aiSearchLinks, aiRecsLoading, aiRecsError, aiRecsRemaining, fetchAiRecs,
    syncingBookmarks, syncMsg, syncJob, syncBookmarks,
    ao3Username,
    subscriptionTier, isPremium, isAtFicLimit, ficsRemaining, FREE_FIC_LIMIT,
    loadData, getStatusForWork, updateStatus, deleteWork,
    toggleBulkSelect, bulkSetStatus, bulkDelete,
    addByUrl, handleEpubFiles,
    checkWipUpdates, dismissWipUpdate, dismissAllWipUpdates
  };
}
