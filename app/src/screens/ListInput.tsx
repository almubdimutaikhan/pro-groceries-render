import { useMemo, useState } from 'react';
import { Screen, TopBar, toast, StorageNote } from '../components/ui';
import { Icon } from '../components/Icon';
import { VoiceButton, PhotoButton, useMangisoz } from '../components/voice';
import { go } from '../state/router';
import { setState, useApp } from '../state/store';
import { parseText } from '../state/actions';
import { parseList, PLACEHOLDER_LIST, SAMPLE_LIST } from '../lib/parser';
import { receiptToList } from '../lib/mangisoz';
import { formatQty } from '../lib/units';

export function ListInput() {
  const voice = useMangisoz();
  const saved = useApp(s => s.listText);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => parseList(text), [text]);

  const update = (t: string) => { setText(t); setState({ listText: t }); };
  const append = (t: string) => update([text.trim(), t.trim()].filter(Boolean).join('\n'));

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) { append(t); toast(`Pasted ${parseList(t).length} items`); } else toast('Your clipboard is empty.');
    } catch {
      toast('Long-press the box and choose Paste.');
      document.getElementById('list-text')?.focus();
    }
  }

  // Rebuild from the parsed items, so removing works whether the list is one item per line or comma separated.
  function removeLine(raw: string) {
    update(preview.filter(l => l.raw !== raw).map(l => l.raw).join('\n'));
  }

  async function next() {
    setBusy(true);
    try {
      await parseText(text);
      go('store');
    } finally {
      setBusy(false);
    }
  }

  const parsedPanel = preview.length > 0 ? (
    <section className="parsed" aria-label="What we understood">
      <h2 className="h-sub">We read {preview.length} item{preview.length === 1 ? '' : 's'}</h2>
      <ul className="parsed-list">
        {preview.map((l, i) => (
          <li key={l.id} className="parsed-row" style={{ ['--i' as string]: i }}>
            <span className="parsed-main">
              <b>{l.count > 1 && `${l.count} × `}{[l.brand, l.description].filter(Boolean).join(' ')}</b>
              <small>
                {[l.size && formatQty(l.size), ...l.variants].filter(Boolean).join(' · ') || (l.brand ? 'any size' : 'we’ll ask which one')}
              </small>
            </span>
            {l.scope === 'keep' && <span className="sb-chip sb-chip--exact">kept as is</span>}
            {l.scope === 'unsupported' && <span className="sb-chip sb-chip--ask">not supported</span>}
            <button type="button" className="icon-btn sm" aria-label={`Remove ${l.raw}`} onClick={() => removeLine(l.raw)}><Icon name="x" size={16} /></button>
          </li>
        ))}
      </ul>
      <p className="hint">Fresh produce and meat are priced but never swapped. Medicine and alcohol aren't supported.</p>
    </section>
  ) : (
    <section className="parsed empty-parsed">
      <h2 className="h-sub">What we'll read</h2>
      <p className="hint">One item per line or comma. Brands and sizes help: “Barilla spaghetti 16 oz”. Just “milk” is fine too, and we'll ask which one.</p>
    </section>
  );

  return (
    <Screen
      top={<TopBar backTo="welcome" progress={0.2} />}
      aside={parsedPanel}
      footer={
        <>
          <button className="sb-cta" type="button" disabled={!preview.length || busy} onClick={next}>
            {busy ? 'Reading your list…' : preview.length ? `Find cheaper options for ${preview.length} item${preview.length === 1 ? '' : 's'}` : 'Add a few items'}
          </button>
          <p className="foot-note">Kroger stores only for now</p>
        </>
      }
    >
      <h1 className="h-screen">What's in your usual basket?</h1>
      <p className="lede sm">{voice ? 'Paste it, say it, or snap last week\'s receipt.' : 'Paste it or type it, one item per line.'}</p>

      <label className="sr-only" htmlFor="list-text">Your grocery list</label>
      <textarea
        id="list-text"
        className="sb-input list-box"
        value={text}
        onChange={e => update(e.target.value)}
        placeholder={PLACEHOLDER_LIST}
        rows={8}
        autoCapitalize="none"
        spellCheck={false}
      />

      <div className="input-actions">
        <button type="button" className="ghost-btn" onClick={pasteFromClipboard}><Icon name="copy" size={18} />Paste</button>
        <VoiceButton onText={t => { append(t); toast('Added what you said. Check it below.'); }} label="Say it" />
        {!text.trim() && <button type="button" className="ghost-btn" onClick={() => update(SAMPLE_LIST)}><Icon name="list" size={18} />Sample</button>}
      </div>

      <PhotoButton onText={ocr => { const l = receiptToList(ocr); append(l); toast(`Found ${parseList(l).length} items in the photo. Check them below.`); }} />

      <StorageNote />
    </Screen>
  );
}
