import { airlineName } from './airlines.js';

const BASE = '/api';

// ── Client-side cache (sessionStorage, 60-min TTL) ───────────────────────────
// Protects the FlightAware monthly quota; makes repeat lookups instant.

const CACHE_TTL = 60 * 60 * 1000;

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); }
  catch { /* storage full — skip */ }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('FlightAware rate limit reached — please wait a minute then try again.');
    }
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ── Airport search (live, via worker provider waterfall) ──────────────────────

export async function searchAirports(query) {
  if (!query || query.trim().length < 2) return { airports: [], source: '' };
  try {
    const data = await apiFetch(`/airports?${new URLSearchParams({ query: query.trim() })}`);
    return { airports: data?.airports || [], source: data?.source || '' };
  } catch {
    return { airports: [], source: '' };
  }
}

// ── Flight data (single request; worker handles split-day + provider fallback) ─

export async function fetchDepartures(airportCode, dateStr) {
  const key = `foli:dep:${airportCode}:${dateStr}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const result = await apiFetch(`/airports/${airportCode}/flights/departures?${new URLSearchParams({
    start: `${dateStr}T00:00:00Z`,
    end:   `${dateStr}T23:59:59Z`,
  })}`);
  cacheSet(key, result);
  return result;
}

export async function fetchArrivals(airportCode, dateStr) {
  const key = `foli:arr:${airportCode}:${dateStr}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const result = await apiFetch(`/airports/${airportCode}/flights/arrivals?${new URLSearchParams({
    start: `${dateStr}T00:00:00Z`,
    end:   `${dateStr}T23:59:59Z`,
  })}`);
  cacheSet(key, result);
  return result;
}

// ── Response parsing ──────────────────────────────────────────────────────────
// The worker normalizes all providers to:
//   { ident, airline, origin, destination,
//     scheduledDep, scheduledArr,   ← gate times (display)
//     wheelsDep, wheelsArr,         ← wheels times (sort; always in queried window)
//     aircraft, status }

export function parseFlights(data) {
  return data?.departures || data?.arrivals || [];
}

export function getSource(data) {
  return data?._source || '';
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
    }) + 'Z';
  } catch { return '—'; }
}

function calcDuration(dep, arr) {
  if (!dep || !arr) return '';
  const secs = (new Date(arr) - new Date(dep)) / 1000;
  const s = secs > 0 ? secs : secs + 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function toCard(f, direction, airportCode) {
  // wheelsDep/wheelsArr are wheels-off/on times (always bounded to queried window).
  // Use them as sort keys to avoid cross-midnight gate-time reversals.
  // Fall back to scheduledDep/Arr (from AirLabs / AviationStack which don't
  // distinguish gate vs wheels).
  const rawDep = f.wheelsDep   || f.scheduledDep || null;
  const rawArr = f.wheelsArr   || f.scheduledArr || null;

  return {
    flightNumber:  f.ident        || '—',
    airline:       airlineName(f.airline || '—'),
    origin:        f.origin       || (direction === 'dep' ? airportCode : '—'),
    destination:   f.destination  || (direction === 'arr' ? airportCode : '—'),
    departureTime: fmtTime(f.scheduledDep),
    arrivalTime:   fmtTime(f.scheduledArr),
    duration:      calcDuration(rawDep, rawArr),
    aircraft:      f.aircraft     || '',
    status:        f.status       || 'Scheduled',
    rawDep,
    rawArr,
    direction,
  };
}

// sortKey: 'rawDep' for departures, 'rawArr' for arrivals.
// dateStr: optional 'YYYY-MM-DD' — filters out any card whose sort key falls
//          on a different date (edge-case AeroAPI leakage).
export function firstAndLast(cards, sortKey = 'rawDep', dateStr = null) {
  let valid = cards.filter(c => c[sortKey]);
  if (dateStr) valid = valid.filter(c => c[sortKey].startsWith(dateStr));
  if (!valid.length) return { first: null, last: null, count: 0 };
  const sorted = [...valid].sort((a, b) => new Date(a[sortKey]) - new Date(b[sortKey]));
  return { first: sorted[0], last: sorted[sorted.length - 1], count: sorted.length };
}
