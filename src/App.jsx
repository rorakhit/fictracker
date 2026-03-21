import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useLibrary } from './hooks/useLibrary';
import { useAnalytics } from './hooks/useAnalytics';
import LoginPage from './components/LoginPage';
import SettingsView from './components/SettingsView';
import Library from './components/Library';
import StatsView from './components/StatsView';
import AnalyticsView from './components/AnalyticsView';
import RecsView from './components/RecsView';
import ImportView from './components/ImportView';
import WorkModal from './components/WorkModal';

function Dashboard({ session }) {
  const userId = session.user.id;
  const [view, setView] = useState('library');
  const [selected, setSelected] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [editRating, setEditRating] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editChapter, setEditChapter] = useState(0);

  const lib = useLibrary(userId);
  const analytics = useAnalytics(lib.works, lib.statuses, lib.readingLog);

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
      status: editStatus,
      rating_personal: editRating || null,
      notes: editNotes || null,
      current_chapter: editChapter || 0,
    };
    if (editStatus === 'reading' && !lib.statuses[selected.id]?.started_at) updates.started_at = new Date().toISOString();
    if (editStatus === 'completed') updates.completed_at = new Date().toISOString();
    await lib.updateStatus(selected.id, updates);
    setSelected(null);
  }

  async function handleDelete(workId) {
    await lib.deleteWork(workId);
    setSelected(null);
  }

  if (lib.loading) return <div className="app"><div className="loading">Loading FicTracker...</div></div>;

  return (
    <div className="app">
      <div className="header">
        <h1>📖 Fic<span>Tracker</span></h1>
        <div className="header-right">
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{session.user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={async () => { await supabase.auth.signOut(); }}>Sign Out</button>
        </div>
      </div>

      <div className="tabs">
        {[['library', 'Library'], ['stats', 'Stats'], ['analytics', 'Analytics'], ['recs', 'For You'], ['import', 'Import'], ['settings', 'Settings']].map(([k, l]) => (
          <button key={k} className={`tab ${view === k ? 'active' : ''}`} onClick={() => setView(k)}>{l}</button>
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
        />
      )}

      {view === 'stats' && <StatsView stats={lib.stats} works={lib.works} />}
      {view === 'analytics' && <AnalyticsView analytics={analytics} works={lib.works} />}
      {view === 'recs' && (
        <RecsView
          recommendations={lib.recommendations}
          discoveryRecs={lib.discoveryRecs}
          discoveryLoading={lib.discoveryLoading}
          tasteProfile={lib.tasteProfile}
          onOpenWork={openWork}
          onAddToLibrary={lib.addByUrl}
          isPremium={lib.isPremium}
          aiRecs={lib.aiRecs}
          aiSearchLinks={lib.aiSearchLinks}
          aiRecsLoading={lib.aiRecsLoading}
          aiRecsError={lib.aiRecsError}
          aiRecsRemaining={lib.aiRecsRemaining}
          onFetchAiRecs={lib.fetchAiRecs}
        />
      )}
      {view === 'import' && (
        <ImportView
          session={session}
          importing={lib.importing}
          importMsg={lib.importMsg}
          addByUrl={lib.addByUrl}
          handleEpubFiles={lib.handleEpubFiles}
        />
      )}
      {view === 'settings' && <SettingsView userId={userId} session={session} />}

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
        />
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (loading) return <div className="app"><div className="loading">Loading...</div></div>;
  if (!session) return <LoginPage />;
  return <Dashboard session={session} />;
}
