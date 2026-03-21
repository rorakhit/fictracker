// FicTracker Content Script
// Injected on archiveofourown.org/works/* pages.
// Scrapes work metadata from the DOM and adds a floating FicTracker
// panel so users can add/track fics without leaving AO3.

(function () {
  'use strict';

  // Only run on individual work pages (not /works/search, /works?tag=...)
  const workMatch = window.location.pathname.match(/^\/works\/(\d+)/);
  if (!workMatch) return;

  const ao3Id = parseInt(workMatch[1]);
  let currentWorkData = null;
  let currentStatus = null;

  // ---- DOM Scraping ----
  // AO3's HTML is well-structured with semantic classes, so we can
  // reliably extract metadata without an API.

  function scrapeWorkMetadata() {
    const meta = {};
    meta.ao3_id = ao3Id;

    // Title
    const titleEl = document.querySelector('.title.heading');
    meta.title = titleEl?.textContent?.trim() || 'Untitled';

    // Authors
    const authorEls = document.querySelectorAll('[rel="author"]');
    meta.authors = Array.from(authorEls).map(a => a.textContent.trim());

    // Rating
    const ratingEl = document.querySelector('dd.rating.tags a.tag');
    meta.rating = ratingEl?.textContent?.trim() || null;

    // Warnings
    const warningEls = document.querySelectorAll('dd.warning.tags a.tag');
    meta.warnings = Array.from(warningEls).map(a => a.textContent.trim());

    // Categories
    const catEls = document.querySelectorAll('dd.category.tags a.tag');
    meta.categories = Array.from(catEls).map(a => a.textContent.trim());

    // Fandoms
    const fandomEls = document.querySelectorAll('dd.fandom.tags a.tag');
    meta.fandoms = Array.from(fandomEls).map(a => a.textContent.trim());

    // Relationships
    const relEls = document.querySelectorAll('dd.relationship.tags a.tag');
    meta.relationships = Array.from(relEls).map(a => a.textContent.trim());

    // Characters
    const charEls = document.querySelectorAll('dd.character.tags a.tag');
    meta.characters = Array.from(charEls).map(a => a.textContent.trim());

    // Freeform tags
    const tagEls = document.querySelectorAll('dd.freeform.tags a.tag');
    meta.freeform_tags = Array.from(tagEls).map(a => a.textContent.trim());

    // Language
    const langEl = document.querySelector('dd.language');
    meta.language = langEl?.textContent?.trim() || 'English';

    // Word count
    const wcEl = document.querySelector('dd.words');
    meta.word_count = wcEl ? parseInt(wcEl.textContent.replace(/,/g, '')) : null;

    // Chapters
    const chapEl = document.querySelector('dd.chapters');
    if (chapEl) {
      const chapText = chapEl.textContent.trim();
      const chapMatch = chapText.match(/(\d+)\s*\/\s*(\d+|\?)/);
      if (chapMatch) {
        meta.chapter_count = parseInt(chapMatch[1]);
        meta.chapter_total = chapMatch[2] === '?' ? null : parseInt(chapMatch[2]);
        meta.is_complete = meta.chapter_total !== null && meta.chapter_count >= meta.chapter_total;
      }
    }

    // Stats
    const kudosEl = document.querySelector('dd.kudos');
    meta.kudos = kudosEl ? parseInt(kudosEl.textContent.replace(/,/g, '')) : null;

    const hitsEl = document.querySelector('dd.hits');
    meta.hits = hitsEl ? parseInt(hitsEl.textContent.replace(/,/g, '')) : null;

    const bmEl = document.querySelector('dd.bookmarks');
    meta.bookmarks_count = bmEl ? parseInt(bmEl.textContent.replace(/,/g, '')) : null;

    const commEl = document.querySelector('dd.comments');
    meta.comments_count = commEl ? parseInt(commEl.textContent.replace(/,/g, '')) : null;

    // Dates
    const pubEl = document.querySelector('dd.published');
    meta.date_published = pubEl?.textContent?.trim() || null;

    const updEl = document.querySelector('dd.status');
    meta.date_updated = updEl?.textContent?.trim() || null;

    // Summary
    const summaryEl = document.querySelector('.summary .userstuff');
    meta.summary = summaryEl?.textContent?.trim()?.substring(0, 2000) || null;

    return meta;
  }

  // ---- UI ----

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'fictracker-panel';
    panel.innerHTML = `
      <div class="ft-header">
        <span class="ft-logo"><span class="ft-fic">Fic</span><span class="ft-tracker">Tracker</span></span>
        <button class="ft-close" title="Close">&times;</button>
      </div>
      <div class="ft-body" id="ft-body">
        <div class="ft-loading">Checking library...</div>
      </div>
    `;
    document.body.appendChild(panel);

    // Close button
    panel.querySelector('.ft-close').addEventListener('click', () => {
      panel.classList.add('ft-collapsed');
      showFloatingButton();
    });

    return panel;
  }

  function showFloatingButton() {
    let btn = document.getElementById('fictracker-fab');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'fictracker-fab';
      btn.textContent = '📚';
      btn.title = 'Open FicTracker';
      btn.addEventListener('click', () => {
        btn.style.display = 'none';
        const panel = document.getElementById('fictracker-panel');
        panel.classList.remove('ft-collapsed');
      });
      document.body.appendChild(btn);
    }
    btn.style.display = 'flex';
  }

  function renderNotLoggedIn() {
    const body = document.getElementById('ft-body');
    body.innerHTML = `
      <div class="ft-message">Sign in to track this fic.</div>
      <div class="ft-login-form">
        <input type="email" id="ft-email" placeholder="Email" class="ft-input">
        <input type="password" id="ft-password" placeholder="Password" class="ft-input">
        <button class="ft-btn ft-btn-accent" id="ft-sign-in">Sign In</button>
        <button class="ft-btn ft-btn-ghost" id="ft-magic-link" style="margin-top:4px">Send Magic Link</button>
        <div id="ft-login-msg" style="display:none"></div>
      </div>
    `;

    body.querySelector('#ft-sign-in').addEventListener('click', async () => {
      const email = body.querySelector('#ft-email').value.trim();
      const password = body.querySelector('#ft-password').value;
      if (!email || !password) return showLoginMsg('Enter email and password', 'error');

      const btn = body.querySelector('#ft-sign-in');
      btn.disabled = true;
      btn.textContent = 'Signing in...';

      const res = await chrome.runtime.sendMessage({ type: 'SIGN_IN', email, password });
      if (res.error) {
        showLoginMsg(res.error, 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      } else {
        init(); // Reload panel with logged-in state
      }
    });

    body.querySelector('#ft-magic-link').addEventListener('click', async () => {
      const email = body.querySelector('#ft-email').value.trim();
      if (!email) return showLoginMsg('Enter your email first', 'error');
      const res = await chrome.runtime.sendMessage({ type: 'SIGN_IN_OTP', email });
      showLoginMsg(res.error || 'Check your email for a login link!', res.error ? 'error' : 'success');
    });

    body.querySelector('#ft-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') body.querySelector('#ft-sign-in').click();
    });
  }

  function showLoginMsg(text, type) {
    const el = document.getElementById('ft-login-msg');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    el.style.fontSize = '11px';
    el.style.marginTop = '6px';
    el.style.padding = '6px 8px';
    el.style.borderRadius = '6px';
    el.style.background = type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)';
    el.style.color = type === 'error' ? '#ef4444' : '#14b8a6';
  }

  function renderNewWork(meta) {
    const body = document.getElementById('ft-body');
    body.innerHTML = `
      <div class="ft-message">This fic isn't in your library yet.</div>
      <div class="ft-work-preview">
        <div class="ft-work-title">${escapeHtml(meta.title)}</div>
        <div class="ft-work-meta">${meta.word_count ? formatNumber(meta.word_count) + ' words' : ''} · ${meta.chapter_count || '?'}/${meta.chapter_total || '?'} ch</div>
      </div>
      <div class="ft-status-picker">
        <label>Add as:</label>
        <select id="ft-add-status">
          <option value="to_read">To Read</option>
          <option value="reading">Reading</option>
          <option value="completed">Completed</option>
        </select>
      </div>
      <button class="ft-btn ft-btn-accent" id="ft-add-btn">Add to Library</button>
    `;

    body.querySelector('#ft-add-btn').addEventListener('click', async () => {
      const status = body.querySelector('#ft-add-status').value;
      const btn = body.querySelector('#ft-add-btn');
      btn.disabled = true;
      btn.textContent = 'Adding...';

      const response = await chrome.runtime.sendMessage({
        type: 'ADD_WORK',
        workData: { ...meta, source: 'extension' },
      });

      if (response.error) {
        console.error('FicTracker add error:', response.error);
        btn.textContent = 'Error — try again';
        btn.disabled = false;
        showLoginMsg(response.error, 'error');
        return;
      }

      // Now set the status
      const checkResponse = await chrome.runtime.sendMessage({
        type: 'CHECK_WORK',
        ao3Id: meta.ao3_id,
      });

      if (checkResponse.result?.work) {
        const updates = { status };
        if (status === 'reading') updates.started_at = new Date().toISOString();
        if (status === 'completed') updates.completed_at = new Date().toISOString();

        await chrome.runtime.sendMessage({
          type: 'UPDATE_STATUS',
          workId: checkResponse.result.work.id,
          updates,
        });

        currentWorkData = checkResponse.result;
        currentStatus = { ...checkResponse.result.status, ...updates };
        renderExistingWork(checkResponse.result.work, { ...checkResponse.result.status, ...updates });
      }
    });
  }

  function renderExistingWork(work, status) {
    const body = document.getElementById('ft-body');
    const st = status?.status || 'to_read';
    const statusLabels = {
      to_read: 'To Read',
      reading: 'Reading',
      completed: 'Completed',
      on_hold: 'On Hold',
      dropped: 'Dropped',
    };
    const statusColors = {
      to_read: '#3b82f6',
      reading: '#f59e0b',
      completed: '#22c55e',
      on_hold: '#8b5cf6',
      dropped: '#ef4444',
    };

    const chapTotal = work.chapter_total || work.chapter_count || '?';
    const currentCh = status?.current_chapter || 0;
    const progress = chapTotal !== '?' ? Math.round((currentCh / chapTotal) * 100) : 0;

    body.innerHTML = `
      <div class="ft-in-library">
        <span class="ft-badge" style="background:${statusColors[st]}">${statusLabels[st]}</span>
        <span class="ft-check">In your library</span>
      </div>
      ${st === 'reading' ? `
        <div class="ft-progress-section">
          <div class="ft-progress-label">Chapter ${currentCh} of ${chapTotal}</div>
          <div class="ft-progress-bar"><div class="ft-progress-fill" style="width:${progress}%"></div></div>
          <div class="ft-chapter-controls">
            <button class="ft-btn ft-btn-sm ft-btn-ghost" id="ft-ch-minus" ${currentCh <= 0 ? 'disabled' : ''}>−</button>
            <span class="ft-chapter-num">${currentCh}</span>
            <button class="ft-btn ft-btn-sm ft-btn-ghost" id="ft-ch-plus" ${chapTotal !== '?' && currentCh >= chapTotal ? 'disabled' : ''}>+</button>
          </div>
        </div>
      ` : ''}
      <div class="ft-status-update">
        <select id="ft-status-select">
          ${Object.entries(statusLabels).map(([k, v]) =>
            `<option value="${k}" ${k === st ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
      <a class="ft-open-app" href="https://fictracker.vercel.app" target="_blank">Open FicTracker →</a>
    `;

    // Chapter controls
    const minusBtn = body.querySelector('#ft-ch-minus');
    const plusBtn = body.querySelector('#ft-ch-plus');

    if (minusBtn) {
      minusBtn.addEventListener('click', () => updateChapter(work.id, currentCh - 1, chapTotal));
    }
    if (plusBtn) {
      plusBtn.addEventListener('click', () => updateChapter(work.id, currentCh + 1, chapTotal));
    }

    // Status select
    body.querySelector('#ft-status-select').addEventListener('change', async (e) => {
      const newStatus = e.target.value;
      const updates = { status: newStatus };
      if (newStatus === 'reading' && !status?.started_at) updates.started_at = new Date().toISOString();
      if (newStatus === 'completed') updates.completed_at = new Date().toISOString();

      await chrome.runtime.sendMessage({
        type: 'UPDATE_STATUS',
        workId: work.id,
        updates,
      });

      // Re-render with new status
      renderExistingWork(work, { ...status, ...updates });
    });
  }

  async function updateChapter(workId, newChapter, total) {
    if (newChapter < 0) return;

    const updates = { current_chapter: newChapter };

    // Auto-complete if reached the end
    if (total !== '?' && newChapter >= total) {
      updates.status = 'completed';
      updates.completed_at = new Date().toISOString();
    }

    await chrome.runtime.sendMessage({
      type: 'UPDATE_STATUS',
      workId,
      updates,
    });

    // Re-check and re-render
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_WORK',
      ao3Id,
    });

    if (response.result) {
      renderExistingWork(response.result.work, { ...response.result.status, ...updates });
    }
  }

  // ---- Helpers ----

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  }

  // ---- Init ----

  async function init() {
    const meta = scrapeWorkMetadata();

    // Remove existing panel if re-initializing (e.g. after login)
    const existingPanel = document.getElementById('fictracker-panel');
    if (existingPanel) existingPanel.remove();

    const panel = createPanel();

    // Check if user is logged in
    const sessionResponse = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    if (!sessionResponse?.session?.user) {
      renderNotLoggedIn();
      return;
    }

    // Check if work is in library
    const checkResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_WORK',
      ao3Id: meta.ao3_id,
    });

    if (checkResponse.result?.work) {
      renderExistingWork(checkResponse.result.work, checkResponse.result.status);
    } else {
      renderNewWork(meta);
    }
  }

  init();
})();
