/** Shopping weeks run Monday–Sunday in America/New_York for the Cincinnati demo (SYSTEM.md §7). */
const TZ = 'America/New_York';

function partsIn(date: Date): { y: number; m: number; d: number; wd: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd };
}

/** "2026-11-09" = the Monday that starts the shopping week containing `date`. */
export function weekStart(date = new Date()): string {
  const { y, m, d, wd } = partsIn(date);
  const monday = new Date(Date.UTC(y, m - 1, d - wd));
  return monday.toISOString().slice(0, 10);
}

export function weekKey(basketId: string, date = new Date()): string {
  return `${basketId}:${weekStart(date)}`;
}

export function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
}
