/**
 * Operator mode: the keys and rehearsal tools that a shopper must never be asked for.
 *
 * On when the address has `?operator=1`, or in `npm run dev`. `?operator=0` turns it off even in dev,
 * so the shopper's view can be checked on a developer machine. The check reads the address each time;
 * hash navigation (`#settings`) keeps the query string.
 */
export function isOperator(): boolean {
  if (typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search).get('operator');
  if (q === '1') return true;
  if (q === '0') return false;
  return import.meta.env.DEV;
}
