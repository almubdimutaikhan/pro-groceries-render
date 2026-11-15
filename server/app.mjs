/**
 * Production server for Render: serves the built app (app/dist) and the Kroger proxy from ONE origin,
 * so the browser never needs CORS and never sees the Kroger client secret or access token.
 *
 * Proxy contract (see app/src/lib/credentials.ts):
 *   GET /__kroger/status         -> 200 {"configured": true|false}
 *   GET /__kroger/v1/locations   -> forwarded to {KROGER_API_BASE}/v1/locations
 *   GET /__kroger/v1/products    -> forwarded to {KROGER_API_BASE}/v1/products
 * Nothing else is forwarded. No dependencies: Node 20+ only.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { createAiHandler } from './ai.mjs';

const ALLOWED_PATHS = new Set(['/v1/locations', '/v1/products']);
const MAX_PARAMS = 12;
const MAX_VALUE = 120;
const MAX_LIMIT = 50;
const MAX_TERM_WORDS = 8; // Kroger: filter.term needs 3+ characters and at most 8 words

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.map']);

class ProxyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/** Keep only Kroger `filter.*` parameters, bounded in count, length and limit. */
export function cleanQuery(search) {
  const out = new URLSearchParams();
  let n = 0;
  for (const [k, v] of new URLSearchParams(search)) {
    if (!/^filter\.[A-Za-z.]{1,40}$/.test(k) || v.length > MAX_VALUE || ++n > MAX_PARAMS) continue;
    if (k === 'filter.term') {
      const words = v.replace(/[^\p{L}\p{N}%&'.\- ]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, MAX_TERM_WORDS);
      const term = words.join(' ');
      if (term.length >= 3) out.set(k, term);
      continue;
    }
    if (k === 'filter.limit') {
      const lim = Math.min(MAX_LIMIT, Math.max(1, parseInt(v, 10) || 10));
      out.set(k, String(lim));
    } else out.append(k, v);
  }
  return out;
}

export function createServer(opts = {}) {
  const env = opts.env ?? process.env;
  const apiBase = String(env.KROGER_API_BASE || 'https://api.kroger.com').replace(/\/+$/, '');
  const distDir = path.resolve(opts.distDir ?? env.DIST_DIR ?? fileURLToPath(new URL('../app/dist/', import.meta.url)));
  const rateLimit = opts.rateLimitPerMinute ?? Number(env.RATE_LIMIT_PER_MINUTE || 90);
  const handleAi = createAiHandler(env);
  const hasKeys = () => Boolean(env.KROGER_CLIENT_ID && env.KROGER_CLIENT_SECRET);

  /* ---------- Kroger token (client_credentials), cached and renewed ---------- */
  let cached = null;
  let tokenInflight = null;
  let lastFailure = null; // { at, message } so a bad key doesn't hammer Kroger on every request

  async function accessToken(force = false) {
    if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
    if (!force && lastFailure && Date.now() - lastFailure.at < 30_000) throw new ProxyError(502, lastFailure.message);
    if (tokenInflight) return tokenInflight;
    tokenInflight = (async () => {
      const basic = Buffer.from(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`).toString('base64');
      let res;
      try {
        res = await fetch(`${apiBase}/v1/connect/oauth2/token`, {
          method: 'POST',
          headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', scope: env.KROGER_SCOPE || 'product.compact' }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new ProxyError(502, 'Could not reach Kroger to get an access token.');
      }
      if (!res.ok) {
        const message = `Kroger refused the client ID and secret (HTTP ${res.status}). Check KROGER_CLIENT_ID and KROGER_CLIENT_SECRET in Render.`;
        lastFailure = { at: Date.now(), message };
        throw new ProxyError(502, message);
      }
      const body = await res.json().catch(() => ({}));
      if (!body.access_token) throw new ProxyError(502, 'Kroger returned no access token.');
      lastFailure = null;
      cached = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 1800) * 1000 };
      return cached.token;
    })().finally(() => { tokenInflight = null; });
    return tokenInflight;
  }

  /* ---------- identical in-flight requests share one upstream call ---------- */
  const inflight = new Map();
  async function callKroger(pathname, query) {
    const url = `${apiBase}${pathname}?${query}`;
    const once = async () => fetch(url, {
      headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    let up = await once();
    if (up.status === 401) { cached = null; up = await once(); } // token expired early: renew once
    return { status: up.status, body: await up.text() };
  }
  function shared(key, fn) {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /* ---------- per-IP rate limit protects the Kroger quota ---------- */
  const hits = new Map();
  const sweep = setInterval(() => { const cut = Date.now() - 60_000; for (const [ip, list] of hits) { const keep = list.filter(t => t > cut); keep.length ? hits.set(ip, keep) : hits.delete(ip); } }, 60_000);
  sweep.unref();
  function limited(req) {
    // Behind Render's proxy the right-most X-Forwarded-For entry is the one the proxy added.
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const ip = xff[xff.length - 1] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => t > now - 60_000);
    list.push(now);
    hits.set(ip, list);
    return list.length > rateLimit;
  }

  const json = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(obj));
  };

  async function handleKroger(req, res, url) {
    const sub = url.pathname.slice('/__kroger'.length) || '/';
    if (sub === '/status') {
      if (!hasKeys()) return json(res, 200, { configured: false, reason: 'missing_credentials' });
      try { await accessToken(); return json(res, 200, { configured: true }); }
      catch { return json(res, 200, { configured: false, reason: 'credentials_rejected' }); }
    }
    if (req.method !== 'GET' || !ALLOWED_PATHS.has(sub)) return json(res, 404, { error: 'Not found.' });
    if (!hasKeys()) return json(res, 401, { error: 'The price service is not configured on this server.' });
    if (limited(req)) { res.setHeader('Retry-After', '30'); return json(res, 429, { error: 'Too many price lookups. Wait a moment and try again.' }); }
    const clean = cleanQuery(url.search);
    if (new URLSearchParams(url.search).has('filter.term') && !clean.has('filter.term')) {
      return json(res, 400, { error: 'A search term needs at least 3 characters.' });
    }
    const query = clean.toString();
    try {
      const out = await shared(`${sub}?${query}`, () => callKroger(sub, query));
      res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(out.body);
    } catch (e) {
      json(res, e instanceof ProxyError ? e.status : 502, { error: e instanceof ProxyError ? e.message : 'Kroger request failed.' });
    }
  }

  /* ---------- static files ---------- */
  const gz = new Map(); // `${file}:${mtimeMs}` -> Buffer
  function serveFile(req, res, file, immutable) {
    const ext = path.extname(file).toLowerCase();
    const stat = fs.statSync(file);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'SAMEORIGIN',
      Vary: 'Accept-Encoding',
    };
    const wantsGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && stat.size > 512;
    if (wantsGzip) {
      const key = `${file}:${stat.mtimeMs}`;
      let buf = gz.get(key);
      if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file)); gz.set(key, buf); }
      res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': buf.length });
      return res.end(req.method === 'HEAD' ? undefined : buf);
    }
    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }

  function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (rel.includes('\0')) { res.writeHead(400); return res.end(); }
    const target = path.resolve(distDir, '.' + path.posix.normalize('/' + rel));
    const inside = target === distDir || target.startsWith(distDir + path.sep);
    const indexFile = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('The app has not been built yet. Run "npm run build" first.');
    }
    if (inside && fs.existsSync(target) && fs.statSync(target).isFile()) {
      return serveFile(req, res, target, /^\/assets\//.test(url.pathname));
    }
    // Hash-routed single page app: unknown paths without a file extension get the app shell.
    if (!path.extname(url.pathname)) return serveFile(req, res, indexFile, false);
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }

  const server = http.createServer((req, res) => {
    let url;
    try { url = new URL(req.url || '/', 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
    if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('ok'); }
    if (url.pathname === '/__kroger' || url.pathname.startsWith('/__kroger/')) {
      return handleKroger(req, res, url).catch(() => json(res, 500, { error: 'Server error.' }));
    }
    if (url.pathname === '/__ai' || url.pathname.startsWith('/__ai/')) {
      return handleAi(req, res, url).catch(() => { if (!res.headersSent) json(res, 500, { error: 'Server error.' }); else res.end(); });
    }
    try { handleStatic(req, res, url); } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  server.keepAliveTimeout = 65_000; // above Render's proxy idle timeout
  server.on('close', () => clearInterval(sweep));
  return server;
}
