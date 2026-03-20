import { useState } from 'react';
import { supabase } from '../supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailAuth(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setError('Check your email to confirm your account!');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (e) {
      setError(e.message || 'Authentication failed');
    }
    setLoading(false);
  }

  async function handleOAuth(provider) {
    setError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
      if (error) throw error;
    } catch (e) {
      setError(e.message || `${provider} sign-in failed`);
    }
  }

  return (
    <div className="app">
      <div className="login-page">
        <div className="login-card">
          <h2>📖 FicTracker</h2>
          <div className="subtitle">{isSignUp ? 'Create an account' : 'Sign in to your library'}</div>
          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleEmailAuth}>
            <input
              className="login-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              className="login-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              className="btn btn-accent"
              style={{ width: '100%', marginBottom: 12 }}
              disabled={loading}
            >
              {loading ? 'Loading...' : (isSignUp ? 'Sign Up' : 'Sign In')}
            </button>
          </form>

          <div className="login-divider">or continue with</div>

          <button className="oauth-btn" onClick={() => handleOAuth('google')} disabled={loading}>
            🔵 Google
          </button>
          <button className="oauth-btn" onClick={() => handleOAuth('discord')} disabled={loading}>
            🟣 Discord
          </button>

          <div className="login-toggle">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <a onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
