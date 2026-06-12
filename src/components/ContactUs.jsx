import { useState } from 'react';
import { getEmail } from '../auth.js';
import styles from './ContactUs.module.css';

async function sendContact({ name, email, message }) {
  const res = await fetch('/api/contact', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify({ name, email, message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function ContactUs() {
  const [open, setOpen]       = useState(false);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState(getEmail() || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [notice, setNotice]   = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await sendContact({ name, email, message });
      setNotice(res.message || 'Thanks — your message has been sent.');
      setMessage('');
    } catch (err) {
      setError(err.message || 'Could not send your message — please try again.');
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    setOpen(o => !o);
    setError(null);
    setNotice(null);
  }

  return (
    <div className={styles.wrap}>
      <button className={styles.link} type="button" onClick={toggle}>
        {open ? '✕ Close' : '✉ Contact Us'}
      </button>

      {open && (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.heading}>
            Contact us — we reply from CustomerService@flyfoli.com
          </div>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={100}
          />
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Your email"
            autoComplete="email"
            required
          />
          <textarea
            className={styles.textarea}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="How can we help?"
            rows={4}
            maxLength={5000}
            required
          />
          {error  && <p className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}
          <button className={styles.send} type="submit" disabled={busy}>
            {busy ? '⏳ Sending…' : '✈ Send message'}
          </button>
        </form>
      )}
    </div>
  );
}
