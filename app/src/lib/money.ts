/** All money is integer cents. These helpers only format; they never do float maths on prices. */
export function toCents(dollars: number | null | undefined): number | null {
  if (dollars == null || !Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

export function usd(cents: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (cents == null) return 'unpriced';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  if (opts.sign) return (neg ? '−' : '+') + s;
  return neg ? `−${s}` : s;
}

export function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function words(cents: number): string {
  const d = Math.floor(Math.abs(cents) / 100);
  const c = Math.abs(cents) % 100;
  return `${d} dollar${d === 1 ? '' : 's'}${c ? ` and ${c} cent${c === 1 ? '' : 's'}` : ''}`;
}
