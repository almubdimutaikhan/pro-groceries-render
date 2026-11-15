import { useEffect, useState } from 'react';
import { Screen, TopBar, Thumb, DemoNote, toast, Money, Spinner, ChainBadge, PriceDetails, useMember } from '../components/ui';
import { Icon } from '../components/Icon';
import { ReadAloud, VoiceButton } from '../components/voice';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { applyCommand, interpret, toggleLock } from '../state/actions';
import { productName } from '../lib/engine';
import { pct, usd, words } from '../lib/money';
import { unitPriceLabel } from '../lib/units';
import { fmtTime } from '../lib/week';
import { YEAR_LABEL } from '../lib/pricing';
import type { Comparison, LineResult, Pick, SwapType } from '../lib/types';

const SWAP_LABEL: Record<SwapType, string> = { 'store-brand': 'Store brand', 'better-pack': 'Better pack', promo: 'On sale' };

/** One side of a swap: what, how big, how many packages, and the line total. */
function Side({ kind, pick }: { kind: 'Your usual' | 'Recommended'; pick: Pick }) {
  const p = pick.product;
  return (
    <div className={`swap-side ${kind === 'Recommended' ? 'rec' : 'usual'}`}>
      <small className="swap-kind">{kind}</small>
      <div className="swap-prod">
        <Thumb p={p} size={40} />
        <span className="swap-main">
          <b>{productName(p)}</b>
          <small>{pick.packages} × {p.sizeLabel} · {unitPriceLabel(pick.cents / pick.packages, p.pack)}</small>
        </span>
      </div>
      <span className="sb-price swap-total">{usd(pick.cents)}</span>
    </div>
  );
}

function SwapRow({ l, i, storeName }: { l: LineResult; i: number; storeName: string }) {
  const o = l.original!;
  const c = l.chosen!;
  return (
    <li className="swap" style={{ ['--i' as string]: i }}>
      <div className="swap-top">
        <span className={`tag tag-${l.swap!.type}`}>{SWAP_LABEL[l.swap!.type]}{c.usedPromo && c.product.promoNeedsCard ? ' · with card' : ''}</span>
        <span className="sb-chip sb-chip--save">−{usd(l.swap!.savingCents)}</span>
      </div>
      <div className="swap-pair">
        <Side kind="Your usual" pick={o} />
        <Side kind="Recommended" pick={c} />
      </div>
      <div className="swap-why">{l.swap!.reason}</div>
      <div className="swap-actions">
        <button type="button" className="keep-btn" onClick={() => { toggleLock(l.lockKey); toast(`Kept ${productName(o.product)}. Total updated.`); }}>
          <Icon name="lock" size={16} /> Keep original
        </button>
      </div>
      <PriceDetails storeName={storeName} items={[{ heading: 'Your usual', product: o.product }, { heading: 'Recommended', product: c.product }]} />
    </li>
  );
}

function LockedRow({ l, storeName }: { l: LineResult; storeName: string }) {
  return (
    <li className="row static stack">
      <div className="row-line">
        <Thumb p={l.original!.product} />
        <span className="row-main">
          <b>{l.label}</b>
          <small>Kept yours · a swap would save {usd(l.lockedSwap!.savingCents)}</small>
        </span>
        <button type="button" className="ghost-btn sm" onClick={() => toggleLock(l.lockKey)}><Icon name="unlock" size={16} />Swap</button>
      </div>
      <PriceDetails storeName={storeName} items={[{ product: l.original!.product }]} />
    </li>
  );
}

function PlainRow({ l, note, storeName }: { l: LineResult; note: string; storeName: string }) {
  return (
    <li className="row static stack">
      <div className="row-line">
        <Thumb p={l.original?.product ?? null} />
        <span className="row-main"><b>{l.label}</b><small>{note}</small></span>
        {l.original && <span className="price-col"><b className="sb-price">{usd(l.original.cents)}</b></span>}
      </div>
      {l.original && <PriceDetails storeName={storeName} items={[{ product: l.original.product }]} />}
    </li>
  );
}

export function speech(c: Comparison): string {
  const swaps = c.lines.filter(l => l.swap);
  const top = swaps[0];
  return [
    `Same basket at ${c.storeName.replace('(demo)', '')}.`,
    c.savingCents > 0 ? `Your usual basket is ${words(c.originalCents)}. Rebuilt, it's ${words(c.chosenCents)}. You keep ${words(c.savingCents)}.` : `We found no cheaper equivalents this time. Your basket is ${words(c.originalCents)}.`,
    top ? `Biggest swap: ${productName(top.chosen!.product)} instead of ${productName(top.original!.product)}, saving ${words(top.swap!.savingCents)}.` : '',
    `${c.pricedCount} of ${c.totalCount} items are priced. Estimate before tax.`,
    c.source === 'demo' ? 'These are demo prices, not live Kroger prices.' : '',
  ].filter(Boolean).join(' ');
}

export function Result() {
  const c = useApp(s => s.comparison);
  const quotes = useApp(s => s.quotes);
  const quoting = useApp(s => s.quoting);
  const member = useMember();
  const [bump, setBump] = useState(false);
  useEffect(() => { if (!c) go('welcome', true); }, [c]);
  useEffect(() => { setBump(true); const t = setTimeout(() => setBump(false), 400); return () => clearTimeout(t); }, [c?.savingCents]);
  if (!c) return null;
  const live = c.source === 'kroger';
  const cheaper = quotes.filter(q => !q.isHome && q.totalCents < c.chosenCents).sort((a, b) => a.totalCents - b.totalCents)[0];

  const swaps = c.lines.filter(l => l.swap);
  const locked = c.lines.filter(l => l.locked && l.lockedSwap);
  const best = c.lines.filter(l => !l.swap && !l.lockedSwap && l.status === 'confirmed' && l.original);
  const kept = c.lines.filter(l => l.status === 'keep' && l.original);
  const missing = c.lines.filter(l => !l.original);

  async function onVoice(text: string) {
    const cmd = interpret(text);
    if (cmd.kind === 'unclear') { toast(`I heard “${text}”. Try “keep my Tide” or “swap the eggs”.`); return; }
    await applyCommand(cmd, 'voice');
    toast(cmd.kind === 'keep' ? `Kept ${cmd.label}` : cmd.kind === 'unlock' ? `Swapped ${cmd.label}` : 'Done');
  }

  const summary = (
    <>
      <section className="hero-save" aria-live="polite">
        <p className="eyebrow">Same basket, {live ? 'this week' : 'demo prices'}</p>
        {c.savingCents > 0 ? (
          <h1 className={`save-num ${bump ? 'bump' : ''}`}><Money cents={c.savingCents} /> less</h1>
        ) : (
          <h1 className="save-num zero">No cheaper swaps right now</h1>
        )}
        <p className="save-ctx">
          {c.savingCents > 0 && <><b>{pct(c.savingCents, c.originalCents)} off</b> · </>}
          {c.storeName.replace(' (demo)', '')} · prices as of {fmtTime(c.fetchEndedAt)}
        </p>
      </section>

      <div className="cmp">
        <div><small>Your usual</small><b className="sb-price">{usd(c.originalCents)}</b></div>
        <div className="now"><small>Rebuilt</small><b className="sb-price"><Money cents={c.chosenCents} /></b></div>
      </div>

      <div className="coverage">
        <span>{c.pricedCount} of {c.totalCount} items priced</span>
        <DemoNote inline source={c.source} />
      </div>

      {live && (
        <button type="button" className="store-teaser" onClick={() => go('compare')}>
          {quoting ? (
            <span className="st-main"><Spinner /> <span>Checking nearby Kroger stores…</span></span>
          ) : cheaper ? (
            <span className="st-main">
              <ChainBadge chain={cheaper.store.chain} />
              <span><b>{usd(c.chosenCents - cheaper.totalCents)} less at {cheaper.store.name}</b>
                <small>{cheaper.covered} of {c.pricedCount} items carried</small></span>
            </span>
          ) : (
            <span className="st-main"><Icon name="store" /><span><b>Compare nearby Kroger stores</b><small>Same basket, other Kroger-family stores near you</small></span></span>
          )}
          <Icon name="next" />
        </button>
      )}

      <div className="input-actions">
        <ReadAloud text={() => speech(c)} />
        <VoiceButton onText={onVoice} label="Say “keep my Tide”" />
      </div>
    </>
  );

  return (
    <Screen
      top={<TopBar backTo="confirm" progress={0.85} />}
      aside={summary}
      asidePlacement="before"
      footer={
        <>
          <div className="foot-total">
            <span>New total <b className="sb-price">{usd(c.chosenCents)}</b></span>
            {c.savingCents > 0 && <b className="save-txt sb-price">−{usd(c.savingCents)}</b>}
          </div>
          <button className="sb-cta" type="button" onClick={() => go('shop')}>Get my shopping list</button>
        </>
      }
    >
      <h2 className="h-screen desk-only">What changed in your basket</h2>
      {swaps.length > 0 && (
        <section>
          <h2 className="h-sub">{swaps.length} swap{swaps.length === 1 ? '' : 's'} applied <span className="muted">· biggest first</span></h2>
          <ul className="swaps">{swaps.map((l, i) => <SwapRow key={l.lineId} l={l} i={i} storeName={c.storeName} />)}</ul>
        </section>
      )}

      {locked.length > 0 && (
        <section>
          <h2 className="h-sub">Kept yours</h2>
          <ul className="rows">{locked.map(l => <LockedRow key={l.lineId} l={l} storeName={c.storeName} />)}</ul>
        </section>
      )}

      {best.length > 0 && (
        <section>
          <h2 className="h-sub">Already the best price</h2>
          <ul className="rows">{best.map(l => <PlainRow key={l.lineId} l={l} storeName={c.storeName} note="No cheaper equivalent with the same size and variant" />)}</ul>
        </section>
      )}

      {kept.length > 0 && (
        <section>
          <h2 className="h-sub">Fresh, kept as is</h2>
          <ul className="rows">{kept.map(l => <PlainRow key={l.lineId} l={l} storeName={c.storeName} note="Sold by weight, never swapped" />)}</ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="muted-block">
          <h2 className="h-sub">Not in the totals</h2>
          <ul className="plain-list">
            {missing.map(l => <li key={l.lineId}><span>{l.label}</span><small>{l.status === 'unsupported' ? 'not supported' : 'unpriced or not found'}</small></li>)}
          </ul>
        </section>
      )}

      <p className="fine">
        Estimate before tax at {c.storeName}. Shelf prices can change at checkout. Sale prices marked “with card” need the free Kroger card.
        Coupons and multi-buy deals aren't included. Open “Price details” on any line for its store and product ID, regular and sale price, the time we fetched it and where it came from.
      </p>

      {!member && (
        <button type="button" className="plan-teaser" onClick={() => go('plan')}>
          <span>
            <b>Want this re-priced every week?</b>
            <small>Membership: weekly re-pricing, savings counter and report · {YEAR_LABEL}</small>
          </span>
          <Icon name="next" />
        </button>
      )}
    </Screen>
  );
}
