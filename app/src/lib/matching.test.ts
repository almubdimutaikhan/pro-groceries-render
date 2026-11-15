import { describe, expect, it } from 'vitest';
import { matchAll } from './matching';
import { compare } from './engine';
import { parseList, SAMPLE_LIST } from './parser';
import { usd } from './money';

describe('sample basket end to end (demo catalog)', () => {
  it('matches every line and produces only same-type, same-variant swaps', async () => {
    const lines = parseList(SAMPLE_LIST);
    const matched = await matchAll(lines, 'demo-downtown');
    const statuses = matched.map(m => `${m.line.raw} → ${m.status}${m.baseline ? ` (${m.baseline.productId})` : ''}`);
    expect(matched.every(m => m.status !== 'notfound'), statuses.join('\n')).toBe(true);
    const c = compare(matched, new Set(), { brandLocks: [] }, {
      id: 't', storeId: 'demo-downtown', storeName: 'demo', fetchStartedAt: '', fetchEndedAt: '', source: 'demo',
    });
    const report = c.lines.map(l => `${l.label}: ${l.original ? usd(l.original.cents) : '-'} → ${l.chosen ? `${l.chosen.product.productId} ${usd(l.chosen.cents)}` : '-'} ${l.swap ? `[${l.swap.type} ${usd(l.swap.savingCents)}]` : ''}`);
    console.log(report.join('\n'), `\nTOTAL ${usd(c.originalCents)} → ${usd(c.chosenCents)} saving ${usd(c.savingCents)} coverage ${c.pricedCount}/${c.totalCount}`);
    const byId = Object.fromEntries(c.lines.map(l => [l.original?.product.productId, l.chosen?.product.productId]));
    // The swaps this basket produced BEFORE the flavor / light groups were added to the engine (14 Nov 2026).
    // Every correct swap must survive the stricter rules; any difference is printed and fails the test.
    const BEFORE: Record<string, string> = {
      'd-tide-64': 'd-kr-det-64', 'd-bounty-6': 'd-kr-pt-6', 'd-folg': 'd-kr-cof', 'd-heinz-32': 'd-kr-ket-32', 'd-bar-spag': 'd-kr-spag',
      'd-hor-2': 'd-sto-2', 'd-quak-42': 'd-kr-oats-42', 'd-hnc': 'd-kr-hno', 'd-eb-12': 'd-hf-12', 'd-skip': 'd-kr-pb', 'd-dawn': 'd-kr-dish',
      'd-chob-32': 'd-kr-gy-32', 'd-ragu': 'd-kr-sauce', 'd-chicken': 'd-chicken', 'd-banana': 'd-banana',
    };
    const changed = Object.entries(BEFORE).filter(([from, to]) => byId[from] !== to).map(([from, to]) => `${from}: ${to} → ${byId[from]}`);
    console.log(changed.length ? `SWAPS CHANGED BY THE ENGINE UPDATE:\n${changed.join('\n')}` : 'Swaps changed by the engine update: none (all 13 swaps and 2 kept items are identical)');
    expect(changed).toEqual([]);
    expect(byId['d-hor-2']).toBe('d-sto-2');          // organic 2% stays organic 2%
    expect(byId['d-skip']).toBe('d-kr-pb');           // creamy stays creamy
    expect(byId['d-chob-32']).toBe('d-kr-gy-32');     // plain stays plain
    expect(byId['d-folg']).toBe('d-kr-cof');          // never decaf
    expect(byId['d-chicken']).toBe('d-chicken');      // fresh kept as is
    expect(c.savingCents).toBeGreaterThan(0);
  });
});
