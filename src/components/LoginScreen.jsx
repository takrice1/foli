import { useState } from 'react';
import { login, signup } from '../auth.js';
import styles from './LoginScreen.module.css';

export default function LoginScreen({ onAuthed }) {
  const [mode, setMode]         = useState('login'); // 'login' | 'signup'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);

  const isSignup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const session = isSignup
        ? await signup(email, password)
        : await login(email, password);
      onAuthed(session);
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
  }

  return (
    <div className={styles.screen}>

      <div className={styles.brand}>
        <span className={styles.logo}>FOLI</span>
        <span className={styles.tag}>First Out · Last In</span>
      </div>

      <p className={styles.pitch}>
        First &amp; last flights at any airport worldwide —<br />
        live data from FlightAware, AirLabs &amp; AviationStack.
      </p>

      <div className={styles.card}>
        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${!isSignup ? styles.modeActive : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Log in
          </button>
          <button
            className={`${styles.modeTab} ${isSignup ? styles.modeActive : ''}`}
            onClick={() => switchMode('signup')}
            type="button"
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit}>
          <label className={styles.label}>Email</label>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={isSignup ? 8 : undefined}
            required
          />

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? '⏳ One moment…' : isSignup ? '✈ Create free account' : '✈ Log in'}
          </button>
        </form>

        {isSignup && (
          <p className={styles.fine}>
            Free accounts include full first &amp; last flight lookups.
            Pro plans with route alerts are coming soon.
          </p>
        )}
      </div>

      <div className={styles.runway} />
    </div>
  );
}
