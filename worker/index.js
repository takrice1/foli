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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
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
  airports: 60 * 60 * 1000,       // 1 hour  — airport metadata rarely changes
  flights:   5 * 60 * 1000,       // 5 mins  — flight data is time-sensitive
  tz:       24 * 60 * 60 * 1000,  // 24 hrs  — airport timezones never change
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

// ── Timezone lookup ───────────────────────────────────────────────────────────
// Inline IATA→IANA map for the most common airports so the happy path needs no
// extra API call. Unknown airports fall back to FlightAware's /airports/{id}
// endpoint, cached for 24h.

const TZ_MAP = {
  // US
  ATL:'America/New_York', BOS:'America/New_York', BWI:'America/New_York',
  CLT:'America/New_York', DCA:'America/New_York', EWR:'America/New_York',
  IAD:'America/New_York', JFK:'America/New_York', LGA:'America/New_York',
  MIA:'America/New_York', MCO:'America/New_York', PHL:'America/New_York',
  PBI:'America/New_York', RDU:'America/New_York', RIC:'America/New_York',
  FLL:'America/New_York', TPA:'America/New_York', RSW:'America/New_York',
  JAX:'America/New_York', SAV:'America/New_York', CHS:'America/New_York',
  PIT:'America/New_York', CLE:'America/New_York', CMH:'America/New_York',
  CVG:'America/New_York', IND:'America/New_York', DTW:'America/New_York',
  BUF:'America/New_York', ROC:'America/New_York', SYR:'America/New_York',
  ALB:'America/New_York', BDL:'America/New_York', PVD:'America/New_York',
  SJU:'America/Puerto_Rico', STT:'America/St_Thomas',
  BNA:'America/Chicago', MDW:'America/Chicago', MCI:'America/Chicago',
  MEM:'America/Chicago', MSP:'America/Chicago', MSY:'America/Chicago',
  ORD:'America/Chicago', SAT:'America/Chicago', STL:'America/Chicago',
  HOU:'America/Chicago', DAL:'America/Chicago', IAH:'America/Chicago',
  DFW:'America/Chicago', OMA:'America/Chicago', MKE:'America/Chicago',
  DSM:'America/Chicago', BHM:'America/Chicago', LIT:'America/Chicago',
  TUL:'America/Chicago', OKC:'America/Chicago', XNA:'America/Chicago',
  AUS:'America/Chicago',
  ABQ:'America/Denver', DEN:'America/Denver', EGE:'America/Denver',
  GJT:'America/Denver', HDN:'America/Denver', SLC:'America/Denver',
  ASE:'America/Denver', BOI:'America/Denver', BZN:'America/Denver',
  JAC:'America/Denver', FCA:'America/Denver', BIL:'America/Denver',
  HLN:'America/Denver', GTF:'America/Denver', CPR:'America/Denver',
  ANC:'America/Anchorage', FAI:'America/Anchorage', JNU:'America/Juneau',
  KTN:'America/Sitka', SIT:'America/Sitka', BET:'America/Nome',
  OME:'America/Nome', OTZ:'America/Nome', ADQ:'America/Anchorage',
  HNL:'Pacific/Honolulu', OGG:'Pacific/Honolulu', KOA:'Pacific/Honolulu',
  LIH:'Pacific/Honolulu', ITO:'Pacific/Honolulu',
  LAX:'America/Los_Angeles', OAK:'America/Los_Angeles', SAN:'America/Los_Angeles',
  SFO:'America/Los_Angeles', SJC:'America/Los_Angeles', SMF:'America/Los_Angeles',
  BUR:'America/Los_Angeles', LGB:'America/Los_Angeles', ONT:'America/Los_Angeles',
  SNA:'America/Los_Angeles', SBA:'America/Los_Angeles', FAT:'America/Los_Angeles',
  RNO:'America/Los_Angeles', LAS:'America/Los_Angeles', PHX:'America/Phoenix',
  TUS:'America/Phoenix', PDX:'America/Los_Angeles', SEA:'America/Los_Angeles',
  GEG:'America/Los_Angeles', YKM:'America/Los_Angeles', BLI:'America/Los_Angeles',
  // Canada
  YYZ:'America/Toronto', YOW:'America/Toronto', YUL:'America/Toronto',
  YHZ:'America/Halifax', YWG:'America/Winnipeg', YYC:'America/Edmonton',
  YEG:'America/Edmonton', YVR:'America/Vancouver',
  // Europe
  LHR:'Europe/London', LGW:'Europe/London', STN:'Europe/London',
  DUB:'Europe/Dublin', CDG:'Europe/Paris', ORY:'Europe/Paris',
  AMS:'Europe/Amsterdam', FRA:'Europe/Berlin', MUC:'Europe/Berlin',
  ZRH:'Europe/Zurich', VIE:'Europe/Vienna', BRU:'Europe/Brussels',
  MAD:'Europe/Madrid', BCN:'Europe/Madrid', FCO:'Europe/Rome',
  MXP:'Europe/Rome', ATH:'Europe/Athens', IST:'Europe/Istanbul',
  CPH:'Europe/Copenhagen', ARN:'Europe/Stockholm', HEL:'Europe/Helsinki',
  OSL:'Europe/Oslo', LIS:'Europe/Lisbon', WAW:'Europe/Warsaw',
  PRG:'Europe/Prague', BUD:'Europe/Budapest',
  // Middle East
  DXB:'Asia/Dubai', AUH:'Asia/Dubai', DOH:'Asia/Qatar',
  RUH:'Asia/Riyadh', JED:'Asia/Riyadh',
  // Asia
  NRT:'Asia/Tokyo', HND:'Asia/Tokyo', KIX:'Asia/Tokyo', CTS:'Asia/Tokyo',
  ICN:'Asia/Seoul', GMP:'Asia/Seoul',
  PEK:'Asia/Shanghai', PKX:'Asia/Shanghai', PVG:'Asia/Shanghai',
  SHA:'Asia/Shanghai', CAN:'Asia/Shanghai', CTU:'Asia/Shanghai',
  HKG:'Asia/Hong_Kong', SIN:'Asia/Singapore', BKK:'Asia/Bangkok',
  DMK:'Asia/Bangkok', KUL:'Asia/Kuala_Lumpur', CGK:'Asia/Jakarta',
  MNL:'Asia/Manila', DEL:'Asia/Kolkata', BOM:'Asia/Kolkata',
  BLR:'Asia/Kolkata', HYD:'Asia/Kolkata', MAA:'Asia/Kolkata',
  // Africa
  JNB:'Africa/Johannesburg', CPT:'Africa/Johannesburg',
  NBO:'Africa/Nairobi', LOS:'Africa/Lagos', ADD:'Africa/Addis_Ababa',
  CAI:'Africa/Cairo', CMN:'Africa/Casablanca',
  // Pacific
  SYD:'Australia/Sydney', MEL:'Australia/Melbourne', BNE:'Australia/Brisbane',
  PER:'Australia/Perth', AKL:'Pacific/Auckland', CHC:'Pacific/Auckland',
  // Latin America
  MEX:'America/Mexico_City', CUN:'America/Cancun', GDL:'America/Mexico_City',
  MTY:'America/Monterrey', GRU:'America/Sao_Paulo', CGH:'America/Sao_Paulo',
  GIG:'America/Sao_Paulo', BSB:'America/Sao_Paulo', EZE:'America/Argentina/Buenos_Aires',
  AEP:'America/Argentina/Buenos_Aires', SCL:'America/Santiago',
  LIM:'America/Lima', BOG:'America/Bogota', MDE:'America/Bogota',
  UIO:'America/Guayaquil', NAS:'America/Nassau', MBJ:'America/Jamaica',
  KIN:'America/Jamaica', PUJ:'America/Santo_Domingo', SDQ:'America/Santo_Domingo',
  HAV:'America/Havana',
};

async function getAirportTz(code, apiKey) {
  if (!code) return null;
  if (TZ_MAP[code]) return TZ_MAP[code];
  const ck = `tz:${code}`;
  const cached = cacheGet(ck);
  if (cached) return cached;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${FA_BASE}/airports/${code}`, {
      headers: { 'x-apikey': apiKey, 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const d  = await res.json();
    const tz = d?.timezone || null;
    if (tz) cacheSet(ck, tz, CACHE_TTL.tz);
    return tz;
  } catch { return null; }
}

// ── Auth (paywall) ────────────────────────────────────────────────────────────
//
// Accounts live in the USERS KV namespace:  user:<email> →
//   { passHash, salt, plan, createdAt }
// Passwords are hashed with PBKDF2-SHA256 (100k iterations, per-user salt).
// Sessions are HS256 JWTs signed with the AUTH_SECRET worker secret, 30-day
// expiry. The flight endpoints require a valid Bearer token; airport search
// stays public so the picker works on the login screen if ever needed.
//
// `plan` is 'free' for now — Stripe checkout will upgrade it to 'pro' later.

const TOKEN_TTL_S   = 30 * 24 * 60 * 60; // 30 days
const PBKDF2_ITERS  = 100_000;

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function b64url(data) {
  const str = typeof data === 'string' ? data : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS },
    key, 256,
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signToken(email, plan, secret) {
  const header  = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ sub: email, plan, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S }));
  const sig     = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

async function verifyToken(token, secret) {
  try {
    const [header, payload, sig] = token.split('.');
    if (!header || !payload || !sig) return null;
    const sigBytes = Uint8Array.from(b64urlDecode(sig), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes, enc.encode(`${header}.${payload}`));
    if (!ok) return null;
    const claims = JSON.parse(b64urlDecode(payload));
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}

async function requireAuth(request, env) {
  if (!env.AUTH_SECRET) return { sub: 'anonymous', plan: 'free' }; // auth not configured — fail open
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), env.AUTH_SECRET);
}

const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleSignup(request, env, cors) {
  const { email, password } = await request.json().catch(() => ({}));
  const em = (email || '').trim().toLowerCase();
  if (!VALID_EMAIL.test(em))                return jsonResponse({ error: 'Enter a valid email address.' }, 400, cors);
  if (!password || password.length < 8)     return jsonResponse({ error: 'Password must be at least 8 characters.' }, 400, cors);
  if (await env.USERS.get(`user:${em}`))    return jsonResponse({ error: 'An account with that email already exists — log in instead.' }, 409, cors);

  const { hash, salt } = await hashPassword(password);
  const user = { passHash: hash, salt, plan: 'free', createdAt: new Date().toISOString() };
  await env.USERS.put(`user:${em}`, JSON.stringify(user));

  const token = await signToken(em, user.plan, env.AUTH_SECRET);
  return jsonResponse({ token, email: em, plan: user.plan }, 201, cors);
}

async function handleLogin(request, env, cors) {
  const { email, password } = await request.json().catch(() => ({}));
  const em  = (email || '').trim().toLowerCase();
  const raw = em ? await env.USERS.get(`user:${em}`) : null;
  if (!raw) return jsonResponse({ error: 'Incorrect email or password.' }, 401, cors);

  const user = JSON.parse(raw);
  const { hash } = await hashPassword(password || '', user.salt);
  if (hash !== user.passHash) return jsonResponse({ error: 'Incorrect email or password.' }, 401, cors);

  const token = await signToken(em, user.plan, env.AUTH_SECRET);
  return jsonResponse({ token, email: em, plan: user.plan }, 200, cors);
}

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
    originTz:     f.origin?.timezone      || null,
    destTz:       f.destination?.timezone || null,
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
      originTz:      null,  // AirLabs doesn't include timezones
      destTz:        null,
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
      originTz:      f.departure?.timezone || null,
      destTz:        f.arrival?.timezone   || null,
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
    if (cached) return { flights: cached.flights, source: `${p.name} (cached)`, originTz: cached.originTz };

    try {
      const flights = await p.fn(airportCode, dateStr, direction, p.key);
      if (isNonEmpty(flights)) {
        // Resolve the queried airport's timezone: flight data → TZ_MAP → FA lookup
        // (for arrivals the queried airport is the destination side)
        const tzFromData = direction === 'dep' ? flights[0]?.originTz : flights[0]?.destTz;
        const originTz = tzFromData || TZ_MAP[airportCode]
                      || await getAirportTz(airportCode, env.FA_API_KEY);
        const enriched = flights.map(f => ({
          ...f,
          originTz: f.originTz || (direction === 'dep' ? originTz : TZ_MAP[f.origin]) || null,
          destTz:   f.destTz   || (direction === 'arr' ? originTz : TZ_MAP[f.destination]) || null,
        }));
        cacheSet(ck, { flights: enriched, originTz }, CACHE_TTL.flights);
        return { flights: enriched, source: p.name, originTz };
      }
      errors.push(`${p.name}: 0 flights`);
    } catch (e) {
      errors.push(`${p.name}: ${e.message}`);
    }
  }

  return { flights: [], source: 'none', originTz: null, errors };
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

    const url  = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return new Response('Not found', { status: 404, headers: cors });

    // ── Auth  POST /api/auth/signup | /api/auth/login,  GET /api/auth/me
    if (path === '/api/auth/signup' && request.method === 'POST') {
      try { return await handleSignup(request, env, cors); }
      catch (e) { return jsonResponse({ error: e.message }, 500, cors); }
    }
    if (path === '/api/auth/login' && request.method === 'POST') {
      try { return await handleLogin(request, env, cors); }
      catch (e) { return jsonResponse({ error: e.message }, 500, cors); }
    }
    if (path === '/api/auth/me' && request.method === 'GET') {
      const claims = await requireAuth(request, env);
      if (!claims) return jsonResponse({ error: 'Not signed in' }, 401, cors);
      return jsonResponse({ email: claims.sub, plan: claims.plan }, 200, cors);
    }

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

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

    // ── Flight endpoints are behind the paywall — require a valid session token
    const isFlightPath = /^\/api\/airports\/[^/]+\/flights\//.test(path);
    if (isFlightPath) {
      const claims = await requireAuth(request, env);
      if (!claims) return jsonResponse({ error: 'auth_required' }, 401, cors);
    }

    // ── Departures  GET /api/airports/:code/flights/departures?start=...
    const depMatch = path.match(/^\/api\/airports\/([^/]+)\/flights\/departures$/);
    if (depMatch) {
      const code    = depMatch[1].toUpperCase();
      const dateStr = (url.searchParams.get('start') || '').slice(0, 10);
      if (!dateStr) return jsonResponse({ error: 'Missing start param' }, 400, cors);
      try {
        const r = await flightsWithFallback(code, dateStr, 'dep', env);
        return jsonResponse({ departures: r.flights, _source: r.source, _originTz: r.originTz || null, _errors: r.errors || [] }, 200, cors);
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
        return jsonResponse({ arrivals: r.flights, _source: r.source, _originTz: r.originTz || null, _errors: r.errors || [] }, 200, cors);
      } catch (e) {
        return jsonResponse({ arrivals: [], _source: 'error', error: e.message }, 500, cors);
      }
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
