import { useEffect, useMemo, useState } from 'react';
import { Screen, TopBar, Sheet, toast, DemoNote, Money, useDesktop, TabBar, UpgradeCard, useMember } from '../components/ui';
import { Icon } from '../components/Icon';
import { VoiceButton, PhotoButton } from '../components/voice';
import { go } from '../state/router';
import { setState, useApp } from '../state/store';
import { applyCommand, counterCents, interpret, markShopped, thisWeekEvent } from '../state/actions';
import { productName } from '../lib/engine';
import { usd } from '../lib/money';
import { fmtTime } from '../lib/week';
import { coreTokens } from '../lib/vocab';
import type { Comparison, Product } from '../lib/types';

interface Item { lineId: string; product: Product; packages: number; cents: number; note: string; saving: number }

/** The list to shop from: every priced line at the chosen store. */
export function shoppingItems(c: Comparison): Item[] {
  return c.lines.filter(l => l.chosen).map(l => ({
    lineId: l.lineId, product: l.chosen!.product, packages: l.chosen!.packages, cents: l.chosen!.cents,
    note: l.swap ? 'swapped' : l.locked ? 'yours' : '', saving: l.swap?.savingCents ?? 0,
  }));
}

export function listText(items: Item[], storeName: string, fetchedAt: string, demo: boolean): string {
  const total = items.reduce((a, i) => a + i.cents, 0);
  const out = ['Pro Groceries shopping list', `Prices as of ${fmtTime(fetchedAt)}${demo ? ' (demo prices)' : ''}`, '', `— ${storeName.replace(' (demo)', '')} · ${usd(total)} —`];
  for (const i of items) out.push(`☐ ${productName(i.product)}, ${i.product.sizeLabel}${i.packages > 1 ? ` ×${i.packages}` : ''}  ${usd(i.cents)}`);
  out.push('', `Estimated total ${usd(total)} before tax`);
  return out.join('\n');
}

export function Shop() {
  const c = useApp(s => s.comparison);
  const store = useApp(s => s.store);
  const checked = useApp(s => s.checked);
  const events = useApp(s => s.events);
  const member = useMember();
  const desktop = useDesktop();
  const [confirming, setConfirming] = useState(false);
  const [receiptMatches, setReceiptMatches] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { if (!c) go('welcome', true); }, [c]);
  const items = useMemo(() => (c ? shoppingItems(c) : []), [c]);
  if (!c) return null;

  const total = items.reduce((a, i) => a + i.cents, 0);
  const week = thisWeekEvent();
  const counted = counterCents();
  const left = items.filter(r => !checked.includes(r.lineId));

  function toggle(id: string) {
    setState(s => ({ checked: s.checked.includes(id) ? s.checked.filter(x => x !== id) : [...s.checked, id] }));
  }
  async function copy() {
    try { await navigator.clipboard.writeText(listText(items, c!.storeName, c!.fetchEndedAt, c!.source === 'demo')); toast('List copied'); }
    catch { toast('Copy is blocked here. Long-press the list to select it.'); }
  }
  async function share() {
    const t = listText(items, c!.storeName, c!.fetchEndedAt, c!.source === 'demo');
    if (navigator.share) { try { await navigator.share({ title: 'Grocery list', text: t }); } catch { /* cancelled */ } } else copy();
  }
  function openConfirm(preset?: string[]) {
    setSelected(preset ?? (checked.length ? checked : items.map(r => r.lineId)));
    setConfirming(true);
  }
  async function confirmShopped(source: 'tap' | 'voice' | 'receipt') {
    if (!selected.length) { toast('Pick at least one item you bought.'); return; }
    const ev = await markShopped(selected, source);
    setConfirming(false);
    setReceiptMatches(null);
    toast(ev.savingCents > 0 ? `Logged. ${usd(ev.savingCents)} estimated saving this week.` : 'Logged this week’s shop.');
  }
  async function onVoice(text: string) {
    const cmd = interpret(/^(got|bought)/i.test(text) ? text : `got ${text}`);
    if (cmd.kind !== 'check') { toast(`I heard “${text}” but couldn't match it to your list.`); return; }
    await applyCommand(cmd, 'voice');
    toast(`Checked: ${cmd.labels.join(', ')}`);
  }
  function onReceipt(ocr: string) {
    const lines = ocr.toLowerCase().split('\n');
    const hits = items.filter(r => {
      const want = coreTokens(productName(r.product)).filter(t => t.length > 3);
      return lines.some(line => want.filter(t => line.includes(t.slice(0, 5))).length >= Math.min(2, want.length));
    }).map(r => r.lineId);
    if (!hits.length) { toast('Couldn’t match receipt lines to your list. Check items by hand.'); return; }
    setReceiptMatches(hits); setSelected(hits); setConfirming(true);
  }

  const counter = member ? (
    <section className="counter">
      <p className="eyebrow">Estimated saved so far</p>
      <b><Money cents={counted} /></b>
      <small>{events.length ? `from ${events.length} shopping week${events.length === 1 ? '' : 's'} you marked` : 'Mark a shop to start counting'}{events.some(e => e.demo) ? ' · includes demo prices' : ''}</small>
    </section>
  ) : (
    <UpgradeCard title="Savings counter is for members" body="Your shops are still logged on this device. Membership shows what you've saved week by week." />
  );

  const side = (
    <>
      <section className="shop-head">
        <div>
          <b>{store?.name.replace(' (demo)', '')}</b>
          <small>{items.length} items · <Money cents={total} /> est. · {left.length} left</small>
        </div>
        <div className="shop-actions">
          <button type="button" className="icon-btn boxed" onClick={copy} aria-label="Copy list"><Icon name="copy" /></button>
          <button type="button" className="icon-btn boxed" onClick={share} aria-label="Share list"><Icon name="share" /></button>
        </div>
      </section>
      {desktop && counter}
    </>
  );

  return (
    <Screen
      top={<TopBar backTo="result" title="Shopping list" />}
      aside={side}
      asidePlacement="before"
      className={desktop ? '' : 'with-tabs'}
      footer={
        <>
          <button className="sb-cta" type="button" onClick={() => openConfirm()}>{week ? 'Update this week’s shop' : 'I shopped this'}</button>
          <p className="foot-note">Counts once per week, so re-checking prices never inflates it.</p>
        </>
      }
    >
      <section className="shop-group">
        <ul className="checklist">
          {items.map((it, i) => {
            const on = checked.includes(it.lineId);
            return (
              <li key={it.lineId} style={{ ['--i' as string]: i }}>
                <label className={`check-row ${on ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(it.lineId)} />
                  <span className="box" aria-hidden="true"><Icon name="check" size={16} strokeWidth={3} /></span>
                  <span className="check-main">
                    <b>{productName(it.product)}</b>
                    <small>{it.product.sizeLabel}{it.packages > 1 ? ` · ×${it.packages}` : ''}{it.note ? ` · ${it.note}` : ''}</small>
                  </span>
                  <span className="mono check-price">{usd(it.cents)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="input-actions">
        <VoiceButton onText={onVoice} label="Say “got milk and eggs”" />
      </div>
      <PhotoButton label="Scan your receipt" onText={onReceipt} />

      {!desktop && counter}
      <DemoNote source={c.source} />

      <Sheet open={confirming} onClose={() => { setConfirming(false); setReceiptMatches(null); }} title={receiptMatches ? 'Found on your receipt' : 'What did you buy?'}>
        <p className="hint">{receiptMatches ? 'Check these match what you bought. Only what you confirm is counted.' : 'Untick anything you skipped. Only swapped items you bought count toward the saving.'}</p>
        <ul className="sheet-list">
          {items.map(it => (
            <li key={it.lineId}>
              <label className="check-row compact">
                <input type="checkbox" checked={selected.includes(it.lineId)} onChange={() => setSelected(s => s.includes(it.lineId) ? s.filter(x => x !== it.lineId) : [...s, it.lineId])} />
                <span className="box" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3} /></span>
                <span className="check-main"><b>{productName(it.product)}</b></span>
                {it.saving > 0 && <span className="sb-chip sb-chip--save">−{usd(it.saving)}</span>}
              </label>
            </li>
          ))}
        </ul>
        <button className="sb-cta" type="button" onClick={() => confirmShopped(receiptMatches ? 'receipt' : 'tap')}>Confirm {selected.length} item{selected.length === 1 ? '' : 's'}</button>
      </Sheet>
      {!desktop && <TabBar />}
    </Screen>
  );
}
