import { useEffect, useRef, useState } from 'react';
import { Screen, TopBar, toast, usePriceSource, useMember } from '../components/ui';
import { Icon } from '../components/Icon';
import { go } from '../state/router';
import { setState, useApp, clearMyData, boot } from '../state/store';
import { getCreds, setCreds, subscribeCreds, hasKroger, hasMangisoz, hasOpenRouter, krogerViaProxy, KROGER_PROXY_BASE } from '../lib/credentials';
import { exportAll, importAll } from '../lib/db';
import { setThemePref, useTheme } from '../lib/theme';
import { isOperator } from '../lib/operator';
import { YEAR_LABEL } from '../lib/pricing';

function useCreds() {
  const [c, setC] = useState(getCreds());
  useEffect(() => subscribeCreds(() => setC(getCreds())), []);
  return c;
}

function KeyField({ id, label, hint, value, onSave, placeholder }: { id: string; label: string; hint: string; value: string; onSave: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState(value);
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="key-row">
        <input id={id} className="sb-input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false}
          value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onBlur={() => onSave(v)} />
        <button type="button" className="ghost-btn sm" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      <small>{hint}</small>
    </div>
  );
}

/** Keys and rehearsal tools. Only rendered in operator mode (`?operator=1`, or `npm run dev`). */
function OperatorSetup() {
  const creds = useCreds();
  return (
    <section className="operator" aria-label="Operator setup">
      <h2 className="h-sub">Operator setup <span className="sb-chip sb-chip--promo">not shown to shoppers</span></h2>
      <p className="hint">Service keys are kept in this tab's memory only. Never saved, never sent anywhere but the service itself. Reloading clears them.</p>
      <p className="hint">Kroger prices: {krogerViaProxy() ? `through the proxy at ${KROGER_PROXY_BASE}` : KROGER_PROXY_BASE ? `proxy at ${KROGER_PROXY_BASE} is not configured` : 'no proxy configured (set VITE_KROGER_PROXY_BASE)'}.</p>
      <KeyField id="k-kroger" label={`Kroger access token ${hasKroger() && !krogerViaProxy() ? '· connected' : ''}`} placeholder="eyJhbGciOi…"
        hint="Short-lived bearer token (product.compact), for a host where Kroger allows the origin. Generate it outside the browser; the client secret never goes here." value={creds.krogerToken} onSave={v => setCreds({ krogerToken: v })} />
      <KeyField id="k-mangisoz" label={`MangiSoz key ${hasMangisoz() ? '· connected' : ''}`} placeholder="ak_…"
        hint="Turns on voice input, receipt photos and the service voice. Without it those controls are hidden." value={creds.mangisozKey} onSave={v => setCreds({ mangisozKey: v })} />
      <KeyField id="k-or" label={`OpenRouter key ${hasOpenRouter() ? '· connected' : ''}`} placeholder="sk-or-…"
        hint="Optional. Better reading of messy lists. Without it we use the built-in parser." value={creds.openrouterKey} onSave={v => setCreds({ openrouterKey: v })} />
      <div className="field">
        <label htmlFor="k-model">OpenRouter model</label>
        <input id="k-model" className="sb-input" value={creds.openrouterModel} onChange={e => setCreds({ openrouterModel: e.target.value })} />
      </div>
    </section>
  );
}

export function Settings() {
  const { pref } = useTheme();
  const prefs = useApp(s => s.prefs);
  const comparison = useApp(s => s.comparison);
  const member = useMember();
  const source = usePriceSource();
  const [brand, setBrand] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const operator = isOperator();

  async function doExport() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify({ app: 'pro-groceries', exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pro-groceries-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function doImport(f: File | undefined) {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const n = await importAll(j.data ?? j);
      await boot();
      toast(`Imported ${n} records`);
    } catch {
      toast('That file isn’t a Pro Groceries export.');
    }
  }

  function addBrand() {
    const b = brand.trim().toLowerCase();
    if (!b) return;
    setState(s => ({ prefs: { ...s.prefs, brandLocks: [...new Set([...s.prefs.brandLocks, b])] } }));
    setBrand('');
  }

  return (
    <Screen top={<TopBar backTo={comparison ? 'home' : 'welcome'} title="Settings" right={<span className="icon-spacer" />} />} className="settings">

      <section className="mode-card" data-live={source === 'kroger'}>
        <b>{source === 'kroger' ? 'Live Kroger prices' : 'Demo prices'}</b>
        <small>{source === 'kroger' ? 'Prices come from the Kroger API for the store you pick.' : 'Illustrative prices so you can try the flow. Live Kroger prices are not connected in this build yet.'}</small>
      </section>

      <section>
        <h2 className="h-sub">Appearance</h2>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map(p => (
            <button key={p} type="button" role="radio" aria-checked={pref === p} className={pref === p ? 'on' : ''} onClick={() => setThemePref(p)}>
              {p !== 'system' && <Icon name={p === 'dark' ? 'moon' : 'sun'} size={16} />}
              {p === 'system' ? 'Device' : p === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="h-sub">Never swap these brands</h2>
        <form className="zip-row" onSubmit={e => { e.preventDefault(); addBrand(); }}>
          <label className="sr-only" htmlFor="brand-lock">Brand</label>
          <input id="brand-lock" className="sb-input" placeholder="e.g. Folgers" value={brand} onChange={e => setBrand(e.target.value)} />
          <button className="sb-btn" type="submit">Add</button>
        </form>
        <div className="chips">
          {prefs.brandLocks.map(b => (
            <button key={b} type="button" className="sb-chip sb-chip--exact" onClick={() => setState(s => ({ prefs: { ...s.prefs, brandLocks: s.prefs.brandLocks.filter(x => x !== b) } }))}>
              {b} <Icon name="x" size={12} />
            </button>
          ))}
          {!prefs.brandLocks.length && <small className="hint">Locks you set on the result screen are remembered too.</small>}
        </div>
      </section>

      <section>
        <h2 className="h-sub">Membership</h2>
        <p className="hint">{member ? 'You are a member: weekly re-pricing, the savings counter and the Weekly report are on.' : `Weekly re-pricing, the savings counter and the Weekly report are for members (${YEAR_LABEL}).`}</p>
        <button type="button" className="ghost-btn" onClick={() => go('plan')}>{member ? 'View membership' : 'See membership'}</button>
      </section>

      <section>
        <h2 className="h-sub">Your data</h2>
        <p className="hint">Your basket and history live in this browser only (IndexedDB). No account, no cloud copy.</p>
        <div className="input-actions">
          <button type="button" className="ghost-btn" onClick={doExport}><Icon name="share" size={18} />Export history</button>
          <button type="button" className="ghost-btn" onClick={() => file.current?.click()}><Icon name="plus" size={18} />Import</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={e => doImport(e.target.files?.[0])} />
        </div>
        {!confirmClear ? (
          <button type="button" className="danger-btn" onClick={() => setConfirmClear(true)}>Clear my data</button>
        ) : (
          <div className="confirm-box" role="alert">
            <b>Delete your basket, locks and history from this browser?</b>
            <div className="input-actions">
              <button type="button" className="danger-btn solid" onClick={async () => { await clearMyData(); toast('Your data is cleared'); go('welcome', true); }}>Yes, clear it</button>
              <button type="button" className="ghost-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

      <section className="about">
        <h2 className="h-sub">How it works</h2>
        <ul className="plain-list">
          <li><span>Prices</span><small>{source === 'kroger' ? 'Kroger API, per store, with fetch time' : 'Demo catalog'}</small></li>
          <li><span>Swaps and totals</span><small>Fixed rules, integer cents, no AI</small></li>
          <li><span>Reading your list</span><small>{hasOpenRouter() ? 'AI-assisted, checked by our parser' : 'Built-in parser'}</small></li>
        </ul>
      </section>

      {operator && <OperatorSetup />}
    </Screen>
  );
}
