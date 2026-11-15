import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from './db';
import { boot, getState, resetAll, setEntitlement, setState } from '../state/store';

describe('Reset on the main page', () => {
  it('clears the basket, history, membership and what is saved in the browser', async () => {
    await boot();
    setState({ listText: '2 Barilla spaghetti 16 oz', zip: '45202' });
    setEntitlement({ member: true, period: 'year', since: new Date().toISOString(), freeRepricesUsed: 1 });
    await db.put('shoppingEvents', { id: 'e1', weekKey: 'w1', basketId: 'b', comparisonId: 'c', occurredAt: '2026-11-14T00:00:00Z' } as never);
    await new Promise(r => setTimeout(r, 400));                       // let the debounced save land
    expect((await db.get('app', 'entitlement'))).toBeTruthy();

    await resetAll();

    const s = getState();
    expect(s.listText).toBe('');
    expect(s.lines).toHaveLength(0);
    expect(s.comparison).toBeNull();
    expect(s.events).toHaveLength(0);
    expect(s.entitlement.member).toBe(false);
    expect(s.entitlement.freeRepricesUsed).toBe(0);
    expect(await db.get('app', 'entitlement')).toBeUndefined();
    expect(await db.all('shoppingEvents')).toHaveLength(0);
  });
});
