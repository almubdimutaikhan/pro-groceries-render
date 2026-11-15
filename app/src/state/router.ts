import { useSyncExternalStore } from 'react';

export type Route = 'welcome' | 'list' | 'store' | 'confirm' | 'result' | 'compare' | 'shop' | 'home' | 'report' | 'settings' | 'plan';
const ROUTES: Route[] = ['welcome', 'list', 'store', 'confirm', 'result', 'compare', 'shop', 'home', 'report', 'settings', 'plan'];

/** `#plan?checkout=success` → path "plan", query "checkout=success". */
function hashParts(): { path: string; query: string } {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { path, query };
}

function read(): Route {
  const { path } = hashParts();
  return (ROUTES as string[]).includes(path) ? (path as Route) : 'welcome';
}

/** Query parameters that follow the route in the address, e.g. Stripe's `#plan?checkout=success`. */
export function hashParams(): URLSearchParams {
  return new URLSearchParams(hashParts().query);
}

export function go(r: Route, replace = false): void {
  const url = `#${r}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.scrollTo({ top: 0 });
}

export function back(fallback: Route): void {
  if (history.length > 1) history.back();
  else go(fallback, true);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    fn => { window.addEventListener('hashchange', fn); window.addEventListener('popstate', fn); return () => { window.removeEventListener('hashchange', fn); window.removeEventListener('popstate', fn); }; },
    read,
  );
}
