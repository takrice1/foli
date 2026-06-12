import { useState } from 'react';
import { login, signup, forgotPassword, resetPassword } from '../auth.js';
import styles from './LoginScreen.module.css';

// A reset link from the email lands on flyfoli.com/?reset=<token>
function resetTokenFromUrl() {
  try { return new URLSearchParams(window.location.search).get('reset') || null; }
  catch { return null; }
}

function clearResetParam() {
  try { window.history.replaceState({}, '', window.location.pathname); }
  catch { /* ignore */ }
}

export default function LoginScreen({ onAuthed }) {
  const [resetToken]            = useState(resetTokenFromUrl);
  const [mode, setMode]         = useState(resetToken ? 'reset' : 'login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [notice, setNotice]     = useState(null);

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';
  const isReset  = mode === 'reset';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (isForgot) {
        const res = await forgotPassword(email);
        setNotice(res.message || 'If an account exists for that email, a reset link is on its way.');
      } else if (isReset) {
        await resetPassword(resetToken, password);
        clearResetParam();
        onAuthed();
      } else {
        const session = isSignup
          ? await signup(email, password)
          : await login(email, password);
        onAuthed(session);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next) {
    setMode(next);
    setError(null);
    setNotice(null);
    if (next !== 'reset') clearResetParam();
  }

  const submitLabel =
    busy     ? '⏳ One moment…'
    : isForgot ? '✉ Send reset link'
    : isReset  ? '✈ Set new password'
    : isSignup ? '✈ Create free account'
    :            '✈ Log in';

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

        {(isForgot || isReset) ? (
          <div className={styles.subhead}>
            {isForgot ? 'Reset your password' : 'Choose a new password'}
          </div>
        ) : (
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
        )}

        <form onSubmit={submit}>
          {!isReset && (
            <>
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
            </>
          )}

          {!isForgot && (
            <>
              <label className={styles.label}>{isReset ? 'New password' : 'Password'}</label>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={(isSignup || isReset) ? 'At least 8 characters' : '••••••••'}
                autoComplete={(isSignup || isReset) ? 'new-password' : 'current-password'}
                minLength={(isSignup || isReset) ? 8 : undefined}
                required
              />
            </>
          )}

          {error  && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          <button className={styles.submit} type="submit" disabled={busy}>
            {submitLabel}
          </button>
        </form>

        {mode === 'login' && (
          <button className={styles.linkBtn} type="button" onClick={() => switchMode('forgot')}>
            Forgot password?
          </button>
        )}

        {(isForgot || isReset) && (
          <button className={styles.linkBtn} type="button" onClick={() => switchMode('login')}>
            ← Back to log in
          </button>
        )}

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
