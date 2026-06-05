import { useState, useEffect, useRef } from 'react';
import { AIRPORTS, airportLabel } from '../airports.js';
import styles from './AirportPicker.module.css';

export default function AirportPicker({ label, icon, value, onChange, placeholder = 'Search city, airport, or code…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const ref = useRef(null);
  const selected = AIRPORTS.find(a => a.code === value);

  const filtered = query.length > 0
    ? AIRPORTS.filter(a => {
        const q = query.toLowerCase();
        return a.code.toLowerCase().startsWith(q) ||
               a.city.toLowerCase().includes(q) ||
               a.name.toLowerCase().includes(q) ||
               (a.state && a.state.toLowerCase().includes(q));
      }).slice(0, 16)
    : [];

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className={styles.field} ref={ref}>
      <label className={styles.label}>{label}</label>
      <div className={styles.wrap}>
        <span className={styles.icon}>{icon}</span>
        <input
          className={styles.inp}
          placeholder={placeholder}
          value={open ? query : (selected ? airportLabel(selected) : query)}
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          autoComplete="off"
          spellCheck={false}
        />
        {value && !open && (
          <button className={styles.clear} onMouseDown={() => { onChange(''); setQuery(''); }}>✕</button>
        )}
        {open && filtered.length > 0 && (
          <div className={styles.dropdown}>
            {filtered.map(a => (
              <div key={a.code} className={styles.option}
                onMouseDown={() => { onChange(a.code); setOpen(false); setQuery(''); }}>
                <span className={styles.iata}>{a.code}</span>
                <div className={styles.text}>
                  <div className={styles.city}>{a.city}{a.state ? `, ${a.state}` : ''}</div>
                  <div className={styles.name}>{a.name}</div>
                </div>
                {a.country !== 'US' && <span className={styles.ctry}>{a.country}</span>}
              </div>
            ))}
          </div>
        )}
        {open && query.length > 1 && filtered.length === 0 && (
          <div className={styles.dropdown}>
            <div className={styles.none}>No airports found for "{query}"</div>
          </div>
        )}
      </div>
    </div>
  );
}
