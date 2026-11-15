/**
 * Voice, photo and list-reading proxy. The MangiSoz and OpenRouter keys stay on this server.
 *
 *   GET  /__ai/status  -> {"mangisoz": bool, "parse": bool}            which services this server can reach
 *   POST /__ai/stt     multipart audio file          -> {"text"}       MangiSoz speech-to-text
 *   POST /__ai/tts     JSON {text, lang?}            -> audio/wav      MangiSoz emotional TTS (first female voice, neutral), classic TTS as fallback
 *   POST /__ai/ocr     multipart image file          -> {"text"}       MangiSoz OCR
 *   POST /__ai/parse   JSON {text}                   -> {"items"}      OpenRouter list reading
 *
 * Because a public site holding the team's keys is otherwise a free API for strangers, the server
 * (not the browser) decides the endpoint, the OpenRouter prompt, schema and models, and enforces body
 * size caps, per-visitor per-minute and per-day limits, a site-wide daily cap and a concurrency cap.
 * Upstream error details are never passed to the browser, and nothing from a request is logged.
 */
import { Buffer } from 'node:buffer';

const MAX_AUDIO = 8 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_JSON = 16 * 1024;
const TTS_MAX_CHARS = 1500;
const PARSE_MAX_CHARS = 4000;
const LANGS = new Set(['en', 'kk', 'ru', 'tr', 'zh', 'ar', 'az', 'es', 'fr', 'kr', 'uz']);
const DEFAULT_MODELS = ['z-ai/glm-5.3-flash', 'meta-llama/llama-3.1-8b-instruct'];

const SCHEMA = {
  name: 'grocery_list',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['text', 'product'],
          properties: {
            text: { type: 'string', description: 'the shopper\'s own words for this one item, copied exactly' },
            product: { type: 'string', description: 'product type words only, e.g. "spaghetti"' },
          },
        },
      },
    },
  },
};
const SYSTEM_PROMPT = 'Split a US grocery list into items. A spoken list often reads "Barilla spaghetti, 16-ounce, Heinz ketchup, 32-ounce, Eggland\'s Best large eggs, a dozen": a size or quantity such as "16-ounce", "32 oz", "100-count" or "a dozen" belongs to the item it describes (the one just before it) and is never an item by itself. Copy each item exactly as the shopper said it, including its size. Never invent sizes, brands or prices. Do not merge or drop items.';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createAiHandler(env, { now = () => Date.now() } = {}) {
  const base = String(env.MANGISOZ_BASE_URL || 'https://mangisoz.nu.edu.kz/backend').replace(/\/+$/, '');
  const mangisozKey = String(env.MANGISOZ_API_KEY || '');
  const openrouterKey = String(env.OPENROUTER_API_KEY || '');
  const openrouterBase = String(env.OPENROUTER_API_BASE || 'https://openrouter.ai/api').replace(/\/+$/, '');
  const models = String(env.OPENROUTER_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
  const modelList = models.length ? models : DEFAULT_MODELS;
  const perMinute = Number(env.AI_RATE_PER_MINUTE || 20);
  const perIpDay = Number(env.AI_DAILY_PER_IP || 200);
  const totalDay = Number(env.AI_DAILY_TOTAL || 3000);
  const maxConcurrent = Number(env.AI_MAX_CONCURRENT || 4);

  const hasMangisoz = () => mangisozKey.startsWith('ak_');
  const hasParse = () => openrouterKey.length > 10;

  /* ---------- limits ---------- */
  const minute = new Map();           // ip -> timestamps in the last minute
  const day = { key: '', perIp: new Map(), total: 0 };
  let active = 0;
  const sweep = setInterval(() => { const cut = now() - 60_000; for (const [ip, l] of minute) { const k = l.filter(t => t > cut); k.length ? minute.set(ip, k) : minute.delete(ip); } }, 60_000);
  sweep.unref();

  function clientIp(req) {
    // Behind Render's proxy the right-most X-Forwarded-For entry is the one the proxy added.
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
    return xff[xff.length - 1] || req.socket.remoteAddress || 'unknown';
  }
  function admit(req) {
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if (day.key !== today) { day.key = today; day.perIp.clear(); day.total = 0; }
    const ip = clientIp(req);
    const recent = (minute.get(ip) || []).filter(x => x > t - 60_000);
    if (recent.length >= perMinute) throw new HttpError(429, 'Too many requests. Wait a moment and try again.');
    if ((day.perIp.get(ip) || 0) >= perIpDay) throw new HttpError(429, 'Daily limit reached for this connection.');
    if (day.total >= totalDay) throw new HttpError(503, 'The service has reached its daily limit. Try again tomorrow.');
    if (active >= maxConcurrent) throw new HttpError(503, 'Busy right now. Try again in a few seconds.');
    recent.push(t); minute.set(ip, recent);
    day.perIp.set(ip, (day.perIp.get(ip) || 0) + 1);
    day.total += 1;
    active += 1;
  }

  /* ---------- helpers ---------- */
  async function readBody(req, max) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) throw new HttpError(413, 'That file is too large.');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw new HttpError(413, 'That file is too large.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function readJson(req, max = MAX_JSON) {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'Send JSON.');
    try { return JSON.parse((await readBody(req, max)).toString('utf8')); } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, 'Invalid JSON.');
    }
  }
  function requireMultipart(req) {
    const type = String(req.headers['content-type'] || '');
    if (!/^multipart\/form-data;\s*boundary=/i.test(type)) throw new HttpError(415, 'Send a multipart form with a file.');
    return type;
  }
  async function upstream(url, init) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout ?? 60_000) }); }
    catch { throw new HttpError(502, 'The service did not answer. Try again.'); }
  }
  const send = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(obj));
  };
  const unavailable = (what) => new HttpError(502, `${what} isn't available right now.`);

  /* ---------- routes ---------- */
  async function stt(req, res) {
    if (!hasMangisoz()) throw new HttpError(503, 'Voice is not configured on this server.');
    const type = requireMultipart(req);
    const body = await readBody(req, MAX_AUDIO);
    const up = await upstream(`${base}/api/v1/stt/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${mangisozKey}`, 'Content-Type': type }, body });
    if (!up.ok) throw unavailable('Voice');
    const j = await up.json().catch(() => null);
    if (!j) throw unavailable('Voice');
    send(res, 200, { text: String(j.text ?? j.data?.text ?? '').slice(0, 4000) });
  }

  /* Read aloud uses MangiSoz's emotional TTS: the FIRST female voice for the language, neutral emotion.
     (Verified 2026-11-15: for English that is "Olivia"; emotional TTS takes X-API-Key, and the audio is a
     60-second file fetched by id.) The classic voice is the fallback so read aloud never just breaks. */
  const voices = new Map(); // language -> { id, at }
  async function femaleVoice(lang) {
    const hit = voices.get(lang);
    if (hit && now() - hit.at < 3_600_000) return hit.id;
    let id = lang === 'en' ? 'Olivia' : null;
    try {
      const r = await upstream(`${base}/api/v1/expressive-tts/voices?${new URLSearchParams({ language: lang, gender: 'female' })}`, { headers: { 'X-API-Key': mangisozKey }, timeout: 15_000 });
      if (r.ok) {
        const list = (await r.json().catch(() => null))?.data;
        const first = Array.isArray(list) ? list.find(v => v && typeof v.id === 'string' && (v.emotions ?? ['neutral']).includes('neutral')) : null;
        if (first) id = first.id;
      }
    } catch { /* keep the fallback id */ }
    if (id) voices.set(lang, { id, at: now() });
    return id;
  }

  async function emotionalSpeech(text, lang) {
    try {
      const voice = await femaleVoice(lang);
      if (!voice) return null;
      const gen = await upstream(`${base}/api/v1/expressive-tts/tts`, {
        method: 'POST', headers: { 'X-API-Key': mangisozKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, language: lang, emotion: 'neutral' }), timeout: 45_000,
      });
      if (!gen.ok) return null;
      const id = (await gen.json().catch(() => null))?.data?.file_id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(id)) return null;
      const file = await upstream(`${base}/api/v1/expressive-tts/files/${id}`, { headers: { 'X-API-Key': mangisozKey }, timeout: 30_000 });
      if (!file.ok) return null;
      const audio = Buffer.from(await file.arrayBuffer());
      return audio.length && audio.length <= 12 * 1024 * 1024 ? audio : null;
    } catch { return null; }
  }

  async function classicSpeech(text, lang) {
    const up = await upstream(`${base}/api/v1/tts/audio`, { method: 'POST', headers: { 'X-API-Key': mangisozKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ text, lang, speaker: 'female' }) });
    if (!up.ok) throw unavailable('Read aloud');
    const audio = Buffer.from(await up.arrayBuffer());
    if (audio.length > 12 * 1024 * 1024) throw unavailable('Read aloud');
    return audio;
  }

  async function tts(req, res) {
    if (!hasMangisoz()) throw new HttpError(503, 'Read aloud is not configured on this server.');
    const j = await readJson(req);
    // Square-bracket tags like [laugh] make the emotional voice make sounds; visitors don't get to add them.
    const text = typeof j.text === 'string' ? j.text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new HttpError(400, 'Nothing to read.');
    if (text.length > TTS_MAX_CHARS) throw new HttpError(413, 'That text is too long to read aloud.');
    const lang = LANGS.has(j.lang) ? j.lang : 'en';
    const audio = (await emotionalSpeech(text, lang)) ?? (await classicSpeech(text, lang));
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(audio);
  }

  async function ocr(req, res) {
    if (!hasMangisoz()) throw new HttpError(503, 'Photo reading is not configured on this server.');
    const type = requireMultipart(req);
    const body = await readBody(req, MAX_IMAGE);
    const up = await upstream(`${base}/api/v1/ocr/image`, { method: 'POST', headers: { 'X-API-Key': mangisozKey, 'Content-Type': type }, body });
    if (!up.ok) throw unavailable('Photo reading');
    const j = await up.json().catch(() => null);
    const d = j?.data ?? {};
    const text = typeof d.text === 'string' ? d.text
      : Array.isArray(d.blocks) ? d.blocks.map(b => String(b?.text ?? '')).join('\n') : '';
    send(res, 200, { text: text.slice(0, 20_000) });
  }

  async function parse(req, res) {
    if (!hasParse()) throw new HttpError(503, 'List reading is not configured on this server.');
    const j = await readJson(req);
    const text = typeof j.text === 'string' ? j.text.trim().slice(0, PARSE_MAX_CHARS) : '';
    if (!text) throw new HttpError(400, 'Nothing to read.');
    // The client supplies ONLY the shopper's text. Prompt, schema, models and limits are ours.
    const up = await upstream(`${openrouterBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json', 'X-Title': 'Pro Groceries' },
      body: JSON.stringify({
        model: modelList[0],
        models: modelList,
        provider: { require_parameters: true, sort: 'price' },
        temperature: 0,
        max_tokens: 1500,
        response_format: { type: 'json_schema', json_schema: SCHEMA },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: text }],
      }),
      timeout: 25_000,
    });
    if (!up.ok) throw unavailable('List reading');
    const out = await up.json().catch(() => null);
    let items;
    try { items = JSON.parse(out?.choices?.[0]?.message?.content ?? '{}').items; } catch { items = null; }
    if (!Array.isArray(items) || !items.length) throw unavailable('List reading');
    send(res, 200, {
      items: items.slice(0, 60).map(it => ({ text: String(it?.text ?? '').slice(0, 200), product: String(it?.product ?? '').slice(0, 80) })),
    });
  }

  const ROUTES = { '/stt': stt, '/tts': tts, '/ocr': ocr, '/parse': parse };

  /** Returns a promise that always settles; errors are turned into JSON responses here. */
  return async function handle(req, res, url) {
    const sub = url.pathname.slice('/__ai'.length) || '/';
    if (sub === '/status') {
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
      return send(res, 200, { mangisoz: hasMangisoz(), parse: hasParse() });
    }
    const route = ROUTES[sub];
    if (!route || req.method !== 'POST') return send(res, 404, { error: 'Not found.' });
    let admitted = false;
    try {
      admit(req); admitted = true;
      await route(req, res);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) {
        if (e.status === 429 || e.status === 503) res.setHeader('Retry-After', '30');
        // Refused upload: answer, then drop the connection instead of reading megabytes we won't use.
        // (Answering without reading leaves the client blocked mid-upload if the socket stays open.)
        if (e.status === 413) { res.setHeader('Connection', 'close'); res.on('finish', () => req.destroy()); }
        return send(res, e.status, { error: e.message });
      }
      send(res, 500, { error: 'Server error.' });
    } finally {
      if (admitted) active -= 1;
    }
  };
}
