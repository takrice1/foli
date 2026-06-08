const BASE = '/api';

async function apiFetch(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API ${res.status}: ${txt.slice(0, 400)}`);
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
  return { departures: [...early, ...late] };
}

export async function fetchArrivals(airportCode, dateStr) {
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
  return { arrivals: [...early, ...late] };
}

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
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
  //   *_out = gate pushback  (null for many cargo/regional flights)
  //   *_off = wheels-off     (always present when a time is known)
  //   *_in  = gate arrival   (null for many flights)
  //   *_on  = wheels-on      (always present when a time is known)
  const depISO = f.scheduled_out || f.scheduled_off
               || f.estimated_out || f.estimated_off
               || f.actual_out   || f.actual_off
               || null;
  const arrISO = f.scheduled_in  || f.scheduled_on
               || f.estimated_in  || f.estimated_on
               || f.actual_in    || f.actual_on
               || null;

  return {
    flightNumber:  f.ident_iata || f.ident || f.flight_number || '—',
    airline:       f.operator_iata || f.operator || f.airline || '—',
    origin:        f.origin?.code_iata      || f.origin?.code      || (direction === 'dep' ? airportCode : '—'),
    destination:   f.destination?.code_iata || f.destination?.code || (direction === 'arr' ? airportCode : '—'),
    departureTime: fmtTime(depISO),
    arrivalTime:   fmtTime(arrISO),
    duration:      calcDuration(depISO, arrISO),
    aircraft:      (f.aircraft_type || '').trim(),
    status:        f.status || 'Scheduled',
    rawDep:        depISO,
    rawArr:        arrISO,
    direction,
  };
}

// sortKey: 'rawDep' for departures (sort by gate-out/wheels-off),
//          'rawArr' for arrivals (sort by gate-in/wheels-on)
export function firstAndLast(cards, sortKey = 'rawDep') {
  const valid = cards.filter(c => c[sortKey]);
  if (!valid.length) return { first: null, last: null, count: 0 };
  const sorted = [...valid].sort((a, b) => new Date(a[sortKey]) - new Date(b[sortKey]));
  return { first: sorted[0], last: sorted[sorted.length - 1], count: sorted.length };
}
