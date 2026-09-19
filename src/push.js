// Web Push client helpers. The browser subscribes here; the sending side is
// .github/workflows/daily-push.yml + scripts/push.mjs, which read the
// subscription from the PUSH_CONFIG repository secret.

import { VAPID_PUBLIC_KEY } from './push-config.js';

export const PUSH_CACHE = 'aph-push';
export const PUSH_LATEST = 'push/latest';

/** True when this browser can receive Web Push at all. */
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS Safari only exposes push to apps opened from the Home Screen. */
export function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function urlBase64ToUint8Array(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The active registration, or a rejection if the service worker never became ready. */
async function registration(ms = 4000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The service worker is not available.')), ms); });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function currentSubscription() {
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Ask permission and create (or reuse) the push subscription. */
export async function subscribe() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
}

/** The blob the user pastes into the PUSH_CONFIG repository secret. */
export function buildConfig({ subscription, sources, lang, hour, timeZone }) {
  return {
    version: 1,
    hour,
    timeZone,
    lang: lang || '',
    sources,
    subscriptions: [subscription.toJSON()],
  };
}

/** Show a local notification through the service worker (no push involved). */
export async function showLocalNotification(title, options) {
  const reg = await registration();
  return reg.showNotification(title, options);
}

/** The last pushed payload the service worker stored, or null. */
export async function readLatestPush() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(PUSH_CACHE);
    const res = await cache.match(PUSH_LATEST);
    return res ? res.json() : null;
  } catch {
    return null;
  }
}
