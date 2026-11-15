import { useEffect, useState } from 'react';
import { Screen, TopBar, Spinner, ChainBadge, Money, DemoNote, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { quoteAllStores, switchStore } from '../state/actions';
import { usd } from '../lib/money';
import { productName } from '../lib/engine';

/**
 * Same basket at the other Kroger-family stores near the ZIP. Needs live prices: the demo catalog has
 * no per-store data worth comparing, so in demo mode this screen only says so. Prices are fetched
 * when the shopper presses the button, never on opening the screen.
 */
export function Compare() {
  const c = useApp(s => s.comparison);
  const home = useApp(s => s.store);
  const stores = useApp(s => s.stores);
  const quotes = useApp(s => s.quotes);
  const quoting = useApp(s => s.quoting);
  const [open, setOpen] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!c) go('welcome', true); }, [c]);
  if (!c || !home) return null;

  const live = home.source === 'kroger';
  const nearby = stores.filter(s => s.id !== home.id && s.source === 'kroger');
  const homeQ = quotes.find(q => q.isHome);
  const homeTotal = homeQ?.totalCents ?? c.chosenCents;
  const cheapest = [...quotes].sort((a, b) => a.totalCents - b.totalCents)[0];

  async function run() {
    setError('');
    try { await quoteAllStores(); } catch (e) { setError((e as Error).message); }
  }

  async function moveTo(id: string) {
    setSwitching(id);
    try { await switchStore(id); toast('Switched your store. Same list, new prices.'); go('result'); }
    catch (e) { toast((e as Error).message); }
    finally { setSwitching(null); }
  }

  if (!live) {
    return (
      <Screen top={<TopBar backTo="result" title="Compare stores" />} className="narrow">
        <h1 className="h-screen">Store comparison needs live prices</h1>
        <p className="lede sm">Comparing Kroger-family stores only makes sense with real shelf prices from each store. This build is showing demo prices, so there is nothing honest to compare yet.</p>
        <DemoNote source="demo" />
        <button className="sb-btn" type="button" onClick={() => go('result')}>Back to your basket</button>
      </Screen>
    );
  }

  const summary = (
    <section className="cmp-summary">
      <p className="eyebrow">Your store</p>
      <b>{home.name}</b>
      <span className="mono">{usd(homeTotal)}</span>
      <button className="sb-cta" type="button" onClick={() => go('shop')}>Open my shopping list</button>
    </section>
  );

  return (
    <Screen top={<TopBar backTo="result" title="Compare stores" />} aside={summary} asidePlacement="before">
      <h1 className="h-screen">The same basket at nearby Kroger stores</h1>
      <p className="lede sm">Same {c.pricedCount} items, same sizes and variants. Your locked items keep their brand everywhere.</p>

      {!quotes.length && (
        <>
          <button className="sb-cta" type="button" onClick={run} disabled={quoting || !nearby.length}>
            {quoting ? <><Spinner /> Checking {Math.min(4, nearby.length)} stores…</> : nearby.length ? `Check ${Math.min(4, nearby.length)} nearby Kroger stores` : 'No other Kroger stores found near you'}
          </button>
          <p className="hint">This looks up every item at each store, so it takes a few seconds and uses live price requests. It only runs when you ask.</p>
        </>
      )}
      {error && <p className="error-note" role="alert">{error}</p>}

      <ul className="store-quotes">
        {quotes.map((q, i) => {
          const diff = q.totalCents - homeTotal;
          const missing = q.lines.filter(l => !l.pick);
          const isOpen = open === q.store.id;
          return (
            <li key={q.store.id} className={`sq ${q.isHome ? 'home' : ''} ${cheapest?.store.id === q.store.id ? 'best' : ''}`} style={{ ['--i' as string]: i }}>
              <button type="button" className="sq-head" onClick={() => setOpen(isOpen ? null : q.store.id)} aria-expanded={isOpen}>
                <ChainBadge chain={q.store.chain} />
                <span className="sq-name"><b>{q.store.name}</b><small>{q.covered} of {c.pricedCount} items · live</small></span>
                <span className="sq-total">
                  <Money cents={q.totalCents} />
                  {q.isHome ? <small>your store</small> : <small className={diff < 0 ? 'save-txt' : 'up-txt'}>{diff < 0 ? `${usd(-diff)} less` : `${usd(diff)} more`}</small>}
                </span>
                <Icon name="down" size={18} className={`chev ${isOpen ? 'up' : ''}`} />
              </button>
              <div className="sq-bar"><i style={{ width: `${Math.min(100, (q.totalCents / Math.max(...quotes.map(x => x.totalCents), 1)) * 100)}%` }} /></div>
              {isOpen && (
                <div className="sq-body">
                  <ul className="plain-list">
                    {q.lines.map(l => (
                      <li key={l.lineId}>
                        <span>{l.pick ? productName(l.pick.product) : l.label}{l.pick && l.pick.packages > 1 ? ` ×${l.pick.packages}` : ''}</span>
                        <small className={l.pick ? '' : 'up-txt'}>{l.pick ? usd(l.pick.cents) : 'not carried'}</small>
                      </li>
                    ))}
                  </ul>
                  {missing.length > 0 && <p className="hint">{missing.length} item{missing.length === 1 ? '' : 's'} not carried here, so that total covers fewer items.</p>}
                  {!q.isHome && (
                    <button type="button" className="sb-btn" disabled={!!switching} onClick={() => moveTo(q.store.id)}>
                      {switching === q.store.id ? <Spinner /> : <Icon name="store" size={18} />} Make this my store
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
