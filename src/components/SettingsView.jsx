import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export default function SettingsView({ userId, session }) {
  const [ao3Username, setAo3Username] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('ao3_username')
          .eq('user_id', userId)
          .single();
        if (!error && data) {
          setAo3Username(data.ao3_username || '');
        }
      } catch (e) { console.error('Load settings error:', e); }
      setLoading(false);
    }
    loadSettings();
  }, [userId]);

  async function saveSettings() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ user_id: userId, ao3_username: ao3Username });
      if (error) throw error;
    } catch (e) { console.error('Save error:', e); }
    setSaving(false);
  }

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="settings-card">
      <h2>Settings</h2>

      <div className="form-group">
        <label>Account Email</label>
        <input type="email" value={session.user.email} readOnly style={{ color: 'var(--text-muted)' }} />
      </div>

      <div className="form-group">
        <label>AO3 Username (optional)</label>
        <input
          type="text"
          placeholder="Your AO3 username"
          value={ao3Username}
          onChange={e => setAo3Username(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-accent" onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
