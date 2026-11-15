import { useEffect, useState } from 'react';
import { Screen, TopBar, Thumb, Sheet, DemoNote } from '../components/ui';
import { Icon } from '../components/Icon';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { answer, runComparison } from '../state/actions';
import { eligiblePrice, productName } from '../lib/engine';
import { usd } from '../lib/money';
import type { MatchedLine, Product } from '../lib/types';

function PriceTag({ p }: { p: Product }) {
  const { cents, usedPromo } = eligiblePrice(p);
  return (
    <span className="price-col">
      <b className="sb-price">{usd(cents)}</b>
      {usedPromo && <small className="promo-txt">sale{p.promoNeedsCard ? ' · card' : ''}</small>}
    </span>
  );
}

function Question({ m, index, total }: { m: MatchedLine; index: number; total: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  function pick(p: Product | null) {
    setPicked(p?.productId ?? 'none');
    setTimeout(() => answer(m.line.id, p), 220);
  }
  return (
    <>
      <p className="q-count">Question {index + 1} of {total}</p>
      <div className="q-ctx">Your list says <code>{m.line.raw}</code></div>
      <h1 className="h-screen">Which one do you usually buy?</h1>
      <div className="options" role="radiogroup" aria-label={`Options for ${m.line.raw}`}>
        {m.options.map(p => (
          <button key={p.productId} type="button" role="radio" aria-checked={picked === p.productId}
            className="sb-option opt-product" onClick={() => pick(p)}>
            <Thumb p={p} />
            <span className="opt-main"><b>{productName(p)}</b><small>{p.sizeLabel}</small></span>
            <PriceTag p={p} />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={picked === 'none'} className="sb-option opt-none" onClick={() => pick(null)}>
          None of these, leave it out
        </button>
      </div>
      <p className="hint">We compare against what you actually buy, so the saving is real.</p>
    </>
  );
}

export function Confirm() {
  const matched = useApp(s => s.matched);
  const store = useApp(s => s.store);
  const [changing, setChanging] = useState<MatchedLine | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!matched.length) go('list', true); }, [matched.length]);

  const asks = matched.filter(m => m.status === 'ask');
  const answeredBefore = matched.filter(m => m.status !== 'ask').length;
  const [qTotal] = useState(() => matched.filter(m => m.status === 'ask').length);

  if (asks.length) {
    const totalQ = Math.max(qTotal, asks.length);
    const idx = totalQ - asks.length;
    return (
      <Screen key={asks[0].line.id} top={<TopBar backTo="store" progress={0.55 + 0.15 * (answeredBefore / Math.max(1, matched.length))} />} className="narrow">
        <Question m={asks[0]} index={idx} total={totalQ} />
      </Screen>
    );
  }

  const ok = matched.filter(m => (m.status === 'confirmed' || m.status === 'keep') && m.baseline);
  const missing = matched.filter(m => m.status === 'notfound');
  const unsupported = matched.filter(m => m.status === 'unsupported');

  async function next() {
    setBusy(true);
    try { await runComparison(); go('result'); } finally { setBusy(false); }
  }

  return (
    <Screen
      top={<TopBar backTo="store" progress={0.7} />}
      aside={<section className="aside-card"><p className="eyebrow">Next</p><p className="lede sm">We'll swap in every cheaper equivalent with the same size and variant. You can keep any original.</p></section>}
      footer={<button className="sb-cta" type="button" disabled={!ok.length || busy} onClick={next}>{busy ? 'Building your basket…' : 'Find the cheaper basket'}</button>}
    >
      <h1 className="h-screen">Is this what you usually buy?</h1>
      <p className="lede sm">{ok.length} of {matched.length - unsupported.length} items found at {store?.name}. Tap one to change it.</p>

      <ul className="rows">
        {ok.map(m => (
          <li key={m.line.id}>
            <button type="button" className="row" onClick={() => m.options.length > 1 || m.candidates.length > 1 ? setChanging(m) : undefined}>
              <Thumb p={m.baseline} />
              <span className="row-main">
                <b>{productName(m.baseline!)}</b>
                <small>{m.baseline!.sizeLabel}{m.line.count > 1 ? ` · you need ${m.line.count}` : ''}{m.status === 'keep' ? ' · kept as is' : ''}</small>
              </span>
              <PriceTag p={m.baseline!} />
            </button>
          </li>
        ))}
      </ul>

      {(missing.length > 0 || unsupported.length > 0) && (
        <section className="muted-block">
          <h2 className="h-sub">Left out of the comparison</h2>
          <ul className="plain-list">
            {missing.map(m => <li key={m.line.id}><span>{m.line.raw}</span><small>not found at this store</small></li>)}
            {unsupported.map(m => <li key={m.line.id}><span>{m.line.raw}</span><small>not supported</small></li>)}
          </ul>
        </section>
      )}
      <DemoNote source={store?.source} />

      <Sheet open={!!changing} onClose={() => setChanging(null)} title="Which one do you usually buy?">
        {changing && (
          <div className="options">
            {(changing.options.length > 1 ? changing.options : changing.candidates.filter(c => c.brand === changing.baseline?.brand)).slice(0, 5).map(p => (
              <button key={p.productId} type="button" role="radio" aria-checked={changing.baseline?.productId === p.productId}
                className="sb-option opt-product" onClick={() => { answer(changing.line.id, p); setChanging(null); }}>
                <Thumb p={p} />
                <span className="opt-main"><b>{productName(p)}</b><small>{p.sizeLabel}</small></span>
                <PriceTag p={p} />
              </button>
            ))}
            <button type="button" className="sb-option opt-none" onClick={() => { answer(changing.line.id, null); setChanging(null); }}>
              <Icon name="x" size={18} /> Leave this item out
            </button>
          </div>
        )}
      </Sheet>
    </Screen>
  );
}
