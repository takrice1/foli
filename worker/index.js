/**
 * FOLI — First Out, Last In
 * Cloudflare Worker: FlightAware AeroAPI proxy
 *
 * Deploy:  cd worker && npx wrangler deploy
 * Set key: npx wrangler secret put FA_API_KEY
 */

const FA_BASE = 'https://aeroapi.flightaware.com/aeroapi';

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://foli.app',
  'https://www.foli.app',
  'https://flyfoli.com',
  'https://www.flyfoli.com',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors   = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    const url  = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return new Response('Not found', { status: 404, headers: cors });

    const faPath = path.replace('/api', '');
    const faUrl  = `${FA_BASE}${faPath}${url.search}`;
    const apiKey = env.FA_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'FA_API_KEY secret not configured on worker' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    try {
      const faRes = await fetch(faUrl, {
        headers: { 'x-apikey': apiKey, 'Accept': 'application/json; charset=UTF-8' },
      });
      const body = await faRes.text();
      return new Response(body, {
        status:  faRes.status,
        headers: { ...cors, 'Content-Type': faRes.headers.get('content-type') || 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }),
        { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  },
};
