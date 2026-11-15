import { useState } from 'react';
import { Screen, Brand, DemoNote, Spinner, toast, Money, TabBar, useDesktop, ThemeToggle, UpgradeCard, useMember, ResetButton } from '../components/ui';
import { Icon } from '../components/Icon';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { canReprice, counterCents, recordReprice, reprice } from '../state/actions';
import { usd } from '../lib/money';
import { fmtTime, weekStart } from '../lib/week';
import { YEAR_LABEL } from '../lib/pricing';

export function Home() {
  const c = useApp(s => s.comparison);
  const lines = useApp(s => s.lines);
  const store = useApp(s => s.store);
  const events = useApp(s => s.events);
  const locks = useApp(s => s.locks);
  const entitlement = useApp(s => s.entitlement);
  const member = useMember();
  const desktop = useDesktop();
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const total = counterCents();
  const thisWeek = events.filter(e => e.occurredAt >= `${weekStart()}T00:00:00`).reduce((a, e) => a + e.savingCents, 0);
  const allowed = canReprice(entitlement);
  const live = c?.source === 'kroger';

  async function run() {
    setBusy({ done: 0, total: lines.length });
    try {
      const r = await reprice((done, t) => setBusy({ done, total: t }));
      recordReprice();
      if (r.questions) { toast('Some products changed at the store. One quick check.'); go('confirm'); }
      else go('result');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const counter = member ? (
    <section className="counter big">
      <p className="eyebrow">Estimated saved</p>
      <b><Money cents={total} /></b>
      <small>{events.length ? `${events.length} shopping week${events.length === 1 ? '' : 's'} marked · ${usd(thisWeek)} this week` : 'Mark “I shopped this” after a trip to start counting'}</small>
      <button type="button" className="text-btn left" onClick={() => go('report')}>See weekly report <Icon name="next" size={16} /></button>
    </section>
  ) : (
    <UpgradeCard title="Savings counter and weekly report" body="Members see what they've saved week by week, plus a price watch on the products in their basket." />
  );

  return (
    <Screen
      top={desktop ? <h1 className="h-screen">Your usual basket</h1> : (
        <div className="welcome-top"><Brand /><span className="land-top-actions"><ResetButton /><ThemeToggle /><button className="icon-btn" type="button" onClick={() => go('settings')} aria-label="Settings"><Icon name="settings" /></button></span></div>
      )}
      aside={desktop ? counter : undefined}
      className={desktop ? '' : 'with-tabs'}
      footer={allowed ? (
        <>
          <button className="sb-cta" type="button" onClick={run} disabled={!!busy || !store}>
            {busy ? <><Spinner /> Checking {busy.done} of {busy.total}…</> : <><Icon name="refresh" size={20} /> Re-price my basket</>}
          </button>
          {!member && <p className="foot-note">Your first re-pricing is free. After that, members re-price every week.</p>}
        </>
      ) : (
        <UpgradeCard title="You've used your free re-pricing" body="Prices change every week. Members re-price the same basket in one tap, as often as they like." />
      )}
    >
      {!desktop && <h1 className="h-screen">Your usual basket</h1>}

      <section className="basket-card">
        <div className="bc-row">
          <span className="method-ic"><Icon name="basket" /></span>
          <div>
            <b>{lines.length} items · {store?.name.replace(' (demo)', '') ?? 'no store yet'}</b>
            <small>{c ? `Last priced ${fmtTime(c.fetchEndedAt)}` : 'Not priced yet'}{locks.length ? ` · ${locks.length} kept as yours` : ''}</small>
          </div>
        </div>
        {c && (
          <div className="bc-last">
            <span>Last check</span>
            <b className="sb-price">{usd(c.chosenCents)} <small className="save-txt">{c.savingCents > 0 ? `−${usd(c.savingCents)}` : 'no swaps'}</small></b>
          </div>
        )}
      </section>

      {!desktop && counter}

      <nav className="tiles" aria-label="Everything you can do">
        <button type="button" className="tile" onClick={() => go(c ? 'result' : 'list')}><Icon name="tag" /><span><b>Cheaper basket</b><small>Swaps and locks</small></span></button>
        {live && <button type="button" className="tile" onClick={() => go('compare')}><Icon name="store" /><span><b>Compare stores</b><small>Nearby Kroger stores</small></span></button>}
        <button type="button" className="tile" onClick={() => go(c ? 'shop' : 'list')}><Icon name="list" /><span><b>Shopping list</b><small>Tick, copy, share</small></span></button>
        <button type="button" className="tile" onClick={() => go('report')}><Icon name="chart" /><span><b>Weekly report</b><small>{member ? 'Spend and savings' : 'Members'}</small></span></button>
        <button type="button" className="tile" onClick={() => go('list')}><Icon name="edit" /><span><b>Edit list</b><small>Change your list</small></span></button>
        <button type="button" className="tile" onClick={() => go('plan')}><Icon name="refresh" /><span><b>Membership</b><small>{member ? 'You are a member' : `Weekly re-pricing · ${YEAR_LABEL}`}</small></span></button>
      </nav>
      <DemoNote source={c?.source} />
      {!desktop && <TabBar />}
    </Screen>
  );
}
