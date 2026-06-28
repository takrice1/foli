/**
 * Paywall — shown after 3 free searches are used up.
 * Soft gate: explains the limit and prompts upgrade.
 */
import styles from './Paywall.module.css';

export default function Paywall({ onUpgrade, onDismiss }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>✈</div>
      <h3 className={styles.title}>You've used your 3 free searches</h3>
      <p className={styles.body}>
        Upgrade to <strong>FOLI Pro</strong> for unlimited searches,
        tomorrow's schedules, and live data across every airline worldwide.
      </p>
      <div className={styles.priceRow}>
        <span className={styles.price}>$4.99</span>
        <span className={styles.per}>/month</span>
        <span className={styles.or}>or</span>
        <span className={styles.price}>$39.99</span>
        <span className={styles.per}>/year</span>
      </div>
      <button className={styles.upgradeBtn} onClick={onUpgrade}>
        Upgrade to Pro
      </button>
      <button className={styles.dismissBtn} onClick={onDismiss}>
        Maybe later
      </button>
      <p className={styles.reset}>Free searches reset daily at midnight.</p>
    </div>
  );
}
