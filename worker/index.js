/**
 * FOLI — First Out, Last In
 * Cloudflare Worker: Multi-provider flight data proxy
 *
 * Provider waterfall (in order):
 *   1. FlightAware AeroAPI  — best coverage, paid Personal plan
 *      Uses a split-day strategy (early + late windows) to capture the true
 *      first and last flights of the UTC day.
 *   2. AirLabs              — 1,000 free calls/month (airlabs.co)
 *   3. AviationStack        — 500 free calls/month (aviationstack.com)
 *
 * Each provider is tried in order. If one fails or returns 0 flights the next
 * is tried automatically. The response always includes _source so the UI can
 * show which provider answered.
 *
 * Secrets (set via `npx wrangler secret put <NAME>` inside worker/):
 *   FA_API_KEY        — FlightAware AeroAPI key
 *   AIRLABS_KEY       — AirLabs key
 *   AVIATIONSTACK_KEY — AviationStack key
 *
 * Deploy:
 *   cd worker && npx wrangler deploy
 */

// ── CORS ──────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://flyfoli.com',
  'https://www.flyfoli.com',
  'https://first-and-last-flights.vercel.app',
  'https://foli.vercel.app',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age':       '86400',
  };
}

function jsonResponse(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── In-memory cache (warm within a Cloudflare isolate) ────────────────────────

const CACHE     = new Map();
const CACHE_TTL = {
  airports: 60 * 60 * 1000,  // 1 hour  — airport metadata rarely changes
  flights:   5 * 60 * 1000,  // 5 mins  — flight data is time-sensitive
};

function cacheGet(key) {
  const e = CACHE.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > e.ttl) { CACHE.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data, ttl) {
  CACHE.set(key, { data, ts: Date.now(), ttl });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonEmpty(arr) { return Array.isArray(arr) && arr.length > 0; }

// ── Provider 1: FlightAware ───────────────────────────────────────────────────
//
// Split-day strategy: the /departures|arrivals endpoint anchors results to the
// current time when given a broad window, returning only ~15 flights near "now".
// Querying two narrow windows forces historical + scheduled data across the day:
//   Early (00:00–09:00 UTC) → /flights/departures|arrivals
//   Late  (18:00–23:59 UTC) → /flights/scheduled_departures|arrivals
// Combined pool spans ~19 hours and captures true first and last flights.

const FA_BASE = 'https://aeroapi.flightaware.com/aeroapi';

async function flightaware_flights(airportCode, dateStr, direction, apiKey) {
  const ep    = direction === 'dep' ? 'departures'           : 'arrivals';
  const schEp = direction === 'dep' ? 'scheduled_departures' : 'scheduled_arrivals';
  const resKey = ep;
  const schKey = direction === 'dep' ? 'scheduled_departures' : 'scheduled_arrivals';

  const headers = { 'x-apikey': apiKey, 'Accept': 'application/json' };

  // Future dates have no historical data — use the scheduled endpoint for both windows
  const todayUTC = new Date().toISOString().slice(0, 10);
  const isFuture = dateStr > todayUTC;
  const earlyEp  = isFuture ? schEp : ep;
  const earlyKey = isFuture ? schKey : resKey;

  const [earlyRes, lateRes] = await Promise.all([
    fetch(
      `${FA_BASE}/airports/${airportCode}/flights/${earlyEp}` +
      `?start=${dateStr}T00:00:00Z&end=${dateStr}T09:00:00Z&max_pages=1`,
      { headers },
    ).then(r => r.ok ? r.json() : null).catch(() => null),

    fetch(
      `${FA_BASE}/airports/${airportCode}/flights/${schEp}` +
      `?start=${dateStr}T18:00:00Z&end=${dateStr}T23:59:59Z&max_pages=3`,
      { headers },
    ).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const early = earlyRes?.[earlyKey] || earlyRes?.[resKey] || earlyRes?.flights || [];
  const late  = lateRes?.[schKey]    || lateRes?.[resKey]  || lateRes?.flights  || [];
  return normalizeFA([...early, ...late], direction, airportCode);
}

async function flightaware_airports(query, apiKey) {
  const url = `${FA_BASE}/airports?query=${encodeURIComponent(query)}&max_pages=1`;
  const res = await fetch(url, { headers: { 'x-apikey': apiKey, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`FA airports ${res.status}`);
  const data = await res.json();
  return (data?.airports || []).map(normalizeFA_Airport);
}

function normalizeFA(flights, direction, airportCode) {
  return flights.map(f => ({
    ident:        f.ident_iata  || f.ident || f.flight_number || '',
    airline:      f.operator_iata || f.operator || '',
    origin:       f.origin?.code_iata      || f.origin?.code      || (direction === 'dep' ? airportCode : ''),
    destination:  f.destination?.code_iata || f.destination?.code || (direction === 'arr' ? airportCode : ''),
    // Gate times — displayed to passengers (can be from previous UTC day for
    // early-morning flights that push back just before midnight UTC)
    scheduledDep: f.scheduled_out || f.estimated_out || f.actual_out || null,
    scheduledArr: f.scheduled_in  || f.estimated_in  || f.actual_in  || null,
    // Wheels times — used as sort key (always bounded to the queried window;
    // prevents cross-midnight gate times reversing the first/last order)
    wheelsDep:    f.scheduled_off || f.actual_off  || f.estimated_off
               || f.scheduled_out || f.actual_out  || f.estimated_out || null,
    wheelsArr:    f.scheduled_on  || f.actual_on   || f.estimated_on
               || f.scheduled_in  || f.actual_in   || f.estimated_in  || null,
    aircraft:     (f.aircraft_type || '').trim(),
    status:       f.status || 'Scheduled',
  }));
}

function normalizeFA_Airport(a) {
  return {
    code:     a.code_iata  || a.code_icao || a.code || '',
    iata:     a.code_iata  || '',
    icao:     a.code_icao  || '',
    name:     a.name       || '',
    city:     a.city       || '',
    state:    a.state      || '',
    country:  a.country_code || a.country || '',
    timezone: a.timezone   || '',
  };
}

// ── Provider 2: AirLabs ───────────────────────────────────────────────────────

const AIRLABS_BASE = 'https://airlabs.co/api/v9';

async function airlabs_flights(airportCode, dateStr, direction, apiKey) {
  const param = direction === 'dep' ? 'dep_iata' : 'arr_iata';
  const url   = `${AIRLABS_BASE}/schedules?${param}=${airportCode}&api_key=${apiKey}`;
  const res   = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`AirLabs ${res.status}`);

  const data = await res.json();
  if (data?.error) throw new Error(`AirLabs: ${data.error.message || 'error'}`);

  const raw = data?.response || [];
  const dayFiltered = raw.filter(f => {
    const t = f.dep_time || f.arr_time || '';
    return t.startsWith(dateStr);
  });
  const flights = dayFiltered.length > 0 ? dayFiltered : raw;
  return normalizeAirLabs(flights, direction, airportCode);
}

async function airlabs_airports(query, apiKey) {
  const url = `${AIRLABS_BASE}/airports?search=${encodeURIComponent(query)}&api_key=${apiKey}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`AirLabs airports ${res.status}`);
  const data = await res.json();
  return (data?.response || []).slice(0, 10).map(normalizeAirLabs_Airport);
}

function normalizeAirLabs(flights, direction, airportCode) {
  return flights.map(f => {
    const dep = toISO(f.dep_time, f.dep_time_utc);
    const arr = toISO(f.arr_time, f.arr_time_utc);
    return {
      ident:        `${f.airline_iata || ''}${f.flight_number || ''}`,
      airline:       f.airline_iata || f.airline_icao || '',
      origin:        f.dep_iata || (direction === 'dep' ? airportCode : ''),
      destination:   f.arr_iata || (direction === 'arr' ? airportCode : ''),
      scheduledDep:  dep,
      scheduledArr:  arr,
      wheelsDep:     dep,  // AirLabs doesn't distinguish gate vs wheels
      wheelsArr:     arr,
      aircraft:      f.aircraft_icao || '',
      status:        f.status || 'Scheduled',
    };
  });
}

function normalizeAirLabs_Airport(a) {
  return {
    code:     a.iata_code  || a.icao_code || '',
    iata:     a.iata_code  || '',
    icao:     a.icao_code  || '',
    name:     a.name       || '',
    city:     a.city       || '',
    state:    a.country_code === 'US' ? (a.city || '') : '',
    country:  a.country_code || '',
    timezone: a.timezone   || '',
  };
}

// ── Provider 3: AviationStack ─────────────────────────────────────────────────

const AVSTACK_BASE = 'https://api.aviationstack.com/v1';

async function aviationstack_flights(airportCode, dateStr, direction, apiKey) {
  const param = direction === 'dep' ? 'dep_iata' : 'arr_iata';
  const url   = `${AVSTACK_BASE}/flights?access_key=${apiKey}&${param}=${airportCode}&limit=100`;
  const res   = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`AviationStack ${res.status}`);

  const data = await res.json();
  if (data?.error) throw new Error(`AviationStack: ${data.error.message || 'error'}`);

  const raw = data?.data || [];
  const dayFiltered = raw.filter(f => {
    const t = f.departure?.scheduled || f.arrival?.scheduled || '';
    return t.startsWith(dateStr);
  });
  const flights = dayFiltered.length > 0 ? dayFiltered : raw;
  return normalizeAvStack(flights, direction, airportCode);
}

async function aviationstack_airports(query, apiKey) {
  const url = `${AVSTACK_BASE}/airports?access_key=${apiKey}&search=${encodeURIComponent(query)}&limit=10`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`AviationStack airports ${res.status}`);
  const data = await res.json();
  return (data?.data || []).slice(0, 10).map(normalizeAvStack_Airport);
}

function normalizeAvStack(flights, direction, airportCode) {
  return flights.map(f => {
    const dep = f.departure?.scheduled || f.departure?.estimated || null;
    const arr = f.arrival?.scheduled   || f.arrival?.estimated   || null;
    return {
      ident:        f.flight?.iata   || f.flight?.icao || '',
      airline:       f.airline?.iata || f.airline?.name || '',
      origin:        f.departure?.iata || (direction === 'dep' ? airportCode : ''),
      destination:   f.arrival?.iata   || (direction === 'arr' ? airportCode : ''),
      scheduledDep:  dep,
      scheduledArr:  arr,
      wheelsDep:     dep,
      wheelsArr:     arr,
      aircraft:      f.aircraft?.iata || '',
      status:        f.flight_status  || 'Scheduled',
    };
  });
}

function normalizeAvStack_Airport(a) {
  return {
    code:     a.iata_code    || a.icao_code || '',
    iata:     a.iata_code    || '',
    icao:     a.icao_code    || '',
    name:     a.airport_name || '',
    city:     a.city_iata_code || '',
    state:    '',
    country:  a.country_iso2 || '',
    timezone: a.timezone     || '',
  };
}

// ── Utility ───────────────────────────────────────────────────────────────────

function toISO(local, utc) {
  if (utc)   return utc.replace(' ', 'T') + (utc.includes('Z') ? '' : 'Z');
  if (local) return local.replace(' ', 'T');
  return null;
}

// ── Provider waterfall ────────────────────────────────────────────────────────

async function flightsWithFallback(airportCode, dateStr, direction, env) {
  const providers = [
    { name: 'FlightAware',   key: env.FA_API_KEY,         fn: flightaware_flights },
    { name: 'AirLabs',       key: env.AIRLABS_KEY,        fn: airlabs_flights },
    { name: 'AviationStack', key: env.AVIATIONSTACK_KEY,  fn: aviationstack_flights },
  ];

  const errors = [];

  for (const p of providers) {
    if (!p.key) { errors.push(`${p.name}: no API key`); continue; }

    const ck = `flights:${p.name}:${airportCode}:${dateStr}:${direction}`;
    const cached = cacheGet(ck);
    if (cached) return { flights: cached, source: `${p.name} (cached)` };

    try {
      const flights = await p.fn(airportCode, dateStr, direction, p.key);
      if (isNonEmpty(flights)) {
        cacheSet(ck, flights, CACHE_TTL.flights);
        return { flights, source: p.name };
      }
      errors.push(`${p.name}: 0 flights`);
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }

  return { flights: [], source: 'none', errors };
}

async function airportsWithFallback(query, env) {
  const ck = `airports:${query.toLowerCase()}`;
  const cached = cacheGet(ck);
  if (cached) return { airports: cached, source: 'cache' };

  const providers = [
    { name: 'FlightAware',   key: env.FA_API_KEY,        fn: flightaware_airports },
    { name: 'AirLabs',       key: env.AIRLABS_KEY,       fn: airlabs_airports },
    { name: 'AviationStack', key: env.AVIATIONSTACK_KEY, fn: aviationstack_airports },
  ];

  for (const p of providers) {
    if (!p.key) continue;
    try {
      const airports = await p.fn(query, p.key);
      if (isNonEmpty(airports)) {
        cacheSet(ck, airports, CACHE_TTL.airports);
        return { airports, source: p.name };
      }
    } catch { /* try next */ }
  }

  return { airports: [], source: 'none' };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors   = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET')     return new Response('Method not allowed', { status: 405, headers: cors });

    const url  = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return new Response('Not found', { status: 404, headers: cors });

    // ── Airport search  GET /api/airports?query=XXX
    if (path === '/api/airports' && url.searchParams.has('query')) {
      const query = url.searchParams.get('query').trim();
      if (query.length < 2) return jsonResponse({ airports: [], source: 'none' }, 200, cors);
      try {
        return jsonResponse(await airportsWithFallback(query, env), 200, cors);
      } catch (e) {
        return jsonResponse({ airports: [], source: 'error', error: e.message }, 500, cors);
      }
    }

    // ── Departures  GET /api/airports/:code/flights/departures?start=...
    const depMatch = path.match(/^\/api\/airports\/([^/]+)\/flights\/departures$/);
    if (depMatch) {
      const code    = depMatch[1].toUpperCase();
      const dateStr = (url.searchParams.get('start') || '').slice(0, 10);
      if (!dateStr) return jsonResponse({ error: 'Missing start param' }, 400, cors);
      try {
        const r = await flightsWithFallback(code, dateStr, 'dep', env);
        return jsonResponse({ departures: r.flights, _source: r.source, _errors: r.errors || [] }, 200, cors);
      } catch (e) {
        return jsonResponse({ departures: [], _source: 'error', error: e.message }, 500, cors);
      }
    }

    // ── Arrivals  GET /api/airports/:code/flights/arrivals?start=...
    const arrMatch = path.match(/^\/api\/airports\/([^/]+)\/flights\/arrivals$/);
    if (arrMatch) {
      const code    = arrMatch[1].toUpperCase();
      const dateStr = (url.searchParams.get('start') || '').slice(0, 10);
      if (!dateStr) return jsonResponse({ error: 'Missing start param' }, 400, cors);
      try {
        const r = await flightsWithFallback(code, dateStr, 'arr', env);
        return jsonResponse({ arrivals: r.flights, _source: r.source, _errors: r.errors || [] }, 200, cors);
      } catch (e) {
        return jsonResponse({ arrivals: [], _source: 'error', error: e.message }, 500, cors);
      }
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
