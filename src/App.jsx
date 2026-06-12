import { useState } from 'react';
import AirportPicker from './components/AirportPicker.jsx';
import FlightCard from './components/FlightCard.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import ContactUs from './components/ContactUs.jsx';
import {
  fetchDepartures, fetchArrivals,
  parseFlights, getSource, getOriginTz, toCard, firstAndLast,
} from './api.js';
import { isLoggedIn, getEmail, logout } from './auth.js';
import styles from './App.module.css';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function App() {
  const [authed, setAuthed]           = useState(isLoggedIn());
  const [airport, setAirport]         = useState('');
  const [airportMeta, setAirportMeta] = useState(null);
  const [destination, setDest]        = useState('');
  const [destMeta, setDestMeta]       = useState(null);
  const [date, setDate]               = useState(todayStr());
  const [tab, setTab]                 = useState('dep');
  const [loading, setLoading]         = useState(false);
  const [results, setResults]         = useState(null);
  const [error, setError]             = useState(null);

  // Reset results whenever airport, destination, or date changes so a stale
  // lookup is never shown alongside new search inputs
  function handleAirport(code, meta) {
    setAirport(code);
    setAirportMeta(meta || null);
    setResults(null);
    setError(null);
  }

  function handleDest(code, meta) {
    setDest(code);
    setDestMeta(meta || null);
    setResults(null);
    setError(null);
  }

  function selectDate(str) {
    setDate(str);
    setResults(null);
    setError(null);
    if (airport) search(str);
  }

  async function search(overrideDate) {
    if (!airport) return;
    const searchDate = overrideDate ?? date;
    setLoading(true); setError(null); setResults(null);

    try {
      const [depData, arrData] = await Promise.all([
        fetchDepartures(airport, searchDate),
        fetchArrivals(airport, searchDate),
      ]);

      let depCards = parseFlights(depData).map(f => toCard(f, 'dep', airport));
      let arrCards = parseFlights(arrData).map(f => toCard(f, 'arr', airport));

      // Optional route filter
      if (destination) {
        depCards = depCards.filter(f => f.destination === destination);
        arrCards = arrCards.filter(f => f.origin      === destination);
      }

      // Pass date so firstAndLast can filter out off-date edge-case flights
      const deps   = firstAndLast(depCards, 'rawDep', searchDate);
      const arrs   = firstAndLast(arrCards, 'rawArr', searchDate);
      const depSrc = getSource(depData);
      const arrSrc = getSource(arrData);
      // Queried airport's IANA timezone for local-time display
      const originTz = getOriginTz(depData) || getOriginTz(arrData)
                    || airportMeta?.timezone || null;

      const displayName = airportMeta?.city
        ? `${airportMeta.city}${airportMeta.state ? `, ${airportMeta.state}` : ''}`
        : airport;

      setResults({
        code:        airport,
        displayName,
        fullName:    airportMeta?.name || '',
        dateStr:     searchDate,
        date: new Date(searchDate + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
        }),
        deps, arrs,
        originTz,
        depSource: depSrc,
        arrSource: arrSrc,
      });
    } catch (e) {
      if (e.authExpired) { setAuthed(false); return; }
      setError(e.message || 'Failed to fetch flight data.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logout();
    setAuthed(false);
    setResults(null);
    setError(null);
  }

  const depsDiffer = results?.deps.first?.flightNumber !== results?.deps.last?.flightNumber;
  const arrsDiffer = results?.arrs.first?.flightNumber !== results?.arrs.last?.flightNumber;

  if (!authed) {
    return <LoginScreen onAuthed={() => setAuthed(true)} />;
  }

  return (
    <div className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.wordmark}>
          <span className={styles.foliLogo}>FOLI</span>
          <span className={styles.foliTag}>First Out · Last In</span>
          <span className={styles.account}>
            <span className={styles.accountEmail}>{getEmail()}</span>
            <button className={styles.logoutBtn} onClick={handleLogout}>Log out</button>
          </span>
        </div>
        <p className={styles.subtitle}>
          First &amp; last flights at any airport worldwide —<br />
          every major, regional, and commuter airline.
        </p>
        <div className={styles.runway} />
      </header>

      {/* ── Search ── */}
      <section className={styles.panel}>
        <AirportPicker label="Airport" icon="🛫" value={airport} onChange={handleAirport} />
        <AirportPicker
          label="Route: To / From (optional)"
          icon="📍"
          value={destination}
          onChange={handleDest}
          placeholder="Filter by specific route…"
        />
        <div className={styles.dateField}>
          <label className={styles.dateLabel}>Date</label>
          <div className={styles.dateTabs}>
            {[0, 1].map(offset => {
              const d = new Date();
              d.setDate(d.getDate() + offset);
              const str  = d.toISOString().slice(0, 10);
              const day  = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const lbl  = offset === 0 ? 'Today' : 'Tomorrow';
              return (
                <button
                  key={offset}
                  className={`${styles.dateTab} ${date === str ? styles.dateTabActive : ''}`}
                  onClick={() => selectDate(str)}
                >
                  <span className={styles.dateTabLabel}>{lbl}</span>
                  <span className={styles.dateTabDay}>{day}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          className={styles.goBtn}
          onClick={search}
          disabled={!airport || loading}
        >
          {loading ? '⏳ Searching…' : '✈ Find First & Last Flights'}
        </button>
      </section>

      {/* ── Loading ── */}
      {loading && (
        <div className={styles.loading}>
          <div className={styles.plane}>✈</div>
          <div className={styles.loadingTxt}>Querying all data sources…</div>
          <div className={styles.loadingSub}>FlightAware → AirLabs → AviationStack</div>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div className={styles.errWrap}>
          <div className={styles.errIcon}>⚠️</div>
          <p className={styles.errMsg}>{error}</p>
          <p className={styles.errHint}>Try a different airport or date.</p>
        </div>
      )}

      {/* ── Results ── */}
      {results && !loading && (
        <section className={styles.results}>

          <div className={styles.apHeader}>
            <span className={styles.apBadge}>{results.code}</span>
            <div>
              <div className={styles.apCity}>{results.displayName}</div>
              <div className={styles.apDate}>{results.date}</div>
            </div>
          </div>

          {results.fullName && (
            <div className={styles.apFullName}>{results.fullName}</div>
          )}

          <div className={styles.sourceBadges}>
            <span className={styles.liveDot} />
            <span className={styles.sourceLabel}>Live data</span>
            <SourceTag label="Dep" source={results.depSource} />
            <SourceTag label="Arr" source={results.arrSource} />
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statNum}>{results.deps.count}</div>
              <div className={styles.statLbl}>Departures</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statNum}>{results.arrs.count}</div>
              <div className={styles.statLbl}>Arrivals</div>
            </div>
          </div>

          <div className={styles.tabs}>
            <button className={`${styles.tab} ${tab === 'dep' ? styles.active : ''}`} onClick={() => setTab('dep')}>
              🛫 Departures
            </button>
            <button className={`${styles.tab} ${tab === 'arr' ? styles.active : ''}`} onClick={() => setTab('arr')}>
              🛬 Arrivals
            </button>
          </div>

          {tab === 'dep' && (
            <div>
              <div className={styles.sectionLabel}>Departures from {results.code}</div>
              {results.deps.first
                ? <FlightCard flight={results.deps.first} rank="first" airportTz={results.originTz} />
                : <p className={styles.empty}>No departures found for this date.</p>}
              {results.deps.last && depsDiffer &&
                <FlightCard flight={results.deps.last} rank="last" airportTz={results.originTz} />}
            </div>
          )}

          {tab === 'arr' && (
            <div>
              <div className={styles.sectionLabel}>Arrivals into {results.code}</div>
              {results.arrs.first
                ? <FlightCard flight={results.arrs.first} rank="first" airportTz={results.originTz} />
                : <p className={styles.empty}>No arrivals found for this date.</p>}
              {results.arrs.last && arrsDiffer &&
                <FlightCard flight={results.arrs.last} rank="last" airportTz={results.originTz} />}
            </div>
          )}

        </section>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerLogo}>FOLI</span>
        <span className={styles.footerTag}>First Out · Last In · Powered by FlightAware, AirLabs &amp; AviationStack</span>
        <ContactUs />
      </footer>

    </div>
  );
}

function SourceTag({ label, source }) {
  if (!source) return null;
  const s = source.toLowerCase();
  const color = s.includes('flightaware') ? '#2d6a4f'
              : s.includes('airlabs')     ? '#457b9d'
              : s.includes('aviation')    ? '#7b4fa0'
              : '#9a9590';
  const short = s.includes('flightaware') ? 'FA'
              : s.includes('airlabs')     ? 'AL'
              : s.includes('aviation')    ? 'AS'
              : s.includes('cached')      ? '⚡'
              : '?';
  return (
    <span style={{
      fontFamily: 'var(--mono)', fontSize: '9px', fontWeight: 500,
      letterSpacing: '0.08em', padding: '2px 6px', borderRadius: '4px',
      background: color + '22', color, marginLeft: 4,
    }}>
      {label}: {short}
    </span>
  );
}
