import { useState, useEffect, useRef } from 'react';
import { AIRPORTS, airportLabel } from '../airports.js';
import { searchAirports } from '../api.js';
import styles from './AirportPicker.module.css';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function liveLabel(a) {
  const parts = [a.city, a.state, a.country].filter(Boolean);
  return `${a.code} — ${parts.join(', ')}`;
}

export default function AirportPicker({
  label,
  icon,
  value,
  onChange,         // onChange(code, fullAirportObj)
  placeholder = 'Search any airport worldwide…',
}) {
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [liveResults, setLive]    = useState([]);
  const [liveSource, setSource]   = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState(null);

  const ref        = useRef(null);
  const reqId      = useRef(0);
  const debouncedQ = useDebounce(query, 320);

  // Static quick matches (instant, local)
  const staticMatches = query.length > 0
    ? AIRPORTS.filter(a => {
        const q = query.toLowerCase();
        return a.code.toLowerCase().startsWith(q) ||
               a.city.toLowerCase().includes(q)   ||
               a.name.toLowerCase().includes(q)   ||
               (a.state && a.state.toLowerCase().includes(q));
      }).slice(0, 5)
    : [];

  // Live search via worker (FlightAware → AirLabs → AviationStack fallback)
  useEffect(() => {
    if (!open || debouncedQ.length < 2) { setLive([]); setSearching(false); return; }

    const id = ++reqId.current;
    setSearching(true);

    searchAirports(debouncedQ).then(({ airports, source }) => {
      if (reqId.current !== id) return;
      const staticCodes = new Set(staticMatches.map(a => a.code));
      setLive(airports.filter(a => a.code && !staticCodes.has(a.code)));
      setSource(source);
      setSearching(false);
    }).catch(() => {
      if (reqId.current !== id) return;
      setSearching(false);
    });
  }, [debouncedQ, open]);

  // Close on outside click
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function pick(airport, isLive = false) {
    setSelected({ ...airport, isLive });
    onChange(airport.code, airport);
    setOpen(false);
    setQuery('');
    setLive([]);
  }

  function clear(e) {
    e.preventDefault();
    setSelected(null);
    onChange('', null);
    setQuery('');
    setLive([]);
  }

  function displayValue() {
    if (open) return query;
    if (!value) return '';
    if (selected?.code === value) {
      return selected.isLive ? liveLabel(selected) : airportLabel(selected);
    }
    const s = AIRPORTS.find(a => a.code === value);
    return s ? airportLabel(s) : value;
  }

  const showDropdown = open && query.length > 0 &&
    (staticMatches.length > 0 || liveResults.length > 0 || searching);

  return (
    <div className={styles.field} ref={ref}>
      <label className={styles.label}>{label}</label>
      <div className={styles.wrap}>
        <span className={styles.icon}>{icon}</span>
        <input
          className={styles.inp}
          placeholder={placeholder}
          value={displayValue()}
          onFocus={() => { setOpen(true); setQuery(''); setLive([]); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          autoComplete="off"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="characters"
        />
        {searching && open && <span className={styles.spinner} />}
        {value && !searching && (
          <button className={styles.clear} onMouseDown={clear} aria-label="Clear">✕</button>
        )}

        {showDropdown && (
          <div className={styles.dropdown}>

            {/* Static quick results */}
            {staticMatches.length > 0 && (
              <>
                <div className={styles.groupLabel}>Quick results</div>
                {staticMatches.map(a => (
                  <div key={`s-${a.code}`} className={styles.option}
                    onMouseDown={() => pick(a, false)}>
                    <span className={styles.iata}>{a.code}</span>
                    <div className={styles.text}>
                      <div className={styles.city}>{a.city}{a.state ? `, ${a.state}` : ''}</div>
                      <div className={styles.name}>{a.name}</div>
                    </div>
                    {a.country !== 'US' && <span className={styles.ctry}>{a.country}</span>}
                  </div>
                ))}
              </>
            )}

            {/* Live results from whichever provider responded */}
            {liveResults.length > 0 && (
              <>
                <div className={styles.groupLabel}>
                  All airports worldwide
                  {liveSource && liveSource !== 'cache' && (
                    <span className={styles.providerTag}> · {liveSource}</span>
                  )}
                </div>
                {liveResults.map(a => (
                  <div key={`l-${a.code}`} className={`${styles.option} ${styles.liveOption}`}
                    onMouseDown={() => pick(a, true)}>
                    <span className={`${styles.iata} ${styles.iataLive}`}>{a.iata || a.code}</span>
                    <div className={styles.text}>
                      <div className={styles.city}>
                        {a.city}{a.state ? `, ${a.state}` : ''}
                        {a.country ? ` · ${a.country}` : ''}
                      </div>
                      <div className={styles.name}>{a.name}</div>
                    </div>
                    <span className={styles.livePill}>live</span>
                  </div>
                ))}
              </>
            )}

            {/* Searching indicator */}
            {searching && liveResults.length === 0 && (
              <div className={styles.searchingRow}>
                <span className={styles.spinnerInline} />
                Searching all airports worldwide…
              </div>
            )}

            {/* No results */}
            {!searching && staticMatches.length === 0 && liveResults.length === 0 && query.length >= 2 && (
              <div className={styles.none}>No airports found for "{query}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
