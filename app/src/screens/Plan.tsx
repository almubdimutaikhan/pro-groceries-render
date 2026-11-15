import { useEffect, useState } from 'react';
import { Screen, TopBar, useMember, Money } from '../components/ui';
import { Icon } from '../components/Icon';
import { back, hashParams } from '../state/router';
import { STRIPE_LINK, STRIPE_LINK_MONTHLY } from '../lib/credentials';
import { useApp } from '../state/store';
import { counterCents, grantMembership } from '../state/actions';
import { usd } from '../lib/money';
import { GUARANTEE_MULTIPLE, GUARANTEE_TARGET_CENTS, MONTH_CENTS, YEAR_CENTS, YEAR_DISCOUNT_PCT, YEAR_PER_MONTH_CENTS } from '../lib/pricing';

type Period = 'year' | 'month';

/**
 * Stripe's Payment Link sends the shopper back to `#plan?checkout=success` (add `&period=month` on the
 * monthly link). With no server there is nothing to verify that return against, so this unlocks the
 * member features on this device only: a demo-grade gate, not payment verification (see README).
 */
function useCheckoutReturn(): Period | null {
  const [granted, setGranted] = useState<Period | null>(null);
  useEffect(() => {
    function check() {
      const q = hashParams();
      if (q.get('checkout') !== 'success') return;
      const period: Period = q.get('period') === 'month' ? 'month' : 'year';
      history.replaceState(null, '', '#plan'); // a reload must not repeat it
      grantMembership(period);
      setGranted(period);
    }
    check();
    window.addEventListener('hashchange', check);   // also when this screen is already open
    return () => window.removeEventListener('hashchange', check);
  }, []);
  return granted;
}

export function Plan() {
  const c = useApp(s => s.comparison);
  const entitlement = useApp(s => s.entitlement);
  const member = useMember();
  const justJoined = useCheckoutReturn();
  const [period, setPeriod] = useState<Period>('year');
  const bars = [38, 52, 30, 66, 84];
  const link = period === 'year' ? STRIPE_LINK : STRIPE_LINK_MONTHLY;
  const price = period === 'year' ? `${usd(YEAR_CENTS)}/year` : `${usd(MONTH_CENTS)}/month`;
  const saved = counterCents(false);

  return (
    <Screen
      className="plan narrow"
      footer={
        member ? (
          <button type="button" className="sb-cta" onClick={() => back('home')}>Back to my basket</button>
        ) : (
          <>
            <p className="test-mode"><Icon name="info" size={14} /> Test mode: no real charge</p>
            {link ? (
              <a className="sb-cta" href={link} target="_blank" rel="noopener noreferrer">Continue to checkout · {price}</a>
            ) : (
              <button className="sb-cta" type="button" disabled>Checkout opens in the live demo</button>
            )}
            <button type="button" className="text-btn" onClick={() => back('home')}>Keep using it free</button>
          </>
        )
      }
    >
      <div className="plan-top">
        <TopBar backTo="home" title="" right={<span className="icon-spacer" />} />
        <p className="eyebrow light">Pro Groceries Membership</p>
        <h1 className="h-screen light">{member ? (justJoined ? 'Welcome, member.' : 'You are a member.') : 'Your list stays free. Want it re-priced every week?'}</h1>
        <p className="lede light">{c && c.savingCents > 0 ? `Your last basket came out ${usd(c.savingCents)} cheaper. ` : ''}Prices move every week. Keep your basket, locks and history in one place.</p>
        <div className="mini-bars" aria-hidden="true">{bars.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
      </div>

      {member ? (
        <section className="guarantee" aria-label="Your membership">
          <Icon name="shield" size={20} />
          <span>
            <b>{entitlement.period === 'month' ? 'Monthly' : 'Yearly'} membership is on.</b>{' '}
            Save {GUARANTEE_MULTIPLE}× your membership or get your money back: {usd(GUARANTEE_TARGET_CENTS)} over the year for the yearly plan. Saved on live prices so far: <Money cents={saved} />.
          </span>
        </section>
      ) : (
        <>
          <div className="plan-options" role="radiogroup" aria-label="Billing period">
            <button type="button" role="radio" aria-checked={period === 'year'} className={`plan-card ${period === 'year' ? 'on' : ''}`} onClick={() => setPeriod('year')}>
              <span><b>Yearly membership<span className="best">Save {YEAR_DISCOUNT_PCT}%</span></b><small>About {usd(YEAR_PER_MONTH_CENTS)} a month, billed once a year</small></span>
              <span className="plan-price"><b className="sb-price">{usd(YEAR_CENTS)}</b><small>/year</small></span>
            </button>
            <button type="button" role="radio" aria-checked={period === 'month'} className={`plan-card ${period === 'month' ? 'on' : ''}`} onClick={() => setPeriod('month')}>
              <span><b>Monthly</b><small>Cancel anytime</small></span>
              <span className="plan-price"><b className="sb-price">{usd(MONTH_CENTS)}</b><small>/month</small></span>
            </button>
          </div>

          {period === 'year' && (
            <p className="guarantee">
              <Icon name="shield" size={20} />
              <span><b>Save {GUARANTEE_MULTIPLE}× your membership or get your money back.</b> If your baskets save you less than {usd(GUARANTEE_TARGET_CENTS)} over the year, we refund the {usd(YEAR_CENTS)}.</span>
            </p>
          )}
        </>
      )}

      <ul className="incl">
        <li><Icon name="check" size={18} strokeWidth={3} />Re-price your basket every week, in one tap</li>
        <li><Icon name="check" size={18} strokeWidth={3} />Savings counter: what you've saved so far</li>
        <li><Icon name="check" size={18} strokeWidth={3} />Weekly report with a price watch on your products</li>
        {(period === 'year' || member) && <li><Icon name="check" size={18} strokeWidth={3} />The {GUARANTEE_MULTIPLE}× guarantee (yearly plan)</li>}
      </ul>
      <p className="fine"><b>Free, always:</b> building your cheaper basket, the shopping list, keeping originals and one re-pricing.</p>
      {!member && <p className="fine">Stripe test mode during the demo: no real charge. Renews {period === 'year' ? 'yearly' : 'monthly'} until cancelled. Your first basket and shopping list are always free.</p>}
    </Screen>
  );
}
