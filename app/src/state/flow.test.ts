import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getState, boot } from './store';
import { parseText, loadStores, matchAtStore, runComparison, toggleLock, markShopped, counterCents, reprice, interpret, applyCommand, answer, pendingQuestions } from './actions';
import { SAMPLE_LIST } from '../lib/parser';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('full shopper flow (demo mode, fake IndexedDB)', () => {
  it('sample → store → result → lock → shop → reload → reprice', async () => {
    await boot();
    expect(getState().booted).toBe(true);

    await parseText(`${SAMPLE_LIST}\nmilk`);
    const stores = await loadStores('45202');
    await matchAtStore(stores[0]);
    // "milk" has no brand ⇒ exactly one question
    const qs = pendingQuestions();
    expect(qs.map(q => q.line.raw)).toEqual(['milk']);
    answer(qs[0].line.id, qs[0].options.find(o => o.brand === 'Kroger') ?? qs[0].options[0]);

    const c1 = await runComparison();
    expect(c1.savingCents).toBeGreaterThan(0);

    // F05: locking lowers the saving by exactly that swap
    const tide = c1.lines.find(l => l.label.includes('Tide'))!;
    toggleLock(tide.lockKey);
    const c2 = getState().comparison!;
    expect(c1.savingCents - c2.savingCents).toBe(tide.swap!.savingCents);

    // voice command: "swap the tide" undoes the lock
    const cmd = interpret('swap tide');
    expect(cmd.kind).toBe('unlock');
    await applyCommand(cmd, 'voice');
    expect(getState().comparison!.savingCents).toBe(c1.savingCents);
    toggleLock(tide.lockKey); // keep it locked for the rest

    // F06: one counted entry per basket per week
    const ids = getState().comparison!.lines.filter(l => l.chosen).map(l => l.lineId);
    await markShopped(ids, 'tap');
    await markShopped(ids, 'tap');
    expect(getState().events).toHaveLength(1);
    const counted = counterCents();
    expect(counted).toBe(getState().comparison!.savingCents);

  }, 30000);

  it('restores basket + locks after reload and repricing never inflates the counter', async () => {
    await parseText(SAMPLE_LIST);
    const stores = await loadStores('45202');
    await matchAtStore(stores[0]);
    await runComparison();
    const lockKey = getState().comparison!.lines.find(l => l.swap)!.lockKey;
    toggleLock(lockKey);
    const ids = getState().comparison!.lines.filter(l => l.chosen).map(l => l.lineId);
    await markShopped(ids, 'tap');
    const before = counterCents();
    await wait(400);

    await boot(); // simulated reload from IndexedDB
    const s = getState();
    expect(s.lines.length).toBe(15);
    expect(s.locks).toContain(lockKey);
    expect(s.comparison).not.toBeNull();

    for (let i = 0; i < 5; i++) await reprice();
    expect(counterCents()).toBe(before);
    expect(getState().comparison!.lines.find(l => l.lockKey === lockKey)!.locked).toBe(true);
  }, 60000);
});
