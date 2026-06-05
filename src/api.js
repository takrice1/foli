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

export async function fetchDepartures(airportCode, dateStr) {
  const start = `${dateStr}T00:00:00Z`;
  const end   = `${dateStr}T23:59:59Z`;
  return apiFetch(`/airports/${airportCode}/flights/departures?${new URLSearchParams({ start, end, max_pages: 1 })}`);
}

export async function fetchArrivals(airportCode, dateStr) {
  const start = `${dateStr}T00:00:00Z`;
  const end   = `${dateStr}T23:59:59Z`;
  return apiFetch(`/airports/${airportCode}/flights/arrivals?${new URLSearchParams({ start, end, max_pages: 1 })}`);
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
  return data?.departures || data?.arrivals || data?.scheduled_departures || data?.scheduled_arrivals || data?.flights || [];
}

export function toCard(f, direction, airportCode) {
  // AeroAPI field precedence (confirmed against live v4 responses):
  //   *_out = gate pushback  (null for many cargo/regional flights)
  //   *_off = wheels-off     (always present when a time is known)
  //   *_in  = gate arrival   (null for many flights)
  //   *_on  = wheels-on      (always present when a time is known)
  // Use gate times first for accuracy; fall back to block times.
  const depISO = f.scheduled_out || f.scheduled_off
               || f.estimated_out || f.estimated_off
               || f.actual_out   || f.actual_off
               || null;
  const arrISO = f.scheduled_in  || f.scheduled_on
               || f.estimated_in  || f.estimated_on
               || f.actual_in    || f.actual_on
               || null;

  return {
    // Prefer IATA flight number ("DL123") over ICAO callsign ("DAL123")
    flightNumber:  f.ident_iata || f.ident || f.flight_number || '—',
    // Prefer IATA carrier code ("DL") over ICAO ("DAL")
    airline:       f.operator_iata || f.operator || f.airline || '—',
    origin:        f.origin?.code_iata      || f.origin?.code      || (direction === 'dep' ? airportCode : '—'),
    destination:   f.destination?.code_iata || f.destination?.code || (direction === 'arr' ? airportCode : '—'),
    departureTime: fmtTime(depISO),
    arrivalTime:   fmtTime(arrISO),
    duration:      calcDuration(depISO, arrISO),
    aircraft:      (f.aircraft_type || '').trim(),  // API returns "B763 " with trailing space
    status:        f.status || 'Scheduled',
    rawDep:        depISO,
    direction,
  };
}

export function firstAndLast(cards) {
  const valid = cards.filter(c => c.rawDep);
  if (!valid.length) return { first: null, last: null, count: 0 };
  const sorted = [...valid].sort((a, b) => new Date(a.rawDep) - new Date(b.rawDep));
  return { first: sorted[0], last: sorted[sorted.length - 1], count: sorted.length };
}
