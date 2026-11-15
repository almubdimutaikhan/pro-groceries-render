/**
 * MangiSoz speech + OCR (SYSTEM.md §5), called directly from the browser.
 * Verified 2026-11-14 from origin http://localhost:5173: CORS allows x-api-key and authorization,
 * and POST /tts/audio (form-urlencoded + X-API-Key) returns audio/wav.
 *  - STT  POST /api/v1/stt/audio/transcriptions  multipart file   Authorization: Bearer <key>
 *  - TTS  POST /api/v1/tts/audio                 text, lang        X-API-Key
 *  - OCR  POST /api/v1/ocr/image                 multipart file, mode=text   X-API-Key
 */
import { getCreds, AI_PROXY_BASE, mangisozViaProxy } from './credentials';

const BASE = 'https://mangisoz.nu.edu.kz/backend/api/v1';
const STT_BRANDS = 'Tide, Barilla, Kroger, Simple Truth, Private Selection, Horizon, Eggland\'s Best, Cheerios, Folgers, Heinz, Skippy, Jif, Bounty, Charmin, Chobani, Quaker, Ragu, Dawn, Gain, Fairlife, Starbucks';

/** What a shopper is told when voice or photo can't work. Details go to the console for the operator, never to the shopper. */
export const VOICE_UNAVAILABLE = "Voice isn't available right now. Type your list instead.";
export const PHOTO_UNAVAILABLE = "Photo reading isn't available right now. Type your list instead.";
const READ_ALOUD_UNAVAILABLE = "Read aloud isn't available right now.";

function key(unavailable: string): string {
  const k = getCreds().mangisozKey;
  if (!k) throw new Error(unavailable);
  return k;
}

async function fail(res: Response, what: string, unavailable: string): Promise<never> {
  let msg = '';
  try {
    const j = await res.json();
    msg = j?.detail?.message || j?.detail?.code || (typeof j?.detail === 'string' ? j.detail : '');
  } catch { /* not json */ }
  console.warn(`MangiSoz ${what} failed: HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
  throw new Error(unavailable);
}

export async function transcribe(audio: Blob, language = 'en'): Promise<string> {
  const fd = new FormData();
  const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  fd.append('file', audio, `voice.${ext}`);
  fd.append('language', language);
  fd.append('response_format', 'json');
  // Brand names in the prompt fix real mishearings (verified: "Tide" came back as "tied" without it).
  fd.append('prompt', `A US grocery shopping list with brands, sizes and quantities. Brands: ${STT_BRANDS}.`);
  const res = mangisozViaProxy()
    ? await fetch(`${AI_PROXY_BASE}/stt`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) })
    : await fetch(`${BASE}/stt/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key(VOICE_UNAVAILABLE)}` }, body: fd, signal: AbortSignal.timeout(60000),
    });
  if (!res.ok) await fail(res, 'Transcription', VOICE_UNAVAILABLE);
  const j = await res.json();
  return String(j.text ?? j.data?.text ?? '').trim();
}

let current: HTMLAudioElement | null = null;
let currentUrl = '';

export function stopSpeaking(): void {
  current?.pause();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  current = null;
  currentUrl = '';
}

export async function speak(text: string, lang = 'en', onEnd?: () => void): Promise<void> {
  stopSpeaking();
  const res = mangisozViaProxy()
    ? await fetch(`${AI_PROXY_BASE}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1500), lang, speaker: 'female' }), signal: AbortSignal.timeout(60000),
    })
    : await fetch(`${BASE}/tts/audio`, {
      method: 'POST', headers: { 'X-API-Key': key(READ_ALOUD_UNAVAILABLE) },
      body: new URLSearchParams({ text: text.slice(0, 12000), lang, speaker: 'female' }), signal: AbortSignal.timeout(60000),
    });
  if (!res.ok) await fail(res, 'Read aloud', READ_ALOUD_UNAVAILABLE);
  const blob = await res.blob();
  currentUrl = URL.createObjectURL(blob);
  current = new Audio(currentUrl);
  current.onended = () => { stopSpeaking(); onEnd?.(); };
  await current.play();
}

/**
 * Phone cameras produce 5-15 MB photos; the server accepts up to 10 MB and OCR only needs about 2200 px.
 * Shrink to a JPEG in the browser first (also faster over mobile data). Falls back to the original file
 * when the browser can't decode it (for example HEIC outside Safari).
 */
export async function shrinkImage(file: Blob, maxSide = 2200): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 3 * 1024 * 1024) { bmp.close?.(); return file; }
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close?.(); return file; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export async function ocrImage(original: Blob): Promise<string> {
  const file = await shrinkImage(original);
  const fd = new FormData();
  fd.append('file', file, 'receipt.jpg');
  fd.append('mode', 'text');
  const viaProxy = mangisozViaProxy();
  const res = viaProxy
    ? await fetch(`${AI_PROXY_BASE}/ocr`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) })
    : await fetch(`${BASE}/ocr/image`, {
      method: 'POST', headers: { 'X-API-Key': key(PHOTO_UNAVAILABLE) }, body: fd, signal: AbortSignal.timeout(60000),
    });
  if (!res.ok) await fail(res, 'Photo reading', PHOTO_UNAVAILABLE);
  const j = await res.json();
  if (viaProxy) return String(j.text ?? '');
  const d = j.data ?? {};
  if (typeof d.text === 'string') return d.text;
  if (Array.isArray(d.blocks)) return d.blocks.map((b: { text?: string }) => b.text ?? '').join('\n');
  return '';
}

/** Receipt shorthand → words our parser understands. Verified against MangiSoz OCR output, which reads "16OZ" as "160Z". */
const RECEIPT_ABBR: Array<[RegExp, string]> = [
  [/\b(\d+(?:\.\d+)?)[0O]Z\b/gi, '$1 oz'],            // OCR: 160Z → 16 oz
  [/\b(\d+(?:\.\d+)?)\s?OZ\b/gi, '$1 oz'],
  [/\b(\d+)\s?LDS?\b/gi, '$1 loads'],
  [/\b(\d+)\s?CT\b/gi, '$1 ct'],
  [/\b(\d+(?:\.\d+)?)\s?LB\b/gi, '$1 lb'],
  [/\bGAL\b/gi, '1 gal'],
  [/\bORG\b/gi, 'organic'],
  [/\bLG\b/gi, 'large'],
  [/\bLIQ\b/gi, 'liquid'],
  [/\bORIG\b/gi, 'original'],
  [/\bEGGLANDS\b/gi, "Eggland's"],
  [/\bPB\b/gi, 'peanut butter'],
  [/\bWHL\b/gi, 'whole'],
  [/\bDET\b/gi, 'detergent'],
];

/** Turn raw receipt OCR text into list lines: drop totals, tax, card and store lines; strip prices. */
export function receiptToList(ocr: string): string {
  return ocr
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l && !/(sub\s?total|total|tax|visa|mastercard|debit|credit|change|cash|balance|savings|you saved|thank|kroger plus|fuel points|store|www\.|tel|phone|#\s?\d|\*{3,}|\d{1,2}\/\d{1,2}\/\d{2,4}|^[\d\s$.,:-]+$)/i.test(l))
    .map(l => l.replace(/\$?\d+\.\d{2}\s*[A-Z]?\s*$/i, '').replace(/^\d{6,}\s*/, '').trim())
    .map(l => RECEIPT_ABBR.reduce((s, [re, to]) => s.replace(re, to), l).replace(/\s{2,}/g, ' ').trim())
    .filter(l => l.length > 2)
    .join('\n');
}
