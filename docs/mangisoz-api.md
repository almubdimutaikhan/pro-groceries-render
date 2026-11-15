# MangiSoz: STT, TTS, OCR for Pro Groceries

**Source:** [API docs](https://mangisoz.nu.edu.kz/backend/api-docs/en#description/introduction) and the OpenAPI schema at `https://mangisoz.nu.edu.kz/backend/openapi.json`.
**Verified live:** 14 Nov 2026 with the team key, using `Origin: http://localhost:5173`. Every call below returned 200 with `access-control-allow-origin: *`, so the browser can call MangiSoz directly with no backend.
**Base URL:** `https://mangisoz.nu.edu.kz/backend/api/v1`
**Key:** `ak_…`, kept in `app/.env.local` (gitignored, dev only) or pasted into the app's Settings. Never commit it.

## Auth: the one trap

| Endpoint | Header that works | Header that fails |
|---|---|---|
| STT `/stt/audio/transcriptions` | `Authorization: Bearer ak_…` | `X-API-Key` → 401 `invalid_api_key` ("X-API-Key is not supported on this endpoint") |
| TTS `/tts/audio` | `X-API-Key: ak_…` | n/a |
| OCR `/ocr/image` | `X-API-Key: ak_…` | n/a |

## Speech to text

`POST /stt/audio/transcriptions`, `multipart/form-data`, OpenAI-style.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | Audio file. The browser sends `audio/webm` from MediaRecorder; WAV verified. |
| `language` | no | `en`, or `auto`/empty to autodetect |
| `prompt` | no | Hint for names and brands. **Use it.** Without it, "Tide" came back as "tied". |
| `response_format` | no | `json` (default) · `text` · `srt` · `verbose_json` · `vtt` |
| `temperature`, `timestamp_granularities`, `stream` | no | Not used by the app |

Response: `{"text": "2 barilla spaghetti, tied detergent 64 loads, organic 2% milk, and a dozen large eggs."}`. Errors come back as `{"error": {"message", "type", "code"}}`.

```bash
curl -X POST "$BASE/stt/audio/transcriptions" -H "Authorization: Bearer $KEY" \
  -F file=@list.wav -F language=en -F response_format=json -F "prompt=Grocery list. Brands: Tide, Barilla, Kroger"
```

## Text to speech

`POST /tts/audio`. The docs say multipart and the OpenAPI schema says form-urlencoded; **both verified to work**.

| Field | Required | Notes |
|---|---|---|
| `text` | yes | 1–12,000 characters, billed per character |
| `lang` | yes | `kk` `ru` `en` `tr` `zh` `ar` `az` `es` `fr` `kr` `uz` |
| `speaker` | no | `female` or `male` (default `male`) |

Response: binary `audio/wav`. A 101-character sentence came back as 325 KB. Errors: 400 bad form, 402 no balance, 503 service down.

```bash
curl -X POST "$BASE/tts/audio" -H "X-API-Key: $KEY" \
  --data-urlencode "text=Same basket, thirteen dollars less." --data-urlencode lang=en --data-urlencode speaker=female -o out.wav
```

## OCR (receipt or written list)

`POST /ocr/image`, `multipart/form-data`.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | PNG or JPEG |
| `mode` | no | `text` (just text, `blocks: null`) or `full` (default; blocks with `bbox`, `category`, `orientation`) |

Response:
```json
{ "object": "ocr.only",
  "data": { "mode": "text", "width": 720, "height": 588,
            "text": "KROGER #417 CINCINNATI OH\n\n…\nBARILLA SPAGHETTI 160Z 2.29\nTIDE ORIG LIQ 64LD 17.99\n…",
            "blocks": null, "meta": { "blocks_count": 10 } } }
```

**Observed quirk:** `16OZ` is read as `160Z` (letter O as zero). `receiptToList()` in `app/src/lib/mangisoz.ts` fixes this and expands receipt shorthand (`LD` → loads, `ORG` → organic, `LG` → large, `LIQ` → liquid). It also drops totals, tax, card, date and store-number lines.

## Where the app uses it

| Feature | Screen | Code |
|---|---|---|
| Say your list | List | `VoiceButton` → `transcribe()` |
| "Keep my Tide" voice commands | Result | `VoiceButton` → `interpret()` |
| "Got milk and eggs" | Shopping list | `VoiceButton` → `interpret()` |
| Read aloud (numbers come from the engine) | Result, Report | `ReadAloud` → `speak()`; falls back to the browser voice |
| Snap a receipt / written list | List, Shopping list | `PhotoButton` → `ocrImage()` → `receiptToList()` |
