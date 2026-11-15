import { BACKEND_SLEEPY_MESSAGE, onBackendTrouble } from '../lib/backend';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import type { Product } from '../lib/types';
import { fmtTime } from '../lib/week';
import { isOperator } from '../lib/operator';
import { DEMO_UNLOCK, MONTH_LABEL, YEAR_LABEL } from '../lib/pricing';
import { isStoreBrand } from '../lib/vocab';
import { back, go, useRoute, type Route } from '../state/router';
import { resetAll, setEntitlement, useApp } from '../state/store';
import { hasKroger, subscribeCreds } from '../lib/credentials';
import { clearSearchCache } from '../lib/kroger';
import { usd } from '../lib/money';
import { setThemePref, useTheme } from '../lib/theme';

/* ---------- theme ---------- */
/** One-tap switch between light and dark. Settings also offers "follow the device". */
export function ThemeToggle() {
  const { theme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="icon-btn" type="button" onClick={() => setThemePref(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

/* ---------- breakpoints ---------- */
export function useDesktop(): boolean {
  const q = '(min-width: 1024px)';
  const [d, setD] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setD(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

/* ---------- motion ---------- */
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts from the previous value to the new one, so money "flows" instead of jumping. */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(reduced() ? target : 0);
  useEffect(() => {
    if (reduced()) { setV(target); from.current = target; return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Money({ cents, className, sign }: { cents: number; className?: string; sign?: boolean }) {
  const v = useCountUp(cents);
  return <span className={`sb-money ${className ?? ''}`}>{sign && cents > 0 ? '−' : ''}{usd(v)}</span>;
}

/* ---------- layout ---------- */
/**
 * Mobile: top · (aside if before) · children · (aside if after) · sticky footer.
 * Laptop: top across · main column + sticky aside (with the footer CTA inside it).
 */
export function Screen({ children, footer, aside, top, asidePlacement = 'after', className = '', deskFooter = 'aside' }: {
  children: ReactNode; footer?: ReactNode; aside?: ReactNode; top?: ReactNode;
  asidePlacement?: 'before' | 'after'; className?: string; deskFooter?: 'aside' | 'main';
}) {
  const desktop = useDesktop();
  if (desktop) {
    const footInAside = aside && deskFooter === 'aside';
    return (
      <div className={`screen desk ${aside ? 'has-aside' : ''} ${className}`}>
        {top && <div className="desk-top">{top}</div>}
        <div className="desk-grid">
          <main className="screen-body flow">
            {children}
            {footer && !footInAside && <div className="desk-foot">{footer}</div>}
          </main>
          {aside && (
            <aside className="screen-aside">
              <div className="aside-inner flow">
                {aside}
                {footer && footInAside && <div className="desk-foot">{footer}</div>}
              </div>
            </aside>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={`screen ${className}`}>
      <main className="screen-body flow">
        {top}
        {aside && asidePlacement === 'before' && aside}
        {children}
        {aside && asidePlacement === 'after' && aside}
      </main>
      {footer && <div className="screen-foot">{footer}</div>}
    </div>
  );
}

export function TopBar({ backTo, progress, title, right }: { backTo?: Route; progress?: number; title?: string; right?: ReactNode }) {
  return (
    <header className="topbar">
      {backTo ? (
        <button className="icon-btn" type="button" onClick={() => back(backTo)} aria-label="Back"><Icon name="back" /></button>
      ) : <span className="icon-spacer" />}
      {progress != null ? (
        <div className="sb-progress topbar-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <i style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      ) : <h1 className="topbar-title">{title}</h1>}
      <span className="topbar-right">{right ?? <button className="icon-btn" type="button" onClick={() => go('settings')} aria-label="Settings"><Icon name="settings" /></button>}</span>
    </header>
  );
}

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <button type="button" className="brand" onClick={onClick ?? (() => go('welcome'))}>
      <span className="brand-mark"><Icon name="basket" size={16} strokeWidth={2.4} /></span>
      <span>Pro<b>Groceries</b></span>
    </button>
  );
}

/* ---------- app navigation ---------- */
const FUNNEL: Array<{ r: Route; label: string }> = [
  { r: 'list', label: 'List' }, { r: 'store', label: 'Store' }, { r: 'confirm', label: 'Confirm' },
  { r: 'result', label: 'Cheaper basket' }, { r: 'shop', label: 'Shop' },
];
const TABS: Array<{ r: Route; label: string; icon: string }> = [
  { r: 'home', label: 'Basket', icon: 'basket' },
  { r: 'compare', label: 'Stores', icon: 'store' },
  { r: 'shop', label: 'List', icon: 'list' },
  { r: 'report', label: 'Weekly', icon: 'chart' },
];
/** Store comparison needs live Kroger prices, so the tab only exists then. */
function useTabs() {
  const live = usePriceSource() === 'kroger';
  return TABS.filter(t => t.r !== 'compare' || live);
}

/** Laptop header: brand, step tracker during the funnel, and every feature one click away. */
export function AppHeader() {
  const route = useRoute();
  const hasBasket = useApp(s => !!s.comparison);
  const tabs = useTabs();
  const idx = FUNNEL.findIndex(f => f.r === route);
  return (
    <header className="app-header">
      <div className="ah-inner">
        <Brand onClick={() => go(hasBasket ? 'home' : 'welcome')} />
        {idx >= 0 ? (
          <ol className="stepper" aria-label="Steps">
            {FUNNEL.map((f, i) => (
              <li key={f.r} className={i < idx ? 'done' : i === idx ? 'now' : ''}><span>{i + 1}</span>{f.label}</li>
            ))}
          </ol>
        ) : (
          <nav className="ah-nav" aria-label="Main">
            {hasBasket ? tabs.map(t => (
              <button key={t.r} type="button" className={route === t.r ? 'on' : ''} onClick={() => go(t.r)}>{t.label}</button>
            )) : (
              <>
                <a href="#how" onClick={e => { if (route !== 'welcome') { e.preventDefault(); go('welcome'); } }}>How it works</a>
                <a href="#features" onClick={e => { if (route !== 'welcome') { e.preventDefault(); go('welcome'); } }}>Features</a>
              </>
            )}
          </nav>
        )}
        <div className="ah-right">
          <DemoNote inline />
          <ResetButton />
          <ThemeToggle />
          <button className="icon-btn" type="button" onClick={() => go('settings')} aria-label="Settings"><Icon name="settings" /></button>
          {!hasBasket && route === 'welcome' && <button type="button" className="sb-cta sm" onClick={() => go('list')}>Start</button>}
        </div>
      </div>
    </header>
  );
}

/** Phone tab bar for the everyday screens once a basket exists. */
export function TabBar() {
  const route = useRoute();
  const tabs = useTabs();
  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map(t => (
        <button key={t.r} type="button" className={route === t.r || (t.r === 'home' && route === 'welcome') ? 'on' : ''} onClick={() => go(t.r)}>
          <Icon name={t.icon} size={22} /><span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ---------- product thumbnail ---------- */
export function Thumb({ p, size = 44 }: { p: Product | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (p?.image && !broken) {
    return <span className="thumb" style={{ width: size, height: size }}><img src={p.image} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
  }
  const brand = p?.brand || '?';
  const initials = brand.replace(/[^A-Za-z& ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className={`thumb thumb-text ${p && isStoreBrand(p.brand) ? 'is-store' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      {initials || '•'}
    </span>
  );
}

export function ChainBadge({ chain }: { chain: string }) {
  return <span className="chain chain-kroger">{chain === 'KROGER' ? 'Kroger' : chain.charAt(0) + chain.slice(1).toLowerCase()}</span>;
}

/* ---------- labels ---------- */
export type PriceSource = 'kroger' | 'demo';

/**
 * Where the prices on screen come from: the current comparison's own source, else the chosen store's,
 * else whether live Kroger prices are connected. Never inferred from a key the shopper typed.
 */
export function usePriceSource(): PriceSource {
  const live = useLive();
  const fromState = useApp(s => s.comparison?.source ?? s.store?.source ?? null);
  return fromState ?? (live ? 'kroger' : 'demo');
}

/** "Demo prices" label. Pass `source` where a screen shows one specific comparison or event. */
export function DemoNote({ inline = false, source }: { inline?: boolean; source?: PriceSource }) {
  const auto = usePriceSource();
  if ((source ?? auto) === 'kroger') return null;
  const cls = `demo-note ${inline ? 'inline' : ''}`;
  if (!isOperator()) return <span className={cls}><Icon name="info" size={14} /> Demo prices</span>;
  return (
    <button type="button" className={cls} onClick={() => go('settings')}>
      <Icon name="info" size={14} /> Demo prices
    </button>
  );
}

/** Everything the shopper needs to check a price: store, product ID, regular / sale, when, and from where. */
export function PriceDetails({ items, storeName }: { items: Array<{ heading?: string; product: Product }>; storeName: string }) {
  return (
    <details className="price-details">
      <summary>Price details</summary>
      {items.map(({ heading, product: p }) => (
        <dl key={`${heading}${p.productId}`}>
          {heading && <dt className="pd-head">{heading}</dt>}
          <dt>Store</dt><dd>{storeName.replace(' (demo)', '')} · ID {p.storeId}</dd>
          <dt>Product ID</dt><dd className="mono">{p.productId}{p.upc ? ` · UPC ${p.upc}` : ''}</dd>
          <dt>Regular price</dt><dd className="mono">{usd(p.regularCents)}</dd>
          <dt>Sale price</dt><dd className="mono">{p.promoCents != null ? `${usd(p.promoCents)}${p.promoNeedsCard ? ' · with the free Kroger card' : ''}` : 'none'}</dd>
          <dt>Price fetched</dt><dd>{fmtTime(p.fetchedAt)}</dd>
          <dt>Source</dt><dd>{p.source === 'kroger' ? 'Kroger API' : 'Demo catalog (illustrative, not live)'}</dd>
        </dl>
      ))}
    </details>
  );
}

/**
 * Clears the basket, history, membership and cached prices on this device and returns to the start.
 * First tap arms it ("Tap again to clear"), second tap within 3 seconds does it, so a stray tap
 * in the middle of a demo does nothing.
 */
export function ResetButton({ className = 'text-btn' }: { className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  async function press() {
    if (!armed) { setArmed(true); return; }
    setArmed(false);
    await resetAll();
    clearSearchCache();
    go('welcome', true);
    toast('Reset. Basket, history and membership are cleared. Fresh start.', 4000);
  }
  return (
    <button type="button" className={`${className} reset-btn ${armed ? 'is-armed' : ''}`} onClick={press} aria-live="polite"
      title="Clear the basket, history and membership on this device">
      <Icon name="refresh" size={16} />{armed ? 'Tap again to clear' : 'Reset'}
    </button>
  );
}

export function useMember(): boolean {
  return useApp(s => s.entitlement.member);
}

/** Shown in place of a member feature once the free allowance is used up. */
export function UpgradeCard({ title, body }: { title: string; body: string }) {
  function open() {
    if (!DEMO_UNLOCK) { go('plan'); return; }
    setEntitlement({ member: true, period: 'year', since: new Date().toISOString() });
    toast('Membership is open for the demo. Every member feature is unlocked.', 5000);
  }
  return (
    <section className="upgrade-card" aria-label={title}>
      <span className="uc-ic"><Icon name="lock" size={20} /></span>
      <div className="uc-main">
        <b>{title}</b>
        <p>{body}</p>
        <p className="uc-price mono">{YEAR_LABEL} · or {MONTH_LABEL}</p>
      </div>
      <button type="button" className="sb-cta sm" onClick={open}>See membership</button>
      {DEMO_UNLOCK && <p className="uc-demo">Demo: opens everything on this device. No payment.</p>}
    </section>
  );
}
export function useLive(): boolean {
  const [live, setLive] = useState(hasKroger());
  useEffect(() => subscribeCreds(() => setLive(hasKroger())), []);
  return live;
}

export function Spinner({ label }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label ?? 'Loading'} />;
}

/* ---------- bottom sheet ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A real modal: focus moves in when it opens, Tab and Shift+Tab stay inside, Escape closes, the page
 * behind is inert, and focus returns to whatever opened it.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const startAt = items().find(el => !el.classList.contains('icon-btn')) ?? items()[0] ?? panel.current;
    startAt?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const inside = panel.current?.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-wrap" onClick={onClose}>
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={e => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
/* ---------- toast ---------- */
let pushToast: (t: string, ms?: number) => void = () => undefined;
export function toast(text: string, ms?: number) { pushToast(text, ms); }

export function Toasts() {
  const [items, setItems] = useState<Array<{ id: number; text: string }>>([]);
  useEffect(() => {
    pushToast = (text, ms = 3200) => {
      const id = Date.now() + Math.random();
      setItems(x => [...x.slice(-2), { id, text }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), ms);
    };
    // Our server runs on a free host that sleeps: say so kindly, and leave the note up long enough to read.
    return onBackendTrouble(() => toast(BACKEND_SLEEPY_MESSAGE, 10_000));
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map(i => <div key={i.id} className="toast">{i.text}</div>)}
    </div>
  );
}

export function StorageNote() {
  const dbOk = useApp(s => s.dbOk);
  if (dbOk) return null;
  return <p className="warn-note">This browser isn't saving your basket. Copy your list before you close the tab.</p>;
}
