/**
 * App state: one small external store (useSyncExternalStore), persisted to IndexedDB.
 * Credentials are NOT here – they live in lib/credentials.ts, memory only.
 */
import { useSyncExternalStore } from 'react';
import type { Comparison, ListLine, MatchedLine, Prefs, Store } from '../lib/types';
import type { StoreQuote } from '../lib/multistore';
import * as db from '../lib/db';
import { NO_ENTITLEMENT, type Entitlement } from '../lib/entitlement';

export interface ShoppingEvent {
  id: string;            // `${basketId}:${weekStart}` – one counted entry per basket per week
  weekKey: string;
  basketId: string;
  comparisonId: string;
  occurredAt: string;
  recordedAt: string;
  source: 'tap' | 'voice' | 'receipt';
  purchasedLineIds: string[];
  savingCents: number;   // estimated, confirmed purchased substituted lines only
  plannedCents: number;
  paidCents: number | null;
  demo: boolean;
  categories?: Array<{ name: string; savingCents: number }>;
}

export interface AppState {
  booted: boolean;
  dbOk: boolean;
  listText: string;
  lines: ListLine[];
  zip: string;
  stores: Store[];
  store: Store | null;
  matched: MatchedLine[];
  locks: string[];
  prefs: Prefs;
  comparison: Comparison | null;
  history: Comparison[];
  basketId: string;
  basketVersion: number;
  checked: string[];
  events: ShoppingEvent[];
  usedAIParse: boolean;
  quotes: StoreQuote[];
  quoting: boolean;
  entitlement: Entitlement;
}

const fresh = (): AppState => ({
  booted: false,
  dbOk: true,
  listText: '',
  lines: [],
  zip: '45202',
  stores: [],
  store: null,
  matched: [],
  locks: [],
  prefs: { brandLocks: [] },
  comparison: null,
  history: [],
  basketId: `b_${Math.random().toString(36).slice(2, 10)}`,
  basketVersion: 0,
  checked: [],
  events: [],
  usedAIParse: false,
  quotes: [],
  quoting: false,
  entitlement: { ...NO_ENTITLEMENT },
});

let state: AppState = fresh();
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach(l => l());
  schedulePersist();
}

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    fn => { listeners.add(fn); return () => listeners.delete(fn); },
    () => select(state),
  );
}

/* ---------- persistence ---------- */
const PERSIST_KEYS = ['listText', 'lines', 'zip', 'stores', 'store', 'matched', 'locks', 'prefs', 'comparison', 'basketId', 'basketVersion', 'checked', 'quotes'] as const;
let timer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (!state.booted || !state.dbOk) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const snap: Record<string, unknown> = { id: 'current', savedAt: new Date().toISOString() };
    for (const k of PERSIST_KEYS) snap[k] = state[k];
    db.put('app', snap as { id: string }).catch(() => setState({ dbOk: false }));
  }, 250);
}

/** Membership lives in its own record so it survives "Clear my data" (which is about the basket and history). */
export function setEntitlement(patch: Partial<Entitlement>): void {
  const entitlement = { ...state.entitlement, ...patch };
  setState({ entitlement });
  if (state.dbOk) db.put('app', { id: 'entitlement', ...entitlement }).catch(() => undefined);
}

export async function boot(): Promise<void> {
  const ok = await db.available();
  if (!ok) { setState({ booted: true, dbOk: false }); return; }
  try {
    const stored = await db.get<Entitlement & { id: string }>('app', 'entitlement');
    if (stored) state = { ...state, entitlement: { ...NO_ENTITLEMENT, member: !!stored.member, period: stored.period ?? null, since: stored.since ?? null, freeRepricesUsed: Number(stored.freeRepricesUsed) || 0 } };
    const snap = await db.get<Partial<AppState> & { id: string }>('app', 'current');
    const events = await db.all<ShoppingEvent>('shoppingEvents');
    const history = (await db.all<Comparison>('comparisons')).sort((a, b) => a.fetchEndedAt.localeCompare(b.fetchEndedAt));
    const restored: Partial<AppState> = {};
    if (snap) for (const k of PERSIST_KEYS) if (snap[k] !== undefined) (restored as Record<string, unknown>)[k] = snap[k];
    state = { ...state, ...restored, events, history, booted: true, dbOk: true };
    listeners.forEach(l => l());
  } catch {
    setState({ booted: true, dbOk: false });
  }
}

export async function clearMyData(): Promise<void> {
  const { entitlement } = state;
  try {
    await db.clearAll();
    if (entitlement.member || entitlement.freeRepricesUsed) await db.put('app', { id: 'entitlement', ...entitlement });
  } catch { /* storage may be unavailable */ }
  const keep = { booted: true, dbOk: state.dbOk, entitlement };
  state = { ...fresh(), ...keep };
  listeners.forEach(l => l());
}
