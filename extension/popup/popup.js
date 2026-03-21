// FicTracker Popup
// Shows login form when signed out, quick stats when signed in.

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnFmbnJrcHVveWp0dWdhdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NDAsImV4cCI6MjA4OTQ2MTQ0MH0.gEjhPIGqXqAj_ZU69upkk_rW3-392b0TWNLv-CVC1mU';

const $ = (sel) => document.querySelector(sel);

function showMsg(text, type = 'error') {
  const el = $('#login-msg');
  el.textContent = text;
  el.className = `msg msg-${type}`;
  el.style.display = 'block';
}

function showView(view) {
  $('#loading').style.display = 'none';
  $('#login-view').style.display = view === 'login' ? 'block' : 'none';
  $('#user-view').style.display = view === 'user' ? 'block' : 'none';
}

async function loadStats(session) {
  try {
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    };

    const [statusRes, wipRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/reading_status?user_id=eq.${session.user.id}&select=status`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/wip_tracking?user_id=eq.${session.user.id}&select=id`, { headers }),
    ]);

    const statuses = await statusRes.json();
    const wips = await wipRes.json();

    const total = Array.isArray(statuses) ? statuses.length : 0;
    const reading = Array.isArray(statuses) ? statuses.filter(s => s.status === 'reading').length : 0;
    const wipCount = Array.isArray(wips) ? wips.length : 0;

    $('#stat-total').textContent = total;
    $('#stat-reading').textContent = reading;
    $('#stat-wips').textContent = wipCount;
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}

// Initialize
async function init() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
  const session = response?.session;

  if (session?.user) {
    $('#user-email-text').textContent = session.user.email;
    showView('user');
    loadStats(session);
  } else {
    showView('login');
  }
}

// Sign in with password
$('#sign-in-btn').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  const password = $('#password').value;

  if (!email || !password) {
    showMsg('Please enter email and password');
    return;
  }

  $('#sign-in-btn').disabled = true;
  $('#sign-in-btn').textContent = 'Signing in...';

  const response = await chrome.runtime.sendMessage({
    type: 'SIGN_IN',
    email,
    password,
  });

  if (response.error) {
    showMsg(response.error);
    $('#sign-in-btn').disabled = false;
    $('#sign-in-btn').textContent = 'Sign In';
  } else {
    init(); // Reload to show user view
  }
});

// Magic link
$('#magic-link-btn').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) {
    showMsg('Please enter your email first');
    return;
  }

  $('#magic-link-btn').disabled = true;
  const response = await chrome.runtime.sendMessage({
    type: 'SIGN_IN_OTP',
    email,
  });

  if (response.error) {
    showMsg(response.error);
  } else {
    showMsg('Check your email for a login link!', 'success');
  }
  $('#magic-link-btn').disabled = false;
});

// Sign out
$('#sign-out-btn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  showView('login');
});

// Enter key on password field
$('#password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#sign-in-btn').click();
});

init();
