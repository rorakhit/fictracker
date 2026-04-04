import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { COLORS } from '../utils/helpers';

export default function StatsView({ stats, works }) {
  if (works.length === 0) {
    return <div className="empty"><div className="emoji">📊</div><p>Import some fics to see your stats!</p></div>;
  }

  return (
    <>
      <div className="charts-grid">
        <div className="chart-card">
          <h3>Top Fandoms</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.topFandoms} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={140} tick={{ fill: '#8b8d97', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#14b8a6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Rating Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stats.ratingDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                {stats.ratingDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Word Count Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.wcDist} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="name" tick={{ fill: '#8b8d97', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8b8d97', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3>Top Ships</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.topShips} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={160} tick={{ fill: '#8b8d97', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8 }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="chart-card full" style={{ marginBottom: 20 }}>
        <h3>Quick Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 10 }}>
          <div><span style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{stats.totalWords.toLocaleString()}</span><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total words across all fics</div></div>
          <div><span style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>{stats.wips}</span><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Works in progress</div></div>
          <div><span style={{ fontSize: 24, fontWeight: 700, color: 'var(--purple)' }}>{stats.topFandoms[0]?.name || 'N/A'}</span><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Most-read fandom</div></div>
        </div>
      </div>
    </>
  );
}
