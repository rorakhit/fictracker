// FicTracker Background Service Worker
// Manages auth state and proxies API calls to Supabase.
// We store the session in chrome.storage.local so the content script
// and popup can share auth state without each needing their own
// Supabase client instance.

const SUPABASE_URL = 'https://nivqfnrkpuoyjtugavtj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pdnFmbnJrcHVveWp0dWdhdnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODU0NDAsImV4cCI6MjA4OTQ2MTQ0MH0.gEjhPIGqXqAj_ZU69upkk_rW3-392b0TWNLv-CVC1mU';

// Helper: make authenticated Supabase REST calls
async function supabaseRequest(path, options = {}) {
  const { session } = await chrome.storage.local.get('session');
  if (!session?.access_token) throw new Error('Not logged in');

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    // Try refreshing the token
    const refreshed = await refreshSession();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${refreshed.access_token}`;
      const retry = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return retry.json();
    }
    throw new Error('Session expired — please sign in again');
  }

  return res.json();
}

// Auth: sign in with email + password
async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  await chrome.storage.local.set({
    session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      user: data.user,
    }
  });

  return data.user;
}

// Auth: sign in with magic link (sends email, user clicks link)
async function signInWithOtp(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return { message: 'Check your email for a login link!' };
}

// Auth: refresh token
async function refreshSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session?.refresh_token) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  const data = await res.json();
  if (data.error) return null;

  const newSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    user: data.user,
  };

  await chrome.storage.local.set({ session: newSession });
  return newSession;
}

// Sign out
async function signOut() {
  await chrome.storage.local.remove('session');
}

// Get current session
async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;

  // Auto-refresh if expired or about to expire (within 60s)
  if (session.expires_at && Date.now() > session.expires_at - 60000) {
    const refreshed = await refreshSession();
    return refreshed;
  }

  return session;
}

// Check if a work is already in the user's library
async function checkWork(ao3Id) {
  const { session } = await chrome.storage.local.get('session');
  if (!session?.user?.id) return null;

  const data = await supabaseRequest(
    `works?ao3_id=eq.${ao3Id}&select=id,title,chapter_count,chapter_total,is_complete`
  );

  if (!data || data.length === 0) return null;

  const work = data[0];

  // Check reading status
  const statusData = await supabaseRequest(
    `reading_status?work_id=eq.${work.id}&user_id=eq.${session.user.id}&select=*`
  );

  return {
    work,
    status: statusData?.[0] || null,
  };
}

// Add a work to FicTracker via the import-works Edge Function
async function addWork(workData) {
  const session = await getSession();
  if (!session?.access_token) throw new Error('Not logged in');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/import-works`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify({
      works: [workData],
      source: 'extension',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Import failed (${res.status}): ${text}`);
  }

  return res.json();
}

// Update reading status
async function updateStatus(workId, updates) {
  const { session } = await chrome.storage.local.get('session');
  if (!session?.user?.id) throw new Error('Not logged in');

  // Check if status exists
  const existing = await supabaseRequest(
    `reading_status?work_id=eq.${workId}&user_id=eq.${session.user.id}&select=id`
  );

  if (existing && existing.length > 0) {
    return supabaseRequest(
      `reading_status?work_id=eq.${workId}&user_id=eq.${session.user.id}`, {
        method: 'PATCH',
        body: { ...updates, updated_at: new Date().toISOString() },
      }
    );
  } else {
    return supabaseRequest('reading_status', {
      method: 'POST',
      body: {
        work_id: workId,
        user_id: session.user.id,
        ...updates,
      },
    });
  }
}

// Message handler — all communication from popup and content script
// goes through here. This keeps auth logic centralized.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = async () => {
    try {
      switch (msg.type) {
        case 'SIGN_IN':
          return { user: await signIn(msg.email, msg.password) };
        case 'SIGN_IN_OTP':
          return await signInWithOtp(msg.email);
        case 'SIGN_OUT':
          await signOut();
          return { success: true };
        case 'GET_SESSION':
          return { session: await getSession() };
        case 'CHECK_WORK':
          return { result: await checkWork(msg.ao3Id) };
        case 'ADD_WORK':
          return { result: await addWork(msg.workData) };
        case 'UPDATE_STATUS':
          return { result: await updateStatus(msg.workId, msg.updates) };
        default:
          return { error: 'Unknown message type' };
      }
    } catch (e) {
      return { error: e.message };
    }
  };

  handler().then(sendResponse);
  return true; // Keep channel open for async response
});
