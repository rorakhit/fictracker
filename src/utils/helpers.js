export const COLORS = ['#14b8a6','#3b82f6','#8b5cf6','#e04666','#f59e0b','#22c55e','#f97316','#ec4899','#6366f1','#84cc16'];

// Returns a human-friendly relative time string: "just now", "3 days ago", etc.
export function timeAgo(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return null;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (mins  < 2)   return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  === 1) return 'yesterday';
  if (days  < 7)   return `${days} days ago`;
  if (weeks === 1) return '1 week ago';
  if (weeks < 5)   return `${weeks} weeks ago`;
  if (months < 12) return `${months} months ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Reading speed presets (words per minute)
export const READING_SPEEDS = {
  slow:    150,
  average: 250,
  fast:    400,
};

// Returns a human-readable estimate like "~2h 30m" or "~45 min".
// wpm defaults to 250 (average adult silent reading speed).
export function readingTime(wordCount, wpm = 250) {
  if (!wordCount || wordCount <= 0) return null;
  const minutes = Math.round(wordCount / wpm);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

export function ratingClass(r) {
  if (!r) return '';
  if (r.startsWith('Explicit')) return 'rating-e';
  if (r.startsWith('Mature')) return 'rating-m';
  if (r.startsWith('Teen')) return 'rating-t';
  return 'rating-g';
}

export function wordCountLabel(wc) {
  if (!wc) return '?';
  if (wc < 1000) return wc.toLocaleString();
  if (wc < 1000000) return (wc / 1000).toFixed(wc < 10000 ? 1 : 0) + 'k';
  return (wc / 1000000).toFixed(1) + 'M';
}
