import { useEffect, useState } from 'react';
import { Screen, TopBar, DemoNote, Spinner, ChainBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { loadStores, matchAtStore } from '../state/actions';
import { marketLabel } from '../lib/market';
import type { Store } from '../lib/types';

export function StorePick() {
  const zip = useApp(s => s.zip);
  const stores = useApp(s => s.stores);
  const current = useApp(s => s.store);
  const lines = useApp(s => s.lines);
  const [zipInput, setZipInput] = useState(zip);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState<{ store: Store; done: number; total: number } | null>(null);
  const source = stores[0]?.source;

  async function find(z = zipInput) {
    if (!/^\d{5}$/.test(z)) { setError('Enter a 5-digit US ZIP code.'); return; }
    setLoading(true); setError('');
    try { await loadStores(z); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  useEffect(() => { if (!stores.length) find(zip); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!lines.length) go('list', true); }, [lines.length]);

  async function choose(store: Store) {
    setChecking({ store, done: 0, total: lines.length });
    setError('');
    try {
      await matchAtStore(store, (done, total) => setChecking({ store, done, total }));
      go('confirm');
    } catch (e) {
      setError((e as Error).message);
      setChecking(null);
    }
  }

  const locationPanel = (
    <section className="loc-panel">
      <div className="market">
        <Icon name="pin" />
        <div>
          <b>Pilot market: {marketLabel(stores, zip)}</b>
          <small>{source === 'demo' ? 'Demo stores and prices are always from this market, whatever ZIP you enter.' : `Kroger-family stores near ${zip}.`}</small>
        </div>
      </div>

      <form className="zip-row" onSubmit={e => { e.preventDefault(); find(); }}>
        <label className="sr-only" htmlFor="zip">ZIP code</label>
        <input id="zip" className="sb-input" inputMode="numeric" maxLength={5} value={zipInput} onChange={e => setZipInput(e.target.value.replace(/\D/g, ''))} />
        <button className="sb-btn" type="submit" disabled={loading}>{loading ? <Spinner /> : 'Find stores'}</button>
      </form>
    </section>
  );

  if (checking) {
    const pct = checking.total ? checking.done / checking.total : 0;
    return (
      <Screen top={<TopBar progress={0.45} right={<span className="icon-spacer" />} />}>
        <div className="checking">
          <Spinner label="Checking prices" />
          <h1 className="h-screen">Checking {checking.total} items at {checking.store.name}</h1>
          <div className="sb-progress"><i style={{ width: `${Math.max(6, pct * 100)}%` }} /></div>
          <p className="hint">{checking.done} of {checking.total} done. We look up each item and every cheaper equivalent with the same size and variant.</p>
          <ul className="ticker" aria-hidden="true">
            {lines.slice(0, checking.done + 1).slice(-5).map((l, i, arr) => (
              <li key={l.id} className={i === arr.length - 1 && checking.done < checking.total ? 'now' : 'ok'}>
                {i === arr.length - 1 && checking.done < checking.total ? <Spinner /> : <Icon name="check" size={16} strokeWidth={3} />}
                {[l.brand, l.description].filter(Boolean).join(' ')}
              </li>
            ))}
          </ul>
          <DemoNote inline source={checking.store.source} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen top={<TopBar backTo="list" progress={0.4} />} aside={locationPanel} asidePlacement="before">
      <h1 className="h-screen">Where do you usually shop?</h1>
      <p className="lede sm">Pick your Kroger store. We check shelf prices at that exact store, not a national average.</p>

      {error && <p className="error-note" role="alert">{error}</p>}

      {loading && !stores.length && <p className="hint"><Spinner /> Finding stores near {zipInput}…</p>}
      {stores.length > 0 && (
        <section>
          <h2 className="h-sub">Kroger-family stores <span className="muted">· {source === 'kroger' ? 'live prices' : 'demo prices'}</span></h2>
          <ul className="stores" aria-label="Kroger-family stores">
            {stores.map((s, i) => (
              <li key={s.id} style={{ ['--i' as string]: i }}>
                <button type="button" className={`store-card ${current?.id === s.id ? 'is-current' : ''}`} onClick={() => choose(s)}>
                  <ChainBadge chain={s.chain} />
                  <span className="store-main"><b>{s.name.replace(' (demo)', '')}</b><small>{s.address}</small></span>
                  <Icon name="next" size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {source && <DemoNote source={source} />}
    </Screen>
  );
}
