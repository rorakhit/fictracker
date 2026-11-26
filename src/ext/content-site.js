// src/ext/content-site.js
// Runs on fictracker.app. The old web app kept your library in that site's
// browser storage, which the extension can't see from anywhere else. When
// you open fictracker.app with the extension installed, this copies that
// data into the extension once. The site's own copy is left untouched.
// It also lets the page know the extension is installed, so the page can
// offer an "Open your library" button.

const LEGACY_KEYS = ['ft_library', 'ft_shelves', 'ft_smart_shelves', 'ft_settings', 'ft_finder_presets'];

function readLegacy() {
  const data = {};
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) data[key] = JSON.parse(raw);
    } catch { /* ignore unreadable keys */ }
  }
  return data;
}

function tellPage(detail) {
  document.documentElement.dataset.fictrackerExtension = 'installed';
  window.dispatchEvent(new CustomEvent('fictracker-extension', { detail }));
}

async function main() {
  const legacy = readLegacy();
  const works = legacy.ft_library?.works || [];
  let imported = null;

  if (works.length > 0) {
    const res = await chrome.runtime.sendMessage({
      type: 'IMPORT_LEGACY',
      data: { ...legacy, library: legacy.ft_library },
    });
    if (res?.ok && !res.skipped) imported = res.count;
  }
  tellPage({ imported });

  // The page's "Open your library" button asks for this.
  window.addEventListener('fictracker-open-library', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_LIBRARY' });
  });
}

main().catch(() => tellPage({ imported: null }));
