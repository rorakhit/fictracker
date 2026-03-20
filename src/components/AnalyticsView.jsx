import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import ReadingWrapped from './ReadingWrapped';

// Color palette for fandom stacked areas — pulled from the brand board's
// warm/cool tension. These need to be visually distinct when stacked.
const FANDOM_COLORS = ['#e04666', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b'];

const tooltipStyle = {
  background: '#1a1d27',
  border: '1px solid #2a2d3a',
  borderRadius: 8,
  fontSize: 12,
};

function formatWords(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString();
}

function formatWeekLabel(weekStr) {
  const d = new Date(weekStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-');
  const d = new Date(parseInt(y), parseInt(m) - 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function AnalyticsView({ analytics, works }) {
  const [timeScale, setTimeScale] = useState('weekly'); // weekly | monthly

  if (works.length === 0) {
    return (
      <div className="empty">
        <div className="emoji">📈</div>
        <p>Import some fics to see your reading analytics!</p>
      </div>
    );
  }

  if (analytics.totalEvents === 0) {
    return (
      <div className="empty">
        <div className="emoji">📈</div>
        <p>Start tracking your reading to build up analytics data.</p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
          Mark fics as "reading" or "completed" and your stats will appear here.
        </p>
      </div>
    );
  }

  const timelineData = timeScale === 'weekly'
    ? analytics.weeklyActivity.map(w => ({ ...w, label: formatWeekLabel(w.week) }))
    : analytics.monthlyActivity.map(m => ({ ...m, label: formatMonthLabel(m.month) }));

  const fandomData = analytics.fandomAreaData.map(row => ({
    ...row,
    label: formatMonthLabel(row.month),
  }));

  // Truncate fandom names for the legend
  const truncate = (s, max = 20) => s.length > max ? s.slice(0, max - 2) + '...' : s;

  return (
    <>
      {/* Big stat cards */}
      <div className="analytics-hero">
        <div className="analytics-stat">
          <div className="analytics-stat-value" style={{ color: 'var(--accent)' }}>
            {formatWords(analytics.totalWordsRead)}
          </div>
          <div className="analytics-stat-label">Words read</div>
        </div>
        <div className="analytics-stat">
          <div className="analytics-stat-value" style={{ color: 'var(--warning)' }}>
            {analytics.wordsPerDay.toLocaleString()}
          </div>
          <div className="analytics-stat-label">Words/day (30d)</div>
        </div>
        <div className="analytics-stat">
          <div className="analytics-stat-value" style={{ color: 'var(--success)' }}>
            {analytics.currentStreak}
          </div>
          <div className="analytics-stat-label">Day streak</div>
        </div>
        <div className="analytics-stat">
          <div className="analytics-stat-value" style={{ color: 'var(--purple)' }}>
            {analytics.completionRate}%
          </div>
          <div className="analytics-stat-label">Completion rate</div>
        </div>
        <div className="analytics-stat">
          <div className="analytics-stat-value" style={{ color: 'var(--blue)' }}>
            {analytics.totalCompleted}
          </div>
          <div className="analytics-stat-label">Fics finished</div>
        </div>
      </div>

      {/* Reading activity timeline */}
      <div className="chart-card full" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Reading Activity</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`pill ${timeScale === 'weekly' ? 'active' : ''}`}
              onClick={() => setTimeScale('weekly')}
            >Weekly</button>
            <button
              className={`pill ${timeScale === 'monthly' ? 'active' : ''}`}
              onClick={() => setTimeScale('monthly')}
            >Monthly</button>
          </div>
        </div>
        {timelineData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timelineData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="wordsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#8b8d97', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#2a2d3a' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#8b8d97', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatWords}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [formatWords(value), 'Words']}
              />
              <Area
                type="monotone"
                dataKey="words"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#wordsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Not enough data yet for a timeline. Keep reading!
          </div>
        )}
      </div>

      <div className="charts-grid">
        {/* Fandom breakdown over time */}
        <div className="chart-card" style={{ gridColumn: fandomData.length > 0 ? '1 / -1' : undefined }}>
          <h3>Fandoms Over Time</h3>
          {fandomData.length > 1 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={fandomData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#8b8d97', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#2a2d3a' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#8b8d97', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatWords}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [formatWords(value), truncate(name)]}
                  />
                  {analytics.topFandomNames.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stackId="fandoms"
                      stroke={FANDOM_COLORS[i]}
                      fill={FANDOM_COLORS[i]}
                      fillOpacity={0.3}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                {analytics.topFandomNames.map((name, i) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: FANDOM_COLORS[i], display: 'inline-block' }} />
                    {truncate(name, 25)}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
              Need more months of data to show fandom trends.
            </div>
          )}
        </div>

        {/* Personal rating distribution */}
        <div className="chart-card">
          <h3>Your Ratings</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={analytics.ratingDistribution} margin={{ left: 0, right: 10 }}>
              <XAxis dataKey="rating" tick={{ fill: '#8b8d97', fontSize: 12 }} tickLine={false} />
              <YAxis tick={{ fill: '#8b8d97', fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="var(--warning)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {analytics.avgRating !== 'N/A' && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Average rating: <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{analytics.avgRating}★</span>
            </div>
          )}
        </div>

        {/* Reading pace deep dive */}
        <div className="chart-card">
          <h3>Reading Pace</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '10px 0' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--teal)' }}>
                {analytics.avgDaysToComplete !== null ? `${analytics.avgDaysToComplete}d` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg. days to complete</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>
                {analytics.fastestComplete !== null ? `${analytics.fastestComplete}d` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fastest completion</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--blue)' }}>
                {formatWords(analytics.avgWordsPerFic)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg. words/fic (completed)</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--purple)' }}>
                {analytics.longestStreak}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Longest streak (days)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Reading Wrapped */}
      <ReadingWrapped
        monthlyWrapped={analytics.monthlyWrapped}
        yearlyWrapped={analytics.yearlyWrapped}
      />

      {/* Bootstrap notice */}
      {!analytics.hasLogData && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          marginTop: 8,
          fontSize: 13,
          color: 'var(--text-muted)',
          textAlign: 'center',
        }}>
          These stats are estimated from your library history. As you use FicTracker, the analytics will get more precise with real reading activity data.
        </div>
      )}
    </>
  );
}
