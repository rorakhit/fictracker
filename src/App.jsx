import { useState, useEffect } from 'react';
import { useLocalLibrary } from './hooks/useLocalLibrary';
import { useLocalShelves } from './hooks/useLocalShelves';
import { useAnalytics } from './hooks/useAnalytics';
import Library from './components/Library';
import StatsView from './components/StatsView';
import AnalyticsView from './components/AnalyticsView';
import FicFinderView from './components/FicFinderView';
import SeriesView from './components/SeriesView';
import ImportView from './components/ImportView';
import WorkModal from './components/WorkModal';
import SettingsView from './components/SettingsView';

// FicTracker is now local-first: no account, no server, your data stays
// in your browser. We removed Supabase auth entirely — the app opens
// straight to your library on first load.

function Dashboard() {
  const [view, setView] = useState('library');
  const [selected, setSelected] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editChapter, setEditChapter] = useState(0);

  const lib     = useLocalLibrary();
  const shelves = useLocalShelves();
  const analytics = useAnalytics(lib.works, lib.statuses, lib.readingLog);

  const [activeShelfId, setActiveShelfId]           = useState(null);
  const [activeSmartShelfId, setActiveSmartShelfId] = useState(null);
  const [importBanner, setImportBanner]             = useState('');

  // Handle ?import=<encoded-work> from the Quick Add bookmarklet.
  // The bookmarklet parses AO3 metadata client-side and opens FicTracker
  // with the data encoded in the URL — no server involved.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('import');
    if (!raw) return;

    // Strip the param immediately so refreshing doesn't re-import
    window.history.replaceState({}, '', window.location.pathname);

    try {
      const work = JSON.parse(decodeURIComponent(raw));
      if (!work.ao3_id) throw new Error('Missing ao3_id');
      lib.importWork(work);
      setImportBanner(`Added: ${work.title}`);
      setTimeout(() => setImportBanner(''), 4000);
    } catch (e) {
      setImportBanner(`Could not import fic: ${e.message}`);
      setTimeout(() => setImportBanner(''), 5000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  function openWork(w) {
    const st = lib.statuses[w.id];
    setSelected(w);
    setEditStatus(st?.status || 'to_read');
    setEditRating(st?.rating_personal || 0);
    setEditNotes(st?.notes || '');
    setEditChapter(st?.current_chapter || 0);
  }

  async function saveWorkDetails() {
    if (!selected) return;
    const updates = {
      status:           editStatus,
      rating_personal:  editRating || null,
      notes:            editNotes || null,
      current_chapter:  editChapter || 0,
    };
    if (editStatus === 'reading' && !lib.statuses[selected.id]?.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (editStatus === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    await lib.updateStatus(selected.id, updates);
    setSelected(null);
  }

  async function handleDelete(workId) {
    await lib.deleteWork(workId);
    setSelected(null);
  }

  const TABS = [
    ['library',  'Library'],
    ['stats',    'Stats'],
    ['analytics','Analytics'],
    ['finder',   'Fic Finder'],
    ['series',   'Series'],
    ['import',   'Import'],
    ['settings', 'Settings'],
  ];

  return (
    <div className="app">
      <div className="header">
        <h1>
          <img src="/logo.svg" alt="" style={{ height: '2.2em', verticalAlign: 'middle', marginRight: 8 }} />
          Fic<span>Tracker</span>
        </h1>
        <div className="header-right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {lib.works.length} fic{lib.works.length !== 1 ? 's' : ''} · local
          </span>
        </div>
      </div>

      {importBanner && (
        <div style={{
          padding: '10px 16px',
          background: importBanner.startsWith('Could not')
            ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)',
          border: `1px solid ${importBanner.startsWith('Could not') ? 'rgba(239,68,68,0.2)' : 'rgba(20,184,166,0.2)'}`,
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 600,
          color: importBanner.startsWith('Could not') ? '#ef4444' : 'var(--accent-teal)',
        }}>
          {importBanner}
        </div>
      )}

      <div className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>
            {l}
          </button>
        ))}
      </div>

      {view === 'library' && (
        <Library
          works={lib.works}
          statuses={lib.statuses}
          stats={lib.stats}
          wipTracking={lib.wipTracking}
          bulkMode={lib.bulkMode}
          setBulkMode={lib.setBulkMode}
          bulkSelected={lib.bulkSelected}
          setBulkSelected={lib.setBulkSelected}
          toggleBulkSelect={lib.toggleBulkSelect}
          bulkSetStatus={lib.bulkSetStatus}
          bulkDelete={lib.bulkDelete}
          importing={lib.importing}
          importMsg={lib.importMsg}
          addByUrl={lib.addByUrl}
          checkingWips={lib.checkingWips}
          wipCheckMsg={lib.wipCheckMsg}
          checkWipUpdates={lib.checkWipUpdates}
          dismissWipUpdate={lib.dismissWipUpdate}
          dismissAllWipUpdates={lib.dismissAllWipUpdates}
          isAtFicLimit={lib.isAtFicLimit}
          ficsRemaining={lib.ficsRemaining}
          ficLimit={lib.FREE_FIC_LIMIT}
          onOpenWork={openWork}
          shelves={shelves.shelves}
          worksByShelf={shelves.worksByShelf}
          activeShelfId={activeShelfId}
          setActiveShelfId={setActiveShelfId}
          createShelf={shelves.createShelf}
          updateShelf={shelves.updateShelf}
          deleteShelf={shelves.deleteShelf}
          addWorksToShelf={shelves.addWorksToShelf}
          isAtShelfLimit={shelves.isAtShelfLimit}
          shelvesRemaining={shelves.shelvesRemaining}
          totalShelfCount={shelves.totalShelfCount}
          shelfLimit={shelves.FREE_SHELF_LIMIT}
          isPremium={lib.isPremium}
          onShelfUpgradeClick={() => setView('settings')}
          smartShelves={shelves.smartShelves}
          activeSmartShelfId={activeSmartShelfId}
          setActiveSmartShelfId={setActiveSmartShelfId}
          createSmartShelf={shelves.createSmartShelf}
          deleteSmartShelf={shelves.deleteSmartShelf}
        />
      )}

      {view === 'stats'     && <StatsView stats={lib.stats} works={lib.works} />}
      {view === 'analytics' && <AnalyticsView analytics={analytics} works={lib.works} />}

      {view === 'series' && (
        <SeriesView
          seriesMap={lib.seriesMap}
          statuses={lib.statuses}
          onOpenWork={openWork}
        />
      )}

      {view === 'finder' && (
        <FicFinderView
          recommendations={lib.recommendations}
          tasteProfile={lib.tasteProfile}
          onOpenWork={openWork}
          works={lib.works}
          statuses={lib.statuses}
        />
      )}

      {view === 'import' && (
        <ImportView
          importing={lib.importing}
          importMsg={lib.importMsg}
          addByUrl={lib.addByUrl}
          handleEpubFiles={lib.handleEpubFiles}
        />
      )}

      {view === 'settings' && <SettingsView />}

      {selected && (
        <WorkModal
          work={selected}
          status={lib.statuses[selected.id]}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          editRating={editRating}
          setEditRating={setEditRating}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          editChapter={editChapter}
          setEditChapter={setEditChapter}
          onSave={saveWorkDetails}
          onDelete={handleDelete}
          onClose={() => setSelected(null)}
          shelves={shelves.shelves}
          shelvesByWork={shelves.shelvesByWork}
          addWorkToShelf={shelves.addWorkToShelf}
          removeWorkFromShelf={shelves.removeWorkFromShelf}
        />
      )}
    </div>
  );
}

export default function App() {
  // No auth, no loading screen — open straight to the library.
  return <Dashboard />;
}
