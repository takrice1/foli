/**
 * SubscriptionModal — shown when user taps "Upgrade to Pro"
 * or from the paywall. Handles both purchase and beta code entry.
 */
import { useState } from 'react';
import { MONTHLY_PRICE, ANNUAL_PRICE } from '../hooks/useSubscription.js';
import styles from './SubscriptionModal.module.css';

export default function SubscriptionModal({ sub, onClose }) {
  const [plan, setPlan]         = useState('monthly');
  const [betaCode, setBeta]     = useState('');
  const [betaError, setBetaErr] = useState('');
  const [betaSuccess, setBetaOk]= useState(false);
  const [showBeta, setShowBeta] = useState(false);

  function handleBeta() {
    const ok = sub.activateBeta(betaCode);
    if (ok) { setBetaOk(true); setTimeout(onClose, 1200); }
    else    { setBetaErr('Invalid code. Try again.'); }
  }

  async function handlePurchase() {
    await sub.purchase(plan);
  }

  if (betaSuccess) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.successWrap}>
            <div className={styles.successIcon}>🎉</div>
            <div className={styles.successTitle}>Beta Unlocked!</div>
            <div className={styles.successSub}>Welcome to FOLI Pro. Full access activated.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <div className={styles.icon}>✈</div>
        <h2 className={styles.title}>FOLI <span className={styles.pro}>Pro</span></h2>
        <p className={styles.tagline}>The flight intel every crew member needs</p>

        {/* Feature list */}
        <ul className={styles.features}>
          <li><span className={styles.check}>✓</span> Unlimited searches per day</li>
          <li><span className={styles.check}>✓</span> Today <em>and</em> tomorrow's schedules</li>
          <li><span className={styles.check}>✓</span> All airports worldwide</li>
          <li><span className={styles.check}>✓</span> All airlines — majors + regionals</li>
          <li><span className={styles.check}>✓</span> Local airport times with timezone</li>
          <li><span className={styles.check}>✓</span> Live data via FlightAware + backups</li>
        </ul>

        {/* Plan toggle */}
        <div className={styles.planToggle}>
          <button
            className={`${styles.planBtn} ${plan === 'monthly' ? styles.planActive : ''}`}
            onClick={() => setPlan('monthly')}
          >
            <span className={styles.planName}>Monthly</span>
            <span className={styles.planPrice}>${MONTHLY_PRICE}/mo</span>
          </button>
          <button
            className={`${styles.planBtn} ${plan === 'annual' ? styles.planActive : ''}`}
            onClick={() => setPlan('annual')}
          >
            <span className={styles.planName}>Annual</span>
            <span className={styles.planPrice}>${ANNUAL_PRICE}/yr</span>
            <span className={styles.planSave}>Save 33%</span>
          </button>
        </div>

        {/* CTA */}
        <button
          className={styles.ctaBtn}
          onClick={handlePurchase}
          disabled={sub.purchasing}
        >
          {sub.purchasing
            ? <span className={styles.spinner} />
            : plan === 'annual'
              ? `Start Pro — $${ANNUAL_PRICE}/year`
              : `Start Pro — $${MONTHLY_PRICE}/month`}
        </button>

        <p className={styles.cancel}>Cancel anytime · Renews automatically</p>

        {/* Restore */}
        <button className={styles.restoreBtn} onClick={() => {
          const ok = sub.restore();
          if (ok) onClose();
        }}>
          Restore purchase
        </button>

        {/* Beta code */}
        <div className={styles.betaSection}>
          {!showBeta ? (
            <button className={styles.betaToggle} onClick={() => setShowBeta(true)}>
              Have a beta code?
            </button>
          ) : (
            <div className={styles.betaRow}>
              <input
                className={styles.betaInput}
                placeholder="Enter beta code…"
                value={betaCode}
                onChange={e => { setBeta(e.target.value); setBetaErr(''); }}
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button className={styles.betaSubmit} onClick={handleBeta}>Unlock</button>
            </div>
          )}
          {betaError && <p className={styles.betaError}>{betaError}</p>}
        </div>

      </div>
    </div>
  );
}
