import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import JSZip from 'jszip';

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';

export function useLibrary(userId) {
  const [works, setWorks] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());

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
    } catch (e) { console.error('Load error:', e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  function getStatusForWork(workId) {
    return statuses[workId] || null;
  }

  async function updateStatus(workId, updates) {
    const existing = statuses[workId];
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

  async function addByUrl(url) {
    if (!url.trim()) return;
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
        body: JSON.stringify({ works: [{ ao3_id: ao3Id, title: 'Loading...', source: 'manual' }], source: 'manual' })
      });
      const data = await res.json();
      setImportMsg(`Added! (${data.imported} imported)`);
      loadData();
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

  const stats = useMemo(() => {
    const total = works.length;
    const totalWords = works.reduce((s, w) => s + (w.word_count || 0), 0);
    const statusCounts = { to_read: 0, reading: 0, completed: 0, dropped: 0, on_hold: 0 };
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

  const recommendations = useMemo(() => {
    const rated = works.filter(w => (statuses[w.id]?.rating_personal || 0) >= 4);
    const likedFandoms = {};
    const likedShips = {};
    rated.forEach(w => {
      (w.fandoms || []).forEach(f => { likedFandoms[f] = (likedFandoms[f] || 0) + 1; });
      (w.relationships || []).forEach(r => { likedShips[r] = (likedShips[r] || 0) + 1; });
    });

    const unread = works.filter(w => {
      const st = statuses[w.id]?.status || 'to_read';
      return st === 'to_read';
    });

    const scored = unread.map(w => {
      let score = 0;
      let reasons = [];
      (w.fandoms || []).forEach(f => { if (likedFandoms[f]) { score += likedFandoms[f] * 2; reasons.push(`You like ${f}`); } });
      (w.relationships || []).forEach(r => { if (likedShips[r]) { score += likedShips[r] * 3; reasons.push(`You enjoy ${r}`); } });
      if (w.kudos > 1000) { score += 1; reasons.push('Popular fic'); }
      return { ...w, score, reasons: [...new Set(reasons)].slice(0, 2) };
    });

    return scored.filter(w => w.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
  }, [works, statuses]);

  return {
    works, statuses, loading, importing, importMsg, setImportMsg,
    bulkMode, setBulkMode, bulkSelected, setBulkSelected,
    stats, recommendations,
    loadData, getStatusForWork, updateStatus, deleteWork,
    toggleBulkSelect, bulkSetStatus, bulkDelete,
    addByUrl, handleEpubFiles
  };
}
