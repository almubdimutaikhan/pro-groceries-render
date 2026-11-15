/**
 * One shared push-to-talk control, one Read aloud control and a receipt-photo control (SYSTEM.md §3).
 * Speech and photos are helpers: without the service key the voice and photo controls are not shown
 * at all (no dead buttons, no request for a key), and every screen still works by typing.
 * Read aloud stays available through the browser's own voice.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { toast } from './ui';
import { hasMangisoz, subscribeCreds } from '../lib/credentials';
import { ocrImage, speak, stopSpeaking, transcribe } from '../lib/mangisoz';

/** True when the voice and photo service is connected in this build. Copy that mentions voice or photos should depend on it. */
export function useMangisoz(): boolean {
  const [ok, setOk] = useState(hasMangisoz());
  useEffect(() => subscribeCreds(() => setOk(hasMangisoz())), []);
  return ok;
}

type RecState = 'idle' | 'recording' | 'working';

export function VoiceButton({ onText, label = 'Say it', compact = false }: { onText: (t: string) => void; label?: string; compact?: boolean }) {
  const ready = useMangisoz();
  const [state, setState] = useState<RecState>('idle');
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { rec.current?.stream.getTracks().forEach(t => t.stop()); if (tick.current) clearInterval(tick.current); }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('This browser can’t record audio. Type instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = e => e.data.size && chunks.current.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (tick.current) clearInterval(tick.current);
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        chunks.current = []; // release the recording after processing
        if (blob.size < 2000) { setState('idle'); toast('That was too short. Hold on a bit longer.'); return; }
        setState('working');
        try {
          const text = await transcribe(blob);
          if (text) onText(text); else toast('I didn’t catch anything. Try again or type it.');
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setState('idle');
        }
      };
      rec.current = r;
      r.start();
      setSecs(0);
      tick.current = setInterval(() => setSecs(s => { if (s >= 59) { r.state === 'recording' && r.stop(); } return s + 1; }), 1000);
      setState('recording');
    } catch {
      toast('Microphone permission was blocked. You can type instead.');
    }
  }

  function stop() {
    if (rec.current?.state === 'recording') rec.current.stop();
  }

  const recording = state === 'recording';
  if (!ready) return null;
  return (
    <button
      type="button"
      className={`voice-btn ${recording ? 'is-rec' : ''} ${compact ? 'compact' : ''}`}
      onClick={recording ? stop : start}
      disabled={state === 'working'}
      aria-pressed={recording}
    >
      {state === 'working' ? <span className="spinner sm" /> : <Icon name={recording ? 'stop' : 'mic'} size={18} />}
      {!compact && <span>{recording ? `Stop · 0:${String(secs).padStart(2, '0')}` : state === 'working' ? 'Listening back…' : label}</span>}
    </button>
  );
}

export function ReadAloud({ text, label = 'Read aloud' }: { text: () => string; label?: string }) {
  const ready = useMangisoz();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  useEffect(() => () => { stopSpeaking(); window.speechSynthesis?.cancel(); }, []);
  const browserVoice = typeof window !== 'undefined' && 'speechSynthesis' in window;

  async function play() {
    if (state !== 'idle') { stopSpeaking(); window.speechSynthesis?.cancel(); setState('idle'); return; }
    const t = text();
    if (ready) {
      setState('loading');
      try {
        await speak(t, 'en', () => setState('idle'));
        setState('playing');
        return;
      } catch (e) {
        if (browserVoice) toast('Using your browser’s voice instead.'); else toast((e as Error).message);
      }
    }
    if (browserVoice) {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = 'en-US';
      u.onend = () => setState('idle');
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      setState('playing');
    } else {
      setState('idle');
      toast('Read aloud isn’t available in this browser.');
    }
  }

  if (!ready && !browserVoice) return null;
  return (
    <button type="button" className="ghost-btn" onClick={play} aria-pressed={state === 'playing'}>
      {state === 'loading' ? <span className="spinner sm" /> : <Icon name={state === 'playing' ? 'stop' : 'speaker'} size={18} />}
      {state === 'playing' ? 'Stop' : label}
    </button>
  );
}

export function PhotoButton({ onText, label = 'Snap a receipt' }: { onText: (t: string) => void; label?: string }) {
  const ready = useMangisoz();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try {
      const text = await ocrImage(f);
      if (text.trim()) onText(text); else toast('No text found in that photo. Try a sharper, flatter shot.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  if (!ready) return null;
  return (
    <>
      <button type="button" className="method" onClick={() => input.current?.click()} disabled={busy}>
        <span className="method-ic">{busy ? <span className="spinner sm" /> : <Icon name="camera" />}</span>
        <span><b>{busy ? 'Reading photo…' : label}</b><small>Paper receipt or a written list</small></span>
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e => onFile(e.target.files?.[0])} />
    </>
  );
}
