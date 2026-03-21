// FicTracker Bookmarklet (source — minified version is what users install)
//
// This runs on any AO3 work page when the user taps/clicks the bookmarklet.
// It scrapes metadata from the DOM, checks if the user is authenticated
// (token stored in localStorage on fictracker.vercel.app), and sends
// the work to the import-works Edge Function.
//
// For iPad Safari, this is the zero-friction alternative to a full
// Safari Web Extension — no Xcode build, no App Store, just a bookmark.

(function () {
  'use strict';

  const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnFmbnJrcHVveWp0dWdhdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NDAsImV4cCI6MjA4OTQ2MTQ0MH0.gEjhPIGqXqAj_ZU69upkk_rW3-392b0TWNLv-CVC1mU';
  const APP_URL = 'https://fictracker.vercel.app';

  // Check we're on an AO3 work page
  const workMatch = window.location.href.match(/archiveofourown\.org\/works\/(\d+)/);
  if (!workMatch) {
    alert('FicTracker: Open an AO3 work page first!');
    return;
  }

  const ao3Id = parseInt(workMatch[1]);

  // Scrape metadata
  function scrape() {
    const q = (sel) => document.querySelector(sel);
    const qa = (sel) => Array.from(document.querySelectorAll(sel)).map(e => e.textContent.trim());
    const meta = { ao3_id: ao3Id };

    meta.title = q('.title.heading')?.textContent?.trim() || 'Untitled';
    meta.authors = qa('[rel="author"]');
    meta.rating = q('dd.rating.tags a.tag')?.textContent?.trim() || null;
    meta.warnings = qa('dd.warning.tags a.tag');
    meta.categories = qa('dd.category.tags a.tag');
    meta.fandoms = qa('dd.fandom.tags a.tag');
    meta.relationships = qa('dd.relationship.tags a.tag');
    meta.characters = qa('dd.character.tags a.tag');
    meta.freeform_tags = qa('dd.freeform.tags a.tag');
    meta.language = q('dd.language')?.textContent?.trim() || 'English';

    const wcEl = q('dd.words');
    meta.word_count = wcEl ? parseInt(wcEl.textContent.replace(/,/g, '')) : null;

    const chapEl = q('dd.chapters');
    if (chapEl) {
      const m = chapEl.textContent.trim().match(/(\d+)\s*\/\s*(\d+|\?)/);
      if (m) {
        meta.chapter_count = parseInt(m[1]);
        meta.chapter_total = m[2] === '?' ? null : parseInt(m[2]);
        meta.is_complete = meta.chapter_total !== null && meta.chapter_count >= meta.chapter_total;
      }
    }

    meta.kudos = q('dd.kudos') ? parseInt(q('dd.kudos').textContent.replace(/,/g, '')) : null;
    meta.hits = q('dd.hits') ? parseInt(q('dd.hits').textContent.replace(/,/g, '')) : null;
    meta.summary = q('.summary .userstuff')?.textContent?.trim()?.substring(0, 2000) || null;

    return meta;
  }

  // Show a toast notification on the page
  function showToast(msg, isError) {
    const existing = document.getElementById('ft-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'ft-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '12px 20px',
      borderRadius: '10px',
      background: isError ? '#1a1012' : '#0f1318',
      border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : 'rgba(20,184,166,0.3)'}`,
      color: isError ? '#ef4444' : '#14b8a6',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '14px',
      fontWeight: '600',
      zIndex: '999999',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      transition: 'opacity 0.3s',
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  // Get token — we use a cross-origin iframe trick to read from fictracker's localStorage.
  // But that's blocked by most browsers. Instead, we store the token in a cookie
  // accessible to the bookmarklet, OR we prompt for login.
  //
  // Simplest approach: store the API token in the bookmarklet URL itself (generated
  // per-user from the Settings page). This avoids all cross-origin issues.
  //
  // The bookmarklet URL looks like:
  // javascript:(function(){...TOKEN='ey...'...})()
  //
  // The token variable is injected when the user copies the bookmarklet from Settings.
  const TOKEN = '%%TOKEN%%';

  if (!TOKEN || TOKEN === '%%TOKEN%%') {
    // No token embedded — redirect to FicTracker to get the bookmarklet
    alert('FicTracker: Get your personal bookmarklet from Settings → Bookmarklet in the FicTracker app.');
    window.open(APP_URL, '_blank');
    return;
  }

  // Add the work
  async function addWork() {
    showToast('Adding to FicTracker...', false);

    const meta = scrape();

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-works`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({
          works: [meta],
          source: 'bookmarklet',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 401) {
          showToast('Session expired — get a new bookmarklet from Settings', true);
        } else {
          showToast('Error: ' + text, true);
        }
        return;
      }

      const data = await res.json();
      if (data.imported > 0) {
        showToast(`✓ Added "${meta.title}" to FicTracker!`, false);
      } else {
        showToast(`"${meta.title}" is already in your library`, false);
      }
    } catch (e) {
      showToast('Network error: ' + e.message, true);
    }
  }

  addWork();
})();
