import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Local development only: live Kroger prices without pasting a token.
 *
 * Kroger's API answers browser preflight requests without CORS headers (checked 14 Nov 2026), so a
 * page cannot call it directly. This dev-server middleware does it instead:
 *   - reads KROGER_CLIENT_ID / KROGER_CLIENT_SECRET from ../.env.local (or ./.env.local),
 *   - exchanges them for a 30-minute access token (client_credentials) and renews it when needed,
 *   - forwards GET /__kroger/v1/locations and /__kroger/v1/products to api.kroger.com.
 * The secret and the token stay in this Node process; the browser only sees product data.
 * It exists in `npm run dev` only. A production host needs its own small proxy function.
 */
interface Req { url?: string; method?: string }
interface Res { statusCode: number; setHeader(name: string, value: string): void; end(body?: string): void }

const KROGER_API = 'https://api.kroger.com/v1';
const ALLOWED_PATHS = ['/v1/locations', '/v1/products'];

function krogerDevProxy() {
  let cached: { token: string; expiresAt: number; clientId: string } | null = null;

  // Read on every request so new keys work without restarting the dev server.
  const readEnv = () => ({ ...loadEnv('development', '..', 'KROGER_'), ...loadEnv('development', '.', 'KROGER_') });

  async function accessToken(env: Record<string, string>): Promise<string> {
    const id = env.KROGER_CLIENT_ID;
    if (cached && cached.clientId === id && cached.expiresAt > Date.now() + 60_000) return cached.token;
    const res = await fetch(`${KROGER_API}/connect/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${id}:${env.KROGER_CLIENT_SECRET}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: env.KROGER_SCOPE || 'product.compact' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Kroger refused the client ID and secret in .env.local (HTTP ${res.status}).`);
    const body = await res.json() as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('Kroger returned no access token.');
    cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 1800) * 1000, clientId: id };
    return cached.token;
  }

  const send = (res: Res, status: number, body: string) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  };

  return {
    name: 'kroger-dev-proxy',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use(route: string, handler: (req: Req, res: Res) => void): void } }) {
      server.middlewares.use('/__kroger', async (req, res) => {
        const env = readEnv();
        const configured = Boolean(env.KROGER_CLIENT_ID && env.KROGER_CLIENT_SECRET);
        const url = req.url ?? '';
        const path = url.split('?')[0];

        if (path === '/status') return send(res, 200, JSON.stringify({ configured }));
        if (req.method !== 'GET' || !ALLOWED_PATHS.includes(path)) return send(res, 404, JSON.stringify({ error: 'Not found.' }));
        if (!configured) return send(res, 401, JSON.stringify({ error: 'Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to .env.local.' }));

        try {
          const call = async () => fetch(`${KROGER_API}${url.slice('/v1'.length)}`, {
            headers: { Authorization: `Bearer ${await accessToken(env)}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(20000),
          });
          let upstream = await call();
          if (upstream.status === 401) { cached = null; upstream = await call(); } // token expired early: renew once
          send(res, upstream.status, await upstream.text());
        } catch (e) {
          send(res, 502, JSON.stringify({ error: e instanceof Error ? e.message : 'Kroger request failed.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), krogerDevProxy()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
