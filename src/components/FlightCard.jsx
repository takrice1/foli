import styles from './FlightCard.module.css';

function statusClass(s) {
  if (!s) return 'unknown';
  const l = s.toLowerCase();
  if (l.includes('cancel')) return 'cancelled';
  if (l.includes('active') || l.includes('en route')) return 'active';
  if (l.includes('land') || l.includes('arrived')) return 'landed';
  if (l.includes('sched')) return 'scheduled';
  return 'unknown';
}

export default function FlightCard({ flight, rank }) {
  const isFirst = rank === 'first';
  const sc = statusClass(flight.status);
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
          <div className={styles.time}>{flight.departureTime}</div>
          <div className={styles.timeLabel}>Departs</div>
        </div>
        <div className={styles.mid}>
          <div className={styles.duration}>{flight.duration}</div>
          <div className={styles.divider} />
          <div className={styles.flightNum}>{flight.flightNumber}</div>
        </div>
        <div className={`${styles.timeCol} ${styles.right}`}>
          <div className={styles.time}>{flight.arrivalTime}</div>
          <div className={styles.timeLabel}>Arrives</div>
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
