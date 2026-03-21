import { useState, useRef, useCallback } from 'react';

/**
 * ReadingWrapped — Spotify Wrapped-style summary cards for monthly and yearly
 * reading data. Includes Canvas-based image export for sharing on social media.
 *
 * Design decisions:
 * - Pure Canvas rendering (no html2canvas dependency) for full control, zero
 *   extra bundle size, and reliable cross-browser/mobile output.
 * - 1080×1350px output (4:5 ratio) — fits Instagram posts, Tumblr, Twitter.
 * - Dark theme baked into the canvas so the image looks good standalone.
 * - Uses navigator.share() on mobile for native share sheet, falls back to
 *   download on desktop.
 */

function formatWords(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

// --- Canvas image generation ---
// Renders a wrapped card as a standalone image. All styling is hardcoded
// (no CSS variables) because Canvas doesn't have access to the DOM's
// computed styles. Colors match our dark theme.
const CANVAS_W = 1080;
const CANVAS_H = 1350;
const COLORS = {
  bg: '#0f1117',
  surface: '#1a1d27',
  border: '#2a2d3a',
  text: '#e4e4e7',
  muted: '#8b8d97',
  accent: '#e04666',
  success: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  teal: '#14b8a6',
};

function renderWrappedCanvas(wrapped) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Subtle border card
  const cardX = 60, cardY = 60, cardW = CANVAS_W - 120, cardH = CANVAS_H - 120;
  ctx.fillStyle = COLORS.surface;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.stroke();

  let y = 140;

  // Header
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 52px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${wrapped.label}`, CANVAS_W / 2, y);
  y += 60;
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.fillText('Reading Wrapped', CANVAS_W / 2, y);
  y += 80;

  // Stat grid (2 columns)
  const stats = [
    { label: 'WORDS READ', value: formatWords(wrapped.words), color: COLORS.accent },
    { label: 'FICS COMPLETED', value: String(wrapped.ficsCompleted), color: COLORS.success },
    { label: 'CHAPTERS READ', value: wrapped.chapters.toLocaleString(), color: COLORS.blue },
    { label: 'FANDOMS EXPLORED', value: String(wrapped.uniqueFandoms), color: COLORS.purple },
  ];

  const colW = cardW / 2;
  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = cardX + colW * col + colW / 2;
    const cy = y + row * 140;

    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(stat.label, cx, cy);

    ctx.fillStyle = stat.color;
    ctx.font = 'bold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.fillText(stat.value, cx, cy + 55);
  });

  y += 300;

  // Highlights
  const highlights = [];
  if (wrapped.topFandom) {
    highlights.push({ label: 'TOP FANDOM', value: wrapped.topFandom, sub: `${formatWords(wrapped.topFandomWords)} words`, color: COLORS.accent });
  }
  if (wrapped.topShip) {
    highlights.push({ label: 'TOP SHIP', value: wrapped.topShip, color: COLORS.purple });
  }
  if (wrapped.longestFic) {
    const sub = `${formatWords(wrapped.longestFic.word_count || 0)} words${wrapped.longestFic.authors?.[0] ? ` by ${wrapped.longestFic.authors[0]}` : ''}`;
    highlights.push({ label: 'LONGEST FIC', value: wrapped.longestFic.title, sub, color: COLORS.teal });
  }

  highlights.forEach((h) => {
    // Highlight box background
    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.roundRect(cardX + 40, y - 10, cardW - 80, h.sub ? 120 : 100, 16);
    ctx.fill();

    ctx.fillStyle = COLORS.muted;
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(h.label, CANVAS_W / 2, y + 22);

    ctx.fillStyle = h.color;
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    // Truncate long names
    let displayValue = h.value;
    while (ctx.measureText(displayValue).width > cardW - 160 && displayValue.length > 10) {
      displayValue = displayValue.slice(0, -4) + '...';
    }
    ctx.fillText(displayValue, CANVAS_W / 2, y + 60);

    if (h.sub) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
      ctx.fillText(h.sub, CANVAS_W / 2, y + 90);
    }

    y += h.sub ? 140 : 120;
  });

  // Footer branding
  ctx.fillStyle = COLORS.muted;
  ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('📖 FicTracker', CANVAS_W / 2, CANVAS_H - 90);

  return canvas;
}

async function shareWrappedImage(wrapped) {
  const canvas = renderWrappedCanvas(wrapped);

  // Convert to blob
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const filename = `fictracker-wrapped-${wrapped.label.toLowerCase().replace(/\s+/g, '-')}.png`;

  // Try native share (mobile) first, fall back to download
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'image/png' });
    const shareData = { files: [file], title: `${wrapped.label} Reading Wrapped` };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to download
      }
    }
  }

  // Download fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function WrappedCard({ wrapped, period }) {
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      await shareWrappedImage(wrapped);
    } catch (e) {
      console.error('Share error:', e);
    }
    setSharing(false);
  }, [wrapped]);

  if (wrapped.words === 0 && wrapped.ficsCompleted === 0) {
    return (
      <div className="wrapped-card">
        <h3>{period}</h3>
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          No reading activity {period === wrapped.label ? `in ${wrapped.label}` : 'yet'}. Time to open a fic!
        </div>
      </div>
    );
  }

  return (
    <div className="wrapped-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>
          <span style={{ color: 'var(--accent)' }}>{wrapped.label}</span> Reading Wrapped
        </h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleShare}
          disabled={sharing}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {sharing ? 'Generating...' : '📤 Share'}
        </button>
      </div>

      <div className="wrapped-grid">
        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Words Read</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--accent)' }}>
            {formatWords(wrapped.words)}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Fics Completed</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--success)' }}>
            {wrapped.ficsCompleted}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Chapters Read</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--blue)' }}>
            {wrapped.chapters.toLocaleString()}
          </div>
        </div>

        <div className="wrapped-stat">
          <div className="wrapped-stat-label">Fandoms Explored</div>
          <div className="wrapped-stat-value" style={{ color: 'var(--purple)' }}>
            {wrapped.uniqueFandoms}
          </div>
        </div>

        {wrapped.topFandom && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Top Fandom
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
              {wrapped.topFandom}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatWords(wrapped.topFandomWords)} words
            </div>
          </div>
        )}

        {wrapped.topShip && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Top Ship
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--purple)' }}>
              {wrapped.topShip}
            </div>
          </div>
        )}

        {wrapped.longestFic && (
          <div className="wrapped-highlight">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              Longest Fic Completed
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
              {wrapped.longestFic.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatWords(wrapped.longestFic.word_count || 0)} words
              {wrapped.longestFic.authors?.length > 0 && ` by ${wrapped.longestFic.authors[0]}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReadingWrapped({ monthlyWrapped, yearlyWrapped }) {
  const [showWrapped, setShowWrapped] = useState(false);

  return (
    <div className="wrapped-container">
      <div
        className="chart-card full"
        style={{ textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
        onClick={() => setShowWrapped(!showWrapped)}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>
          {showWrapped ? '📖' : '🎁'}
        </div>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {showWrapped ? 'Hide' : 'View'} Your Reading Wrapped
        </h3>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {showWrapped ? 'Click to collapse' : 'See your reading highlights at a glance'}
        </div>
      </div>

      {showWrapped && (
        <>
          <WrappedCard wrapped={monthlyWrapped} period="This Month" />
          <WrappedCard wrapped={yearlyWrapped} period="This Year" />
        </>
      )}
    </div>
  );
}
