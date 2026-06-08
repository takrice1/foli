/**
 * IATA airline code → full marketing name.
 * Covers all major US carriers, regionals, and top international operators
 * that appear at US airports.  Unknown codes fall back to the code itself.
 */
const AIRLINES = {
  // ── US Majors ──────────────────────────────────────────────────────────────
  AA: 'American Airlines',
  DL: 'Delta Air Lines',
  UA: 'United Airlines',
  WN: 'Southwest Airlines',
  B6: 'JetBlue Airways',
  AS: 'Alaska Airlines',
  F9: 'Frontier Airlines',
  NK: 'Spirit Airlines',
  G4: 'Allegiant Air',
  SY: 'Sun Country Airlines',
  HA: 'Hawaiian Airlines',
  VX: 'Virgin America',

  // ── US Regionals (operating as major brand connections) ────────────────────
  OO: 'SkyWest Airlines',
  YX: 'Republic Airways',
  MQ: 'Envoy Air',           // American Eagle
  OH: 'PSA Airlines',        // American Eagle
  PT: 'Piedmont Airlines',   // American Eagle
  YV: 'Mesa Airlines',
  QX: 'Horizon Air',         // Alaska Horizon
  '9E': 'Endeavor Air',      // Delta Connection
  G7: 'GoJet Airlines',
  ZW: 'Air Wisconsin',
  CP: 'Compass Airlines',
  C5: 'CommutAir',
  EM: 'Empire Airlines',
  EV: 'ExpressJet Airlines',
  '9K': 'Cape Air',
  '3M': 'Silver Airways',
  '4B': 'Boutique Air',
  KS: 'Peninsula Airways',
  LF: 'Contour Airlines',
  KG: 'Key Lime Air',
  '7H': 'Era Alaska',
  DD: 'Nok Air',

  // ── US Charter / Cargo ─────────────────────────────────────────────────────
  '5Y': 'Atlas Air',
  '8C': 'Air Transport International',
  FX: 'FedEx Express',
  '5X': 'UPS Airlines',
  PO: 'Polar Air Cargo',
  '3S': 'Aerologic',

  // ── Canada ────────────────────────────────────────────────────────────────
  AC: 'Air Canada',
  WS: 'WestJet',
  PD: 'Porter Airlines',
  '8O': 'Sata Internacional',

  // ── Mexico / Central America / Caribbean ──────────────────────────────────
  AM: 'Aeroméxico',
  VB: 'VivaAerobus',
  Y4: 'Volaris',
  '4O': 'Interjet',
  CM: 'Copa Airlines',
  BW: 'Caribbean Airlines',
  '8J': 'Eco Jet',
  '7I': 'Insel Air',
  '3J': 'Jubba Airways',

  // ── South America ─────────────────────────────────────────────────────────
  LA: 'LATAM Airlines',
  LP: 'LATAM Airlines Perú',
  JJ: 'LATAM Airlines Brasil',
  G3: 'Gol Linhas Aéreas',
  AD: 'Azul Brazilian Airlines',
  '4M': 'LATAM Airlines Argentina',
  AR: 'Aerolíneas Argentinas',
  AV: 'Avianca',
  '5Z': 'Cemair',

  // ── UK / Ireland ──────────────────────────────────────────────────────────
  BA: 'British Airways',
  VS: 'Virgin Atlantic',
  EI: 'Aer Lingus',
  U2: 'easyJet',
  ZB: 'Monarch Airlines',

  // ── Western Europe ─────────────────────────────────────────────────────────
  LH: 'Lufthansa',
  AF: 'Air France',
  KL: 'KLM',
  IB: 'Iberia',
  VY: 'Vueling',
  UX: 'Air Europa',
  AZ: 'ITA Airways',
  LX: 'Swiss International',
  OS: 'Austrian Airlines',
  SK: 'Scandinavian Airlines',
  AY: 'Finnair',
  DY: 'Norwegian Air',
  FR: 'Ryanair',
  W6: 'Wizz Air',
  HV: 'Transavia',
  TO: 'Transavia France',
  DE: 'Condor',
  X3: 'TUI fly Deutschland',
  '4U': 'Germanwings',
  EW: 'Eurowings',
  LG: 'Luxair',
  SN: 'Brussels Airlines',
  TP: 'TAP Air Portugal',
  A3: 'Aegean Airlines',
  OA: 'Olympic Air',

  // ── Eastern Europe ─────────────────────────────────────────────────────────
  LO: 'LOT Polish Airlines',
  OK: 'Czech Airlines',
  FB: 'Bulgaria Air',
  RO: 'TAROM',
  JU: 'Air Serbia',
  OU: 'Croatia Airlines',
  JP: 'Adria Airways',

  // ── Russia / Central Asia ─────────────────────────────────────────────────
  SU: 'Aeroflot',
  S7: 'S7 Airlines',
  UT: 'UTair',
  KC: 'Air Astana',

  // ── Middle East ────────────────────────────────────────────────────────────
  EK: 'Emirates',
  QR: 'Qatar Airways',
  EY: 'Etihad Airways',
  TK: 'Turkish Airlines',
  GF: 'Gulf Air',
  WY: 'Oman Air',
  RJ: 'Royal Jordanian',
  ME: 'Middle East Airlines',
  KU: 'Kuwait Airways',
  SV: 'Saudia',
  FZ: 'flydubai',
  G9: 'Air Arabia',
  '6E': 'IndiGo',

  // ── Africa ────────────────────────────────────────────────────────────────
  ET: 'Ethiopian Airlines',
  MS: 'EgyptAir',
  AT: 'Royal Air Maroc',
  KQ: 'Kenya Airways',
  SA: 'South African Airways',
  '4Z': 'Airlink',

  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  SQ: 'Singapore Airlines',
  CX: 'Cathay Pacific',
  JL: 'Japan Airlines',
  NH: 'All Nippon Airways',
  KE: 'Korean Air',
  OZ: 'Asiana Airlines',
  CI: 'China Airlines',
  BR: 'EVA Air',
  CA: 'Air China',
  MU: 'China Eastern',
  CZ: 'China Southern',
  HU: 'Hainan Airlines',
  MH: 'Malaysia Airlines',
  TG: 'Thai Airways',
  FD: 'Thai AirAsia',
  GA: 'Garuda Indonesia',
  QZ: 'AirAsia Indonesia',
  PR: 'Philippine Airlines',
  '5J': 'Cebu Pacific',
  VN: 'Vietnam Airlines',
  VJ: 'VietJet Air',
  BX: 'Air Busan',
  TW: 'T\'way Air',
  AI: 'Air India',
  IX: 'Air India Express',
  SG: 'SpiceJet',
  QF: 'Qantas',
  JQ: 'Jetstar',
  VA: 'Virgin Australia',
  NZ: 'Air New Zealand',
  NH: 'All Nippon Airways',

  // ── Business Aviation / Fractional ────────────────────────────────────────
  '1I': 'NetJets',
  LXJ: 'Flexjet',
  XO: 'XOJET',
  TWY: 'Textron Aviation',
};

/**
 * Returns the full airline name for an IATA code.
 * Falls back to the code itself if not found.
 * If the input already looks like a full name (length > 3), returns it unchanged.
 *
 * @param {string} code  IATA operator code, e.g. "AA"
 * @returns {string}     Full name, e.g. "American Airlines"
 */
export function airlineName(code) {
  if (!code || code === '—') return code || '—';
  const trimmed = code.trim();
  // If the value is already a descriptive name (not just a short code), keep it
  if (trimmed.length > 4 && !/^[A-Z0-9]{2,3}$/.test(trimmed)) return trimmed;
  return AIRLINES[trimmed] || trimmed;
}
