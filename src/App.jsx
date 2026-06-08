import { useState } from 'react';
import AirportPicker from './components/AirportPicker.jsx';
import FlightCard from './components/FlightCard.jsx';
import { fetchDepartures, fetchArrivals, parseFlights, toCard, firstAndLast } from './api.js';
import styles from './App.module.css';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function App() {
  const [airport, setAirport] = useState('');
  const [date, setDate]       = useState(todayStr());
  const [tab, setTab]                 = useState('dep');
  const [loading, setLoading]         = useState(false);
  const [results, setResults]         = useState(null);
  const [error, setError]             = useState(null);

  async function search() {
    if (!airport) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const [depData, arrData] = await Promise.all([
        fetchDepartures(airport, date),
        fetchArrivals(airport, date),
      ]);
      const depCards = parseFlights(depData).map(f => toCard(f, 'dep', airport));
      const arrCards = parseFlights(arrData).map(f => toCard(f, 'arr', airport));
      const deps = firstAndLast(depCards, 'rawDep', date);
      const arrs = firstAndLast(arrCards, 'rawArr', date);
      setResults({
        code: airport,
        date: new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
        }),
        deps, arrs,
      });
    } catch (e) {
      setError(e.message || 'Failed to fetch flight data.');
    } finally {
      setLoading(false);
    }
  }

  const depsDiffer = results?.deps.first?.flightNumber !== results?.deps.last?.flightNumber;
  const arrsDiffer = results?.arrs.first?.flightNumber !== results?.arrs.last?.flightNumber;

  return (
    <div className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.wordmark}>
          <span className={styles.foliLogo}>FOLI</span>
          <span className={styles.foliTag}>First Out · Last In</span>
        </div>
        <p className={styles.subtitle}>
          The first and last commercial flights at any airport worldwide,<br />
          across every airline — majors, regionals, and charters.
        </p>
        <div className={styles.runway} />
      </header>

      {/* ── Search ── */}
      <section className={styles.panel}>
        <AirportPicker label="Airport" icon="🛫" value={airport} onChange={setAirport} />
        <div className={styles.dateField}>
          <label className={styles.dateLabel}>Date</label>
          <div className={styles.dateWrap}>
            <span className={styles.dateIcon}>📅</span>
            <input type="date" className={styles.dateInp} value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <button className={styles.goBtn} onClick={search} disabled={!airport || loading}>
          {loading ? '⏳ Searching…' : '✈ Find First & Last Flights'}
        </button>
      </section>

      {/* ── Loading ── */}
      {loading && (
        <div className={styles.loading}>
          <div className={styles.plane}>✈</div>
          <div className={styles.loadingTxt}>Querying FlightAware…</div>
          <div className={styles.loadingSub}>Fetching all flights for {airport}</div>
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
            <div className={styles.apDate}>{results.date}</div>
          </div>
          <div className={styles.liveBadge}>
            <span className={styles.liveDot} />
            Live · FlightAware AeroAPI
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
            <button className={`${styles.tab} ${tab === 'dep' ? styles.active : ''}`} onClick={() => setTab('dep')}>🛫 Departures</button>
            <button className={`${styles.tab} ${tab === 'arr' ? styles.active : ''}`} onClick={() => setTab('arr')}>🛬 Arrivals</button>
          </div>
          {tab === 'dep' && (
            <div>
              <div className={styles.sectionLabel}>Departures from {results.code}</div>
              {results.deps.first ? <FlightCard flight={results.deps.first} rank="first" /> : <p className={styles.empty}>No departures found.</p>}
              {results.deps.last && depsDiffer && <FlightCard flight={results.deps.last} rank="last" />}
            </div>
          )}
          {tab === 'arr' && (
            <div>
              <div className={styles.sectionLabel}>Arrivals into {results.code}</div>
              {results.arrs.first ? <FlightCard flight={results.arrs.first} rank="first" /> : <p className={styles.empty}>No arrivals found.</p>}
              {results.arrs.last && arrsDiffer && <FlightCard flight={results.arrs.last} rank="last" />}
            </div>
          )}
        </section>
      )}

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span className={styles.footerLogo}>FOLI</span>
        <span className={styles.footerTag}>First Out · Last In · Powered by FlightAware</span>
      </footer>

    </div>
  );
}
