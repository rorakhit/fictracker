import logoUrl from './assets/logo.svg';
import { useState, useEffect } from 'react';
import { useLibrary } from './hooks/useLibrary';
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
import Welcome from './components/Welcome';
import FollowingView from './components/FollowingView';

// The FicTracker library page. It runs inside the extension: no account,
// no server, your data stays in this browser's extension storage.

function Dashboard() {
  const [view, setView] = useState('library');
  const [selected, setSelected] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editChapter, setEditChapter] = useState(0);

  const lib     = useLibrary();
  const shelves = useLocalShelves();
  const analytics = useAnalytics(lib.works, lib.statuses, lib.readingLog);

  const [activeShelfId, setActiveShelfId]           = useState(null);
  const [activeSmartShelfId, setActiveSmartShelfId] = useState(null);

  // The panel on AO3 links here as #work=<id> to open that fic, and a
  // fresh install lands on #welcome.
  const [welcome, setWelcome] = useState(() => window.location.hash === '#welcome');
  useEffect(() => {
    function fromHash() {
      if (window.location.hash === '#following') {
        setView('following');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
      const id = window.location.hash.match(/^#work=(\d+)$/)?.[1];
      const w = id && lib.works.find(x => x.id === id);
      if (w) {
        openWork(w);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib.works.length]);

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
    ['following', lib.news.length ? `Following (${lib.news.length})` : 'Following'],
    ['import',   'Import'],
    ['settings', 'Settings'],
  ];

  return (
    <div className="app">
      <div className="header">
        <h1>
          <img src={logoUrl} alt="" style={{ height: '2.2em', verticalAlign: 'middle', marginRight: 8 }} />
          Fic<span>Tracker</span>
        </h1>
        <div className="header-right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {lib.works.length} fic{lib.works.length !== 1 ? 's' : ''} · stored in this browser
          </span>
        </div>
      </div>

      {welcome && <Welcome onClose={() => { setWelcome(false); window.history.replaceState({}, '', window.location.pathname); }} onImport={() => { setWelcome(false); setView('import'); }} />}

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
          onOpenWork={openWork}
          readingLog={lib.readingLog}
          shelves={shelves.shelves}
          worksByShelf={shelves.worksByShelf}
          activeShelfId={activeShelfId}
          setActiveShelfId={setActiveShelfId}
          createShelf={shelves.createShelf}
          updateShelf={shelves.updateShelf}
          deleteShelf={shelves.deleteShelf}
          addWorksToShelf={shelves.addWorksToShelf}
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
          follows={lib.follows}
          follow={lib.follow}
          unfollow={lib.unfollow}
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
          ao3User={lib.ao3User}
        />
      )}

      {view === 'following' && (
        <FollowingView
          follows={lib.follows}
          news={lib.news}
          follow={lib.follow}
          unfollow={lib.unfollow}
          addNews={lib.addNews}
          dismissNews={lib.dismissNews}
          checkFollows={lib.checkFollows}
          check={lib.check}
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
  return <Dashboard />;
}
