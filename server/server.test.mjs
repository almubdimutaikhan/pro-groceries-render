import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from './app.mjs';

const CID = 'test-client-id';
const SECRET = 'test-client-secret-VERY-SECRET';

/** A fake api.kroger.com. Records what it receives so the tests can check what the proxy sends. */
async function mockKroger({ rejectToken = false, expireFirstToken = false } = {}) {
  const state = { tokenCalls: 0, calls: [], issued: [] };
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      if (url.pathname === '/v1/connect/oauth2/token' && req.method === 'POST') {
        state.tokenCalls++;
        const expect = 'Basic ' + Buffer.from(`${CID}:${SECRET}`).toString('base64');
        if (rejectToken || req.headers.authorization !== expect) { res.writeHead(401); return res.end('{}'); }
        const params = new URLSearchParams(body);
        assert.equal(params.get('grant_type'), 'client_credentials');
        assert.equal(params.get('scope'), 'product.compact');
        const token = `tok${state.tokenCalls}`;
        state.issued.push(token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ access_token: token, expires_in: 1800 }));
      }
      state.calls.push({ path: url.pathname, search: url.search, auth: req.headers.authorization });
      const good = expireFirstToken ? 'tok2' : 'tok1';
      if (req.headers.authorization !== `Bearer ${good}`) { res.writeHead(401); return res.end('{"errors":"expired"}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ locationId: '01400441', path: url.pathname }] }));
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { state, url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise(r => srv.close(r)) };
}

function makeDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-dist-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Pro Groceries</title><div id="root"></div>');
  fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log("app");'.repeat(80));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'this is inside dist and is fine to serve');
  // a file OUTSIDE dist that must never be reachable
  fs.writeFileSync(path.join(dir, '..', 'pg-outside.txt'), 'TOP SECRET OUTSIDE DIST');
  return dir;
}

async function start({ kroger, creds = true, rateLimitPerMinute, distDir = makeDist() } = {}) {
  const env = { KROGER_API_BASE: kroger.url, ...(creds ? { KROGER_CLIENT_ID: CID, KROGER_CLIENT_SECRET: SECRET } : {}) };
  const server = createServer({ env, distDir, rateLimitPerMinute });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, distDir, close: () => new Promise(r => server.close(r)) };
}

test('status: configured when the keys work', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  const r = await fetch(`${s.base}/__kroger/status`);
  assert.deepEqual(await r.json(), { configured: true });
  await s.close(); await k.close();
});

test('status: not configured without keys, and never calls Kroger', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k, creds: false });
  const body = await (await fetch(`${s.base}/__kroger/status`)).json();
  assert.equal(body.configured, false);
  assert.equal(k.state.tokenCalls, 0);
  const r = await fetch(`${s.base}/__kroger/v1/products?filter.term=milk`);
  assert.equal(r.status, 401);
  await s.close(); await k.close();
});

test('status: reports not configured when Kroger rejects the keys (site falls back to demo)', async () => {
  const k = await mockKroger({ rejectToken: true }); const s = await start({ kroger: k });
  const body = await (await fetch(`${s.base}/__kroger/status`)).json();
  assert.deepEqual(body, { configured: false, reason: 'credentials_rejected' });
  const r = await fetch(`${s.base}/__kroger/v1/products?filter.term=milk`);
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.ok(!text.includes(SECRET) && !text.includes(CID), 'error must not leak the credentials');
  await s.close(); await k.close();
});

test('proxies locations and products with a bearer token, and fetches the token only once', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  for (const p of ['/v1/locations?filter.zipCode.near=45202', '/v1/products?filter.term=milk&filter.locationId=01400441']) {
    const r = await fetch(`${s.base}/__kroger${p}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const j = await r.json();
    assert.equal(j.data[0].locationId, '01400441');
  }
  assert.equal(k.state.tokenCalls, 1, 'token is cached across requests');
  assert.ok(k.state.calls.every(c => c.auth === 'Bearer tok1'));
  await s.close(); await k.close();
});

test('never leaks the secret or the access token to the browser', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  const r = await fetch(`${s.base}/__kroger/v1/products?filter.term=milk`);
  const all = JSON.stringify([...r.headers.entries()]) + (await r.text());
  for (const needle of [SECRET, CID, 'tok1', 'Bearer', 'Basic']) assert.ok(!all.includes(needle), `leaked ${needle}`);
  await s.close(); await k.close();
});

test('forwards only filter.* parameters and clamps the limit', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  await fetch(`${s.base}/__kroger/v1/products?filter.term=milk&filter.limit=9999&evil=1&access_token=x&filter.locationId=01400441`);
  const sent = new URLSearchParams(k.state.calls.at(-1).search);
  assert.equal(sent.get('filter.term'), 'milk');
  assert.equal(sent.get('filter.limit'), '50');
  assert.equal(sent.get('filter.locationId'), '01400441');
  assert.equal(sent.get('evil'), null);
  assert.equal(sent.get('access_token'), null);
  await s.close(); await k.close();
});

test('forwards nothing but the two read endpoints, and only GET', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  for (const p of ['/v1/cart/add', '/v1/connect/oauth2/token', '/v1/identity/profile', '/v1/locations/../cart', '/v2/products', '/']) {
    const r = await fetch(`${s.base}/__kroger${p}`);
    assert.equal(r.status, 404, p);
  }
  const post = await fetch(`${s.base}/__kroger/v1/products?filter.term=x`, { method: 'POST', body: '{}' });
  assert.equal(post.status, 404);
  assert.equal(k.state.calls.length, 0, 'nothing reached Kroger');
  await s.close(); await k.close();
});

test('renews the token once when Kroger says it expired early', async () => {
  const k = await mockKroger({ expireFirstToken: true }); const s = await start({ kroger: k });
  const r = await fetch(`${s.base}/__kroger/v1/products?filter.term=milk`);
  assert.equal(r.status, 200);
  assert.equal(k.state.tokenCalls, 2);
  await s.close(); await k.close();
});

test('identical simultaneous lookups share one upstream call', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  await Promise.all(Array.from({ length: 5 }, () => fetch(`${s.base}/__kroger/v1/products?filter.term=eggs`)));
  assert.equal(k.state.calls.filter(c => c.path === '/v1/products').length, 1);
  await s.close(); await k.close();
});

test('rate limit answers 429 and protects the Kroger quota', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k, rateLimitPerMinute: 3 });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await fetch(`${s.base}/__kroger/v1/products?filter.term=t${i}`)).status);
  assert.deepEqual(codes.slice(0, 3), [200, 200, 200]);
  assert.ok(codes.slice(3).every(c => c === 429), codes.join());
  assert.equal(k.state.calls.length, 3);
  await s.close(); await k.close();
});

test('serves the app, hashed assets with long cache, SPA fallback, and health', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  const home = await fetch(`${s.base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Pro Groceries/);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');

  const asset = await fetch(`${s.base}/assets/app-abc123.js`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal(asset.headers.get('content-encoding'), 'gzip');
  assert.match(asset.headers.get('content-type'), /javascript/);

  const spa = await fetch(`${s.base}/some/deep/route`);
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /id="root"/);

  assert.equal((await fetch(`${s.base}/assets/missing.js`)).status, 404);
  assert.equal(await (await fetch(`${s.base}/healthz`)).text(), 'ok');
  assert.equal((await fetch(`${s.base}/`, { method: 'POST' })).status, 405);
  await s.close(); await k.close();
});

test('path traversal cannot read files outside the build folder', async () => {
  const k = await mockKroger(); const s = await start({ kroger: k });
  // raw sockets so the client does not normalise the dots away
  const raw = (p) => new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port: new URL(s.base).port, path: p, method: 'GET' }, res => {
      let b = ''; res.on('data', c => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.end();
  });
  for (const p of ['/../pg-outside.txt', '/..%2fpg-outside.txt', '/%2e%2e/pg-outside.txt', '/assets/../../pg-outside.txt', '/%00', '/..\\pg-outside.txt']) {
    const r = await raw(p);
    assert.ok(!r.body.includes('TOP SECRET OUTSIDE DIST'), `${p} leaked a file outside dist`);
  }
  await s.close(); await k.close();
});

test('a missing build answers 503 instead of crashing', async () => {
  const k = await mockKroger();
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-empty-'));
  const s = await start({ kroger: k, distDir: empty });
  assert.equal((await fetch(`${s.base}/`)).status, 503);
  assert.equal((await fetch(`${s.base}/healthz`)).status, 200);
  await s.close(); await k.close();
});
