/**
 * One place that notices when our own server (Render free host) is unreachable or still waking up,
 * so the shopper gets a friendly note instead of a silent failure.
 *
 * What counts as "the server is down or asleep":
 *  - the request never arrives (network error or timeout), unless the device is simply offline, or
 *  - a gateway answer (502, 503, 504) that is not JSON. Our own server always answers in JSON, so a
 *    non-JSON gateway page means Render itself is answering, not us. Our own "busy" and daily-limit
 *    answers are JSON and do not trigger this.
 */
export const BACKEND_SLEEPY_MESSAGE =
  "Hey, sorry! Our server runs on a free host and it's still waking up. Please wait a few seconds and reload the page.";

const COOLDOWN_MS = 20_000;
const listeners = new Set<() => void>();
let lastReport = 0;

let pending = false; // trouble seen before anything was listening (the first status check runs before the page mounts)

export function onBackendTrouble(fn: () => void): () => void {
  listeners.add(fn);
  if (pending) { pending = false; fn(); }
  return () => { listeners.delete(fn); };
}

/** Tells every listener, at most once every 20 seconds. */
export function reportBackendTrouble(): void {
  const now = Date.now();
  if (now - lastReport < COOLDOWN_MS) return;
  lastReport = now;
  if (!listeners.size) { pending = true; return; }
  listeners.forEach(fn => fn());
}

export function isGatewayTrouble(res: Response): boolean {
  return [502, 503, 504].includes(res.status) && !(res.headers.get('content-type') ?? '').toLowerCase().includes('json');
}

/** Test hook: forget the cooldown. */
export function resetBackendReports(): void {
  lastReport = 0;
  pending = false;
}

/** fetch() for calls to our own server. Same behaviour, plus it reports a sleeping or unreachable server. */
export async function proxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (e) {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) reportBackendTrouble();
    throw e;
  }
  if (isGatewayTrouble(res)) reportBackendTrouble();
  return res;
}
