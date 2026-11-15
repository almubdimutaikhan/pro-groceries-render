import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isGatewayTrouble, onBackendTrouble, proxyFetch, resetBackendReports } from './backend';

const res = (status: number, type: string) => new Response('x', { status, headers: { 'content-type': type } });

describe('friendly note when the free host is asleep', () => {
  let told: number;
  let off: () => void;
  beforeEach(() => { resetBackendReports(); told = 0; off = onBackendTrouble(() => { told++; }); });
  afterEach(() => { off(); vi.unstubAllGlobals(); });

  it('speaks up when the request never arrives', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(proxyFetch('/x')).rejects.toThrow();
    expect(told).toBe(1);
  });

  it('speaks up for a non-JSON gateway page, but not for our own JSON errors', async () => {
    expect(isGatewayTrouble(res(503, 'text/html'))).toBe(true);
    expect(isGatewayTrouble(res(502, 'text/plain'))).toBe(true);
    expect(isGatewayTrouble(res(503, 'application/json; charset=utf-8'))).toBe(false); // our own "busy" answer
    expect(isGatewayTrouble(res(404, 'text/html'))).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => res(503, 'text/html')));
    await proxyFetch('/x');
    expect(told).toBe(1);
  });

  it('says it once, not on every failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    for (let i = 0; i < 4; i++) await proxyFetch('/x').catch(() => undefined);
    expect(told).toBe(1);
  });

  it('stays quiet when the shopper is simply offline', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await proxyFetch('/x').catch(() => undefined);
    expect(told).toBe(0);
    vi.unstubAllGlobals();
  });

  it('passes a healthy answer straight through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(200, 'application/json')));
    expect((await proxyFetch('/x')).status).toBe(200);
    expect(told).toBe(0);
  });

  it('delivers trouble that happened before the page was listening', async () => {
    off(); resetBackendReports();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await proxyFetch('/x').catch(() => undefined);
    let late = 0;
    off = onBackendTrouble(() => { late++; });
    expect(late).toBe(1);
  });
});
