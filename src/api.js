import { airlineName } from './airlines.js';

const BASE = '/api';

// ── Client-side cache ────────────────────────────────────────────────────────
// Cache API responses in sessionStorage for 60 minutes.  This prevents quota
// exhaustion when the same airport+date is looked up multiple times and makes
// repeat queries feel instant.
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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
  catch { /* storage full — silently skip */ }
}
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        'FlightAware rate limit reached — please wait a minute then try again.',
      );
    }
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ── Day-split query strategy ─────────────────────────────────────────────────
//
// The AeroAPI "departures/arrivals" endpoint anchors results to the current
// time when given a broad date range, so querying 00:00–23:59 only returns
// flights near "now". Two targeted windows capture the true ends of the day:
//
//   Early window  (00:00–09:00 UTC) → /flights/departures|arrivals
//     Forces the API into the historical section of the day, returning the
//     actual first flights from the start of the UTC day.
//
//   Late window   (18:00–23:59 UTC) → /flights/scheduled_departures|arrivals
//     The "scheduled" endpoints return future flight schedules, covering
//     evening flights that haven't happened yet.
//
// Both sets are merged; firstAndLast() then sorts the combined pool and picks
// the chronological extremes — the true first and last flights of the day.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchDepartures(airportCode, dateStr) {
  const key = `foli:dep:${airportCode}:${dateStr}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const [earlyRes, lateRes] = await Promise.all([
    apiFetch(`/airports/${airportCode}/flights/departures?${new URLSearchParams({
      start: `${dateStr}T00:00:00Z`,
      end:   `${dateStr}T09:00:00Z`,
      max_pages: 1,
    })}`),
    apiFetch(`/airports/${airportCode}/flights/scheduled_departures?${new URLSearchParams({
      start: `${dateStr}T18:00:00Z`,
      end:   `${dateStr}T23:59:59Z`,
      max_pages: 3,
    })}`).catch(() => null),
  ]);
  const early = earlyRes?.departures || [];
  const late  = lateRes?.scheduled_departures || lateRes?.departures || [];
  const result = { departures: [...early, ...late] };
  cacheSet(key, result);
  return result;
}

export async function fetchArrivals(airportCode, dateStr) {
  const key = `foli:arr:${airportCode}:${dateStr}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const [earlyRes, lateRes] = await Promise.all([
    apiFetch(`/airports/${airportCode}/flights/arrivals?${new URLSearchParams({
      start: `${dateStr}T00:00:00Z`,
      end:   `${dateStr}T09:00:00Z`,
      max_pages: 1,
    })}`),
    apiFetch(`/airports/${airportCode}/flights/scheduled_arrivals?${new URLSearchParams({
      start: `${dateStr}T18:00:00Z`,
      end:   `${dateStr}T23:59:59Z`,
      max_pages: 3,
    })}`).catch(() => null),
  ]);
  const early = earlyRes?.arrivals || [];
  const late  = lateRes?.scheduled_arrivals || lateRes?.arrivals || [];
  const result = { arrivals: [...early, ...late] };
  cacheSet(key, result);
  return result;
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    // Always display in UTC so "first" always reads earlier than "last" regardless
    // of the user's local timezone.  The "Z" suffix makes the timezone explicit.
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

export function parseFlights(data) {
  return data?.departures || data?.arrivals
      || data?.scheduled_departures || data?.scheduled_arrivals
      || data?.flights || [];
}

export function toCard(f, direction, airportCode) {
  // AeroAPI field precedence (confirmed against live v4 responses):
  //   *_out = gate pushback  (can be from previous UTC day for early-morning flights)
  //   *_off = wheels-off     (always within the queried time window)
  //   *_in  = gate arrival
  //   *_on  = wheels-on      (always within the queried time window)
  //
  // DISPLAY: prefer gate times (more meaningful to passengers)
  const displayDep = f.scheduled_out  || f.estimated_out  || f.actual_out
                   || f.scheduled_off || f.estimated_off  || f.actual_off  || null;
  const displayArr = f.scheduled_in   || f.estimated_in   || f.actual_in
                   || f.scheduled_on  || f.estimated_on   || f.actual_on   || null;
  //
  // SORT KEY: prefer wheels times (bounded to the queried day; avoids cross-midnight
  // gate times pulling early-morning flights into the "previous day" sort position)
  const rawDep = f.scheduled_off || f.actual_off  || f.estimated_off
               || f.scheduled_out || f.actual_out || f.estimated_out || null;
  const rawArr = f.scheduled_on  || f.actual_on   || f.estimated_on
               || f.scheduled_in  || f.actual_in  || f.estimated_in  || null;

  return {
    flightNumber:  f.ident_iata || f.ident || f.flight_number || '—',
    airline:       airlineName(f.operator_iata || f.operator || f.airline || '—'),
    origin:        f.origin?.code_iata      || f.origin?.code      || (direction === 'dep' ? airportCode : '—'),
    destination:   f.destination?.code_iata || f.destination?.code || (direction === 'arr' ? airportCode : '—'),
    departureTime: fmtTime(displayDep),
    arrivalTime:   fmtTime(displayArr),
    duration:      calcDuration(rawDep, rawArr),
    aircraft:      (f.aircraft_type || '').trim(),
    status:        f.status || 'Scheduled',
    rawDep,
    rawArr,
    direction,
  };
}

// sortKey: 'rawDep' for departures (sort by gate-out/wheels-off),
//          'rawArr' for arrivals (sort by gate-in/wheels-on)
// dateStr: optional 'YYYY-MM-DD' — when provided, filters out any flight whose sort
//          key falls on a different date (e.g. off-date flights the AeroAPI occasionally
//          returns at the edges of a narrow query window).
export function firstAndLast(cards, sortKey = 'rawDep', dateStr = null) {
  let valid = cards.filter(c => c[sortKey]);
  if (dateStr) valid = valid.filter(c => c[sortKey].startsWith(dateStr));
  if (!valid.length) return { first: null, last: null, count: 0 };
  const sorted = [...valid].sort((a, b) => new Date(a[sortKey]) - new Date(b[sortKey]));
  return { first: sorted[0], last: sorted[sorted.length - 1], count: sorted.length };
}
