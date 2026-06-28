/**
 * useSubscription — FOLI subscription state manager
 *
 * Tiers:
 *   free  — 3 searches/day, today only
 *   pro   — unlimited searches, today + tomorrow, $4.99/month
 *   beta  — unlimited, unlocked via beta code, no charge
 *
 * Beta code: FOLIBETA (give to flight attendants during testing)
 *
 * In production: swap purchase() to call RevenueCat SDK or StoreKit 2.
 */

import { useState, useEffect, useCallback } from 'react';
import { getPlan } from '../auth.js';

const STORAGE_KEY   = 'foli_sub';
const SEARCHES_KEY  = 'foli_searches';
export const FREE_LIMIT    = 3;
export const BETA_CODE     = 'FOLIBETA';
export const MONTHLY_PRICE = 4.99;
export const ANNUAL_PRICE  = 39.99;

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function loadSub() {
  try {
    // Server-granted plan (stored on login) takes priority over client-side sub
    const jwtPlan = getPlan();
    if (jwtPlan === 'beta' || jwtPlan === 'pro') {
      return { tier: jwtPlan, source: 'jwt' };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSub(sub) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sub)); } catch {}
}

function loadSearchCount() {
  try {
    const raw    = localStorage.getItem(SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed[todayKey()] || 0;
  } catch { return 0; }
}

function saveSearchCount(n) {
  try {
    localStorage.setItem(SEARCHES_KEY, JSON.stringify({ [todayKey()]: n }));
  } catch {}
}

export function useSubscription() {
  const [sub, setSub]           = useState(() => loadSub());
  const [searchCount, setCount] = useState(() => loadSearchCount());
  const [showPaywall, setPaywall] = useState(false);
  const [showModal, setModal]   = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const tier  = sub?.tier || 'free';
  const isPro = tier === 'pro' || tier === 'beta';
  const isBeta = tier === 'beta';

  // Check subscription expiry on mount
  useEffect(() => {
    if (sub?.tier === 'pro' && sub?.expiresAt) {
      if (Date.now() > new Date(sub.expiresAt).getTime()) {
        const expired = { ...sub, tier: 'free', expiresAt: null };
        setSub(expired);
        saveSub(expired);
      }
    }
  }, []);

  const canSearch          = useCallback(() => isPro || searchCount < FREE_LIMIT, [isPro, searchCount]);
  const canSearchTomorrow  = isPro;
  const searchesRemaining  = isPro ? Infinity : Math.max(0, FREE_LIMIT - searchCount);

  const recordSearch = useCallback(() => {
    if (isPro) return;
    const next = searchCount + 1;
    setCount(next);
    saveSearchCount(next);
    if (next >= FREE_LIMIT) {
      setTimeout(() => setPaywall(true), 900);
    }
  }, [isPro, searchCount]);

  function activateBeta(code) {
    if (code.trim().toUpperCase() === BETA_CODE) {
      const s = { tier: 'beta', activatedAt: new Date().toISOString() };
      setSub(s); saveSub(s);
      return true;
    }
    return false;
  }

  async function purchase(plan = 'monthly') {
    setPurchasing(true);
    // ── PRODUCTION: replace this block with RevenueCat / StoreKit call ──
    // e.g. await Purchases.purchasePackage(package)
    // or   await stripe.redirectToCheckout({ sessionId })
    await new Promise(r => setTimeout(r, 1400)); // simulate store latency
    const months    = plan === 'annual' ? 12 : 1;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + months);
    const s = {
      tier: 'pro', plan,
      activatedAt: new Date().toISOString(),
      expiresAt:   expiresAt.toISOString(),
      price:       plan === 'annual' ? ANNUAL_PRICE : MONTHLY_PRICE,
    };
    setSub(s); saveSub(s);
    setPurchasing(false);
    setModal(false);
    setPaywall(false);
    return { success: true };
    // ────────────────────────────────────────────────────────────────────
  }

  function restore() {
    // PRODUCTION: call Purchases.restorePurchases() here
    const stored = loadSub();
    if (stored?.tier === 'pro' || stored?.tier === 'beta') {
      setSub(stored);
      return true;
    }
    return false;
  }

  return {
    tier, isPro, isBeta,
    searchCount, searchesRemaining,
    showPaywall, showModal, purchasing,
    canSearch, canSearchTomorrow,
    recordSearch, purchase, restore, activateBeta,
    openPaywall:  () => setPaywall(true),
    closePaywall: () => setPaywall(false),
    openModal:    () => setModal(true),
    closeModal:   () => setModal(false),
  };
}
