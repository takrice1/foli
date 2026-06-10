// ── Auth client (paywall) ─────────────────────────────────────────────────────
// Session token (30-day JWT from the worker) lives in localStorage so the
// login survives reloads and PWA relaunches.

const TOKEN_KEY = 'foli:token';
const EMAIL_KEY = 'foli:email';
const PLAN_KEY  = 'foli:plan';

const BASE = '/api';

export function getToken()   { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
export function getEmail()   { try { return localStorage.getItem(EMAIL_KEY); } catch { return null; } }
export function getPlan()    { try { return localStorage.getItem(PLAN_KEY) || 'free'; } catch { return 'free'; } }
export function isLoggedIn() { return !!getToken(); }

function storeSession({ token, email, plan }) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(PLAN_KEY,  plan || 'free');
  } catch { /* private mode — session lasts until reload */ }
}

export function logout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PLAN_KEY);
  } catch { /* ignore */ }
}

async function authPost(path, body) {
  const res  = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function signup(email, password) {
  const session = await authPost('/auth/signup', { email, password });
  storeSession(session);
  return session;
}

export async function login(email, password) {
  const session = await authPost('/auth/login', { email, password });
  storeSession(session);
  return session;
}
