import { useMemo, useState } from 'react';
import { Screen, TopBar, DemoNote, Money, TabBar, useDesktop, toast, UpgradeCard, useMember } from '../components/ui';
import { Icon } from '../components/Icon';
import { ReadAloud } from '../components/voice';
import { go } from '../state/router';
import { useApp } from '../state/store';
import { removeExampleHistory, seedExampleHistory } from '../state/actions';
import { productName, eligiblePrice } from '../lib/engine';
import { usd, words, pct } from '../lib/money';
import { weekStart } from '../lib/week';
import { isOperator } from '../lib/operator';

const WEEKS = 8;

function mondays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(weekStart(new Date(now.getTime() - i * 7 * 864e5)));
  return [...new Set(out)];
}
const label = (ws: string) => new Date(`${ws}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function Report() {
  const events = useApp(s => s.events);
  const history = useApp(s => s.history);
  const current = useApp(s => s.comparison);
  const desktop = useDesktop();
  const member = useMember();
  const weeks = useMemo(() => mondays(WEEKS), []);
  const [sel, setSel] = useState<string | null>(null);

  const data = useMemo(() => {
    const byWeek = weeks.map(ws => {
      const evs = events.filter(e => weekStart(new Date(e.occurredAt)) === ws);
      const spent = evs.reduce((a, e) => a + (e.paidCents ?? e.plannedCents), 0);
      const saved = evs.reduce((a, e) => a + e.savingCents, 0);
      const items = evs.reduce((a, e) => a + e.purchasedLineIds.length, 0);
      const cats = new Map<string, number>();
      for (const e of evs) {
        for (const c of e.categories ?? []) cats.set(c.name, (cats.get(c.name) ?? 0) + c.savingCents);
      }
      return { ws, evs, spent, saved, items, cats, demo: evs.some(e => e.demo) };
    });
    // top saving items across everything marked
    const top = new Map<string, number>();
    for (const e of events) {
      const comp = history.find(h => h.id === e.comparisonId);
      if (!comp) continue;
      for (const l of comp.lines) if (l.swap && l.chosen && e.purchasedLineIds.includes(l.lineId)) {
        const k = productName(l.chosen.product);
        top.set(k, (top.get(k) ?? 0) + l.swap.savingCents);
      }
    }
    // price watch: same product, same store, last two comparisons
    const changes: Array<{ name: string; from: number; to: number }> = [];
    const real = history.filter(h => !h.id.startsWith('demo-hist-'));
    const pair = real.length >= 2 ? real.slice(-2) : history.slice(-2);
    if (pair.length === 2 && pair[0].storeId === pair[1].storeId) {
      const before = new Map(pair[0].lines.flatMap(l => [l.original, l.chosen]).filter(Boolean).map(p => [p!.product.productId, p!]));
      for (const l of pair[1].lines) for (const pick of [l.original, l.chosen]) {
        if (!pick) continue;
        const old = before.get(pick.product.productId);
        const was = old ? Math.round(old.cents / old.packages) : null;
        const now = eligiblePrice(pick.product).cents;
        const name = productName(pick.product);
        if (was && now && Math.abs(was - now) >= 5 && !changes.some(c => c.name === name)) changes.push({ name, from: was, to: now });
      }
    }
    return { byWeek, top: [...top].sort((a, b) => b[1] - a[1]).slice(0, 5), changes: changes.slice(0, 6) };
  }, [events, history, weeks]);

  const withData = data.byWeek.filter(w => w.evs.length);
  const selected = data.byWeek.find(w => w.ws === sel) ?? [...withData].pop() ?? data.byWeek[data.byWeek.length - 1];
  const prev = data.byWeek[data.byWeek.indexOf(selected) - 1];
  const maxBar = Math.max(1, ...data.byWeek.map(w => w.spent + w.saved));
  const totalSaved = events.reduce((a, e) => a + e.savingCents, 0);
  const hasExample = events.some(e => e.id.startsWith('demo:'));
  const operator = isOperator();
  const anyDemo = events.length ? events.some(e => e.demo) : undefined;
  const cats = [...selected.cats].sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...cats.map(c => c[1]));
  const spendDelta = prev && prev.spent ? selected.spent - prev.spent : null;

  const say = () => withData.length
    ? `Week of ${label(selected.ws)}: you spent about ${words(selected.spent)} and saved an estimated ${words(selected.saved)}.${spendDelta != null ? ` That's ${words(Math.abs(spendDelta))} ${spendDelta < 0 ? 'less' : 'more'} than the week before.` : ''} Across ${withData.length} weeks you've saved ${words(totalSaved)}.${selected.demo ? ' This is example history with demo prices.' : ''}`
    : 'There is no shopping history yet.';

  async function example() {
    if (!current) { toast('Build a basket first. Try the example basket on the home page.'); go('welcome'); return; }
    await seedExampleHistory(6);
    toast('Added 6 weeks of example history, marked as demo.');
  }

  const side = (
    <>
      <section className="counter big">
        <p className="eyebrow">Saved in {withData.length || 0} week{withData.length === 1 ? '' : 's'}</p>
        <b><Money cents={totalSaved} /></b>
        <small>Estimated, from shops you marked{hasExample ? ' · includes example history' : ''}</small>
      </section>
      <div className="input-actions"><ReadAloud text={say} label="Read the report" /></div>
      {hasExample ? (
        <button type="button" className="ghost-btn" onClick={() => removeExampleHistory()}><Icon name="x" size={16} />Remove example history</button>
      ) : operator ? (
        <button type="button" className="ghost-btn" onClick={example}><Icon name="chart" size={16} />Show 6 weeks of example history</button>
      ) : null}
    </>
  );

  const body = (
    <>
      {hasExample && <p className="warn-note">Example history: generated from your basket with demo prices, so you can see how the report works. Not your real savings.</p>}

      <section className="week-chart" aria-label="Spend and savings per week">
        <div className="wc-legend"><span><i className="k-spent" />Spent</span><span><i className="k-saved" />Saved</span></div>
        <div className="wc-bars">
          {data.byWeek.map((w, i) => (
            <button key={w.ws} type="button" className={`wc-col ${w.ws === selected.ws ? 'on' : ''}`} onClick={() => setSel(w.ws)} style={{ ['--i' as string]: i }}
              aria-label={`Week of ${label(w.ws)}: spent ${usd(w.spent)}, saved ${usd(w.saved)}`}>
              <span className="wc-stack" style={{ height: `${w.spent + w.saved ? Math.max(6, ((w.spent + w.saved) / maxBar) * 100) : 2}%` }}>
                <i className="wc-saved" style={{ flexGrow: w.saved || 0.0001 }} />
                <i className="wc-spent" style={{ flexGrow: w.spent || 0.0001 }} />
              </span>
              <small>{label(w.ws)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="week-card">
        <div className="wk-head">
          <h2 className="h-sub">Week of {label(selected.ws)}</h2>
          {selected.demo && <span className="sb-chip sb-chip--promo">example</span>}
        </div>
        {selected.evs.length ? (
          <dl className="stats">
            <div><dt>Spent</dt><dd className="mono">{usd(selected.spent)}</dd>{spendDelta != null && <small className={spendDelta <= 0 ? 'save-txt' : 'up-txt'}>{spendDelta <= 0 ? '↓' : '↑'} {usd(Math.abs(spendDelta))} vs last week</small>}</div>
            <div><dt>Saved</dt><dd className="mono save-txt">{usd(selected.saved)}</dd><small>{pct(selected.saved, selected.spent + selected.saved)} of the usual price</small></div>
            <div><dt>Items</dt><dd className="mono">{selected.items}</dd><small>bought this week</small></div>
          </dl>
        ) : (
          <div className="empty">
            <p className="hint">Nothing marked this week. After you shop, tap “I shopped this” on your list. Re-checking prices never counts, so the numbers stay honest.</p>
            <div className="input-actions">
              <button type="button" className="sb-btn" onClick={() => go(current ? 'shop' : 'list')}>{current ? 'Open shopping list' : 'Start a basket'}</button>
              {!hasExample && operator && <button type="button" className="ghost-btn" onClick={example}>See example history</button>}
            </div>
          </div>
        )}
      </section>

      {cats.length > 0 && (
        <section>
          <h2 className="h-sub">Where the saving came from</h2>
          <ul className="hbars">
            {cats.map(([name, cents], i) => (
              <li key={name} style={{ ['--i' as string]: i }}>
                <span>{name}</span>
                <span className="hb-track"><i style={{ width: `${(cents / maxCat) * 100}%` }} /></span>
                <b className="mono">{usd(cents)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.top.length > 0 && (
        <section>
          <h2 className="h-sub">Your best swaps so far</h2>
          <ul className="plain-list">
            {data.top.map(([name, cents]) => <li key={name}><span>{name}</span><small className="save-txt mono">{usd(cents)}</small></li>)}
          </ul>
        </section>
      )}

      <section>
        <h2 className="h-sub">Price watch</h2>
        {data.changes.length ? (
          <ul className="plain-list">
            {data.changes.map(ch => <li key={ch.name}><span>{ch.name}</span><small className={`mono ${ch.to < ch.from ? 'save-txt' : 'up-txt'}`}>{usd(ch.from)} → {usd(ch.to)}</small></li>)}
          </ul>
        ) : <p className="hint">Re-price your basket next week to see which of your products got cheaper or pricier at the same store.</p>}
      </section>
      <DemoNote source={anyDemo === undefined ? undefined : anyDemo ? 'demo' : 'kroger'} />
    </>
  );

  return (
    <Screen
      top={<TopBar backTo="home" title="Weekly report" />}
      aside={member ? side : <UpgradeCard title="The weekly report is for members" body="Spend and savings per week, where the saving came from, your best swaps and a price watch on your basket." />}
      asidePlacement="before"
      className={desktop ? '' : 'with-tabs no-foot'}
    >
      {member ? body : <div className="locked-preview" aria-hidden="true" {...{ inert: '' }}>{body}</div>}
      {!desktop && <TabBar />}
    </Screen>
  );
}
