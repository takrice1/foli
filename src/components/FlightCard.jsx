import { fmtLocalTime, tzAbbr } from '../api.js';
import styles from './FlightCard.module.css';

function statusClass(s) {
  if (!s) return 'unknown';
  const l = s.toLowerCase();
  if (l.includes('cancel')) return 'cancelled';
  if (l.includes('active') || l.includes('route')) return 'active';
  if (l.includes('land') || l.includes('arriv')) return 'landed';
  if (l.includes('sched')) return 'scheduled';
  return 'unknown';
}

export default function FlightCard({ flight, rank, airportTz }) {
  const isFirst = rank === 'first';
  const sc = statusClass(flight.status);

  // Per-flight timezone if the provider sent one, else the queried airport's
  const depTz = flight.depTz || (flight.direction === 'dep' ? airportTz : null);
  const arrTz = flight.arrTz || (flight.direction === 'arr' ? airportTz : null);

  const depTime  = fmtLocalTime(flight.dispDep, depTz);
  const arrTime  = fmtLocalTime(flight.dispArr, arrTz);
  const depLabel = tzAbbr(flight.dispDep, depTz);
  const arrLabel = tzAbbr(flight.dispArr, arrTz);

  return (
    <div className={`${styles.card} ${isFirst ? styles.isFirst : styles.isLast}`}>
      <div className={styles.top}>
        <span className={`${styles.badge} ${isFirst ? styles.badgeFirst : styles.badgeLast}`}>
          {isFirst ? '🟢 First' : '🔴 Last'} {flight.direction === 'arr' ? 'Arrival' : 'Departure'}
        </span>
        <span className={styles.airline}>{flight.airline}</span>
      </div>
      <div className={styles.route}>
        <span className={styles.code}>{flight.origin}</span>
        <span className={styles.arrow}>✈</span>
        <span className={styles.code}>{flight.destination}</span>
      </div>
      <div className={styles.times}>
        <div className={styles.timeCol}>
          <div className={styles.time}>{depTime}</div>
          <div className={styles.timeLabel}>
            Departs
            {depLabel && <span className={styles.tzPill}>{depLabel}</span>}
          </div>
        </div>
        <div className={styles.mid}>
          <div className={styles.duration}>{flight.duration}</div>
          <div className={styles.divider} />
          <div className={styles.flightNum}>{flight.flightNumber}</div>
        </div>
        <div className={`${styles.timeCol} ${styles.right}`}>
          <div className={styles.time}>{arrTime}</div>
          <div className={styles.timeLabel}>
            Arrives
            {arrLabel && <span className={styles.tzPill}>{arrLabel}</span>}
          </div>
        </div>
      </div>
      <div className={styles.foot}>
        <span className={styles.stops}>Nonstop</span>
        {flight.aircraft && <span className={styles.aircraft}>{flight.aircraft}</span>}
        <span className={`${styles.status} ${styles[sc]}`}>{flight.status}</span>
      </div>
    </div>
  );
}
