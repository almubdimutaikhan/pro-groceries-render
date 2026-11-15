import { useEffect, useState } from 'react';
import { Brand, Money, ThemeToggle, ResetButton, useDesktop } from '../components/ui';
import { Icon } from '../components/Icon';
import { useMangisoz } from '../components/voice';
import { go } from '../state/router';
import { setState } from '../state/store';
import { parseText } from '../state/actions';
import { SAMPLE_LIST } from '../lib/parser';
import { usd } from '../lib/money';

/* The worked example on the landing page. Demo prices, labelled as such. */
const EX = [
  { typed: '2 Barilla spaghetti 16 oz', from: 'Barilla spaghetti ×2', to: 'Kroger spaghetti ×2', was: 458, now: 250, why: 'Store brand, same 16 oz' },
  { typed: 'Tide detergent 64 loads', from: 'Tide original 64 loads', to: 'Kroger original 64 loads', was: 1799, now: 999, why: 'Same 64 loads, same scent' },
  { typed: 'Horizon organic 2% milk', from: 'Horizon organic 2% gal', to: 'Simple Truth organic 2% gal', was: 749, now: 549, why: 'Still organic, still 2%' },
  { typed: 'Heinz ketchup 32 oz', from: 'Heinz ketchup 32 oz', to: 'Kroger ketchup 32 oz', was: 449, now: 219, why: 'Same size bottle' },
  { typed: 'our Folgers coffee', from: 'Folgers classic 25.9 oz', to: null, was: 1399, now: 1399, why: 'You locked it, kept as is' },
];
const WAS = EX.reduce((s, e) => s + e.was, 0);

function LiveExample() {
  // phase: 0 typing → 1 checking → 2..(2+n) swapping line by line → done
  const [tick, setTick] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTick(99); return; }
    setTick(0);
    const id = setInterval(() => setTick(t => (t > 40 ? t : t + 1)), 260);
    return () => clearInterval(id);
  }, [run]);

  const typedLines = Math.min(EX.length, Math.floor(tick / 2));          // ~0.5s per line
  const checking = tick >= 11 && tick < 15;
  const swapped = tick < 15 ? 0 : Math.min(EX.length, Math.floor((tick - 15) / 3) + 1);
  const done = swapped >= EX.length && tick > 31;
  const now = EX.reduce((s, e, i) => s + (i < swapped ? e.now : e.was), 0);

  return (
    <div className="live-ex" aria-label="Worked example: a list rebuilt cheaper">
      <div className="lx-head">
        <span className="lx-dot" /> <span>Example basket · Kroger Downtown</span>
        <span className="lx-tag">demo prices</span>
      </div>
      <p className="lx-caption">Example with demo prices, not live Kroger prices.</p>

      {tick < 11 ? (
        <div className="lx-typing" aria-hidden="true">
          <small className="lx-label">Your list</small>
          {EX.slice(0, typedLines + 1).map((e, i) => (
            <div key={i} className="lx-type-line">
              {i < typedLines ? e.typed : <>{e.typed.slice(0, Math.max(0, (tick % 2) * 14 + 6))}<span className="caret" /></>}
            </div>
          ))}
        </div>
      ) : (
        <div className="lx-receipt">
          {checking && <div className="lx-scan" aria-hidden="true" />}
          {EX.map((e, i) => {
            const on = i < swapped;
            return (
              <div key={i} className={`lx-row ${on ? 'on' : ''} ${on && !e.to ? 'locked' : ''}`}>
                <div className="lx-from"><span>{e.from}</span><span className="mono">{usd(e.was)}</span></div>
                {on && (e.to ? (
                  <div className="lx-to">
                    <span><Icon name="next" size={14} /> {e.to}</span>
                    <span className="mono">{usd(e.now)}</span>
                    <small>{e.why}</small>
                  </div>
                ) : (
                  <div className="lx-to keep"><span><Icon name="lock" size={14} /> {e.why}</span></div>
                ))}
              </div>
            );
          })}
          <div className="lx-total">
            <span>Same basket</span>
            <span className="mono"><s>{usd(WAS)}</s> <Money cents={now} /></span>
          </div>
          {done && <div className="lx-stamp">{usd(WAS - now)} less</div>}
        </div>
      )}
      <div className="lx-foot">
        <span className="lx-status">{tick < 11 ? 'Reading your list…' : checking ? 'Checking shelf prices at your store…' : done ? 'Same sizes, same variants, cheaper labels.' : 'Swapping in cheaper equivalents…'}</span>
        <button type="button" className="text-btn" onClick={() => setRun(r => r + 1)}><Icon name="refresh" size={15} /> Replay</button>
      </div>
    </div>
  );
}

const steps = (voice: boolean) => [
  {
    t: voice ? 'Paste, say or snap your usual list' : 'Paste or type your usual list',
    d: voice
      ? 'Copy it from Notes, read it out loud, or take a photo of last week\'s receipt. Messy is fine: "2 barilla spaghetti, tide 64 loads, milk".'
      : 'Copy it from Notes or type it as it comes. Messy is fine: "2 barilla spaghetti, tide 64 loads, milk".',
    mock: (
      <div className="mock mock-list">
        <div className="mock-input">2 Barilla spaghetti 16 oz<br />Tide detergent 64 loads<br />milk<span className="caret" /></div>
        {voice && <div className="mock-chips"><span><Icon name="mic" size={14} />Say it</span><span><Icon name="camera" size={14} />Snap receipt</span></div>}
      </div>
    ),
  },
  {
    t: 'Pick your Kroger store',
    d: 'Choose a Kroger-family store near your ZIP. We check shelf prices at that exact store, not a national average.',
    mock: (
      <div className="mock mock-stores">
        <div className="mock-store on"><Icon name="store" size={16} /><b>Kroger · Downtown</b><small>45202</small></div>
        <div className="mock-store"><Icon name="store" size={16} /><b>Kroger · Corryville</b><small>45219</small></div>
        <div className="mock-store"><Icon name="store" size={16} /><b>Kroger · Hyde Park</b><small>45208</small></div>
      </div>
    ),
  },
  {
    t: 'Tell us what you usually buy',
    d: 'If your list says just "milk", we ask once: which one? That\'s the baseline, so the saving is real, not guessed.',
    mock: (
      <div className="mock mock-q">
        <small>Your list says <code>milk</code></small>
        <div className="mock-opt on"><span className="r" />Kroger 2% gallon<b>$2.99</b></div>
        <div className="mock-opt"><span className="r" />Horizon organic 2%<b>$7.49</b></div>
      </div>
    ),
  },
  {
    t: 'Get the same basket for less, and keep anything',
    d: 'Every cheaper equivalent with the same size and variant is swapped in. Tap "Keep original" on anything you won\'t change, and the total updates.',
    mock: (
      <div className="mock mock-swap">
        <div className="ms-row"><span>Kroger ketchup 32 oz</span><b className="save">−$2.30</b></div>
        <small>instead of Heinz ketchup 32 oz</small>
        <span className="mock-keep"><Icon name="lock" size={13} /> Keep original</span>
      </div>
    ),
  },
  {
    t: 'Shop with the list',
    d: 'Take one list to your store and tick items off in the aisle. Mark it shopped and members get a weekly report that keeps count.',
    mock: (
      <div className="mock mock-check">
        <div className="mc on"><span className="b"><Icon name="check" size={12} strokeWidth={3} /></span><s>Kroger spaghetti ×2</s></div>
        <div className="mc"><span className="b" />Simple Truth organic 2%</div>
        <div className="mc"><span className="b" />Kroger 64 loads</div>
      </div>
    ),
  },
];

const FEATURES: Array<[string, string]> = [
  ['Paste or type your list', 'Your list in seconds, in whatever form you have it.'],
  ['Same-basket swaps', 'Store brands, better packs and sale prices that keep size and variant.'],
  ['Keep original', 'Lock the coffee, the baby formula, the cereal the kids insist on.'],
  ['Prices from your store', 'Shelf prices at the exact Kroger store you pick, each with its store and product ID.'],
  ['Shopping checklist', 'Package counts, prices, copy and share. Tick items in the aisle.'],
  ['Re-price every week', 'Prices move weekly. Re-price the same basket in one tap (members).'],
  ['Savings you can check', 'The Weekly report: what you spent and saved, by category, with a price watch (members).'],
  ['Read aloud', 'Hear the result while your hands are on the cart.'],
];

const FAQ = [
  ['Is it free?', 'Building your cheaper basket, the shopping list, keeping originals and one re-pricing are free. A $49/year membership (or $5.99/month) adds weekly re-pricing, the savings counter and the Weekly report, with a money-back guarantee if you don\'t save 5× its price.'],
  ['Where do prices come from?', 'Kroger prices come from Kroger\'s own product API for the store you pick. Where live prices are not connected yet, the page says "Demo prices" and shows illustrative numbers, never real ones.'],
  ['Will it change what my family eats?', 'No. Same product type, same size or more, same variant (organic, 2%, decaf, creamy). Fresh meat and produce are never swapped.'],
  ['Do I need an account?', 'No. Your basket stays in this browser. Clear it any time in Settings.'],
];

export function Welcome() {
  const desktop = useDesktop();
  const voice = useMangisoz();
  async function sample() {
    await parseText(SAMPLE_LIST);
    setState({ listText: SAMPLE_LIST });
    go('store');
  }

  return (
    <div className="landing">
      {!desktop && (
        <header className="land-top">
          <Brand />
          <span className="land-top-actions">
            <ResetButton />
            <ThemeToggle />
            <button className="text-btn" type="button" onClick={() => go('list')}>Start</button>
          </span>
        </header>
      )}

      <section className="land-hero">
        <div className="hero-copy flow">
          <p className="eyebrow">For US households · Kroger-family stores</p>
          <h1 className="h-hero">Same groceries.<br /><span className="sb-mark">Smaller</span> bill.</h1>
          <p className="lede">Give us your usual grocery list. We rebuild the exact same basket with cheaper equivalents: same sizes, same flavors, same quantities. Only the labels change.</p>
          <div className="hero-ctas">
            <button className="sb-cta" type="button" onClick={() => go('list')}>Paste my list <Icon name="next" size={20} /></button>
            <button className="sb-btn" type="button" onClick={sample}>Try the example basket</button>
          </div>
          <ul className="trust">
            <li><Icon name="check" size={16} />No signup</li>
            <li><Icon name="check" size={16} />About a minute</li>
            <li><Icon name="check" size={16} />Free</li>
          </ul>
        </div>
        <LiveExample />
      </section>

      <section className="land-sec" id="how">
        <p className="eyebrow">How it works</p>
        <h2 className="h-sec">Five steps, about a minute</h2>
        <ol className="steps">
          {steps(voice).map((s, i) => (
            <li key={i} className="step" style={{ ['--i' as string]: i }}>
              <span className="step-n">{i + 1}</span>
              <div className="step-text">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
              <div className="step-mock">{s.mock}</div>
            </li>
          ))}
        </ol>
        <button className="sb-cta inline-cta" type="button" onClick={() => go('list')}>Start with step 1 <Icon name="next" size={20} /></button>
      </section>

      <section className="land-sec" id="features">
        <p className="eyebrow">What's inside</p>
        <h2 className="h-sec">Everything the app does</h2>
        <ul className="feature-list">
          {FEATURES.filter(([t]) => voice || t !== 'Read aloud' || 'speechSynthesis' in window).map(([t, d]) => (
            <li key={t}>
              <Icon name="check" size={18} strokeWidth={3} className="f-ic" />
              <div><b>{t}</b><p>{d}</p></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="land-sec rules-sec">
        <div>
          <p className="eyebrow">The rules we never break</p>
          <h2 className="h-sec">What "same basket" means</h2>
          <p className="lede sm">A swap only happens when every line on this receipt holds. If we can't tell, we don't swap.</p>
        </div>
        <div className="rules-receipt mono">
          <div className="rr-head">SAME BASKET CHECK</div>
          {['Same product type', 'Same size or more', 'Same variant: organic, 2%, decaf, scent', 'Lower price at checkout', 'Not locked by you', 'Fresh meat and produce: never swapped'].map(r => (
            <div key={r} className="rr-line"><span>{r}</span><span>✓</span></div>
          ))}
          <div className="rr-foot">Prices are estimates before tax · coupons not included</div>
        </div>
      </section>

      <section className="land-sec faq-sec">
        <h2 className="h-sec">Questions</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}<Icon name="down" size={18} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="land-end">
        <h2 className="h-sec light">Your usual list. A smaller total.</h2>
        <div className="hero-ctas">
          <button className="sb-cta" type="button" onClick={() => go('list')}>Paste my list <Icon name="next" size={20} /></button>
          <button className="sb-btn ghost-light" type="button" onClick={sample}>Try the example basket</button>
        </div>
      </section>

      <footer className="land-foot">
        <Brand />
        <small>Example prices are demo data. Estimates before tax.</small>
      </footer>
    </div>
  );
}
