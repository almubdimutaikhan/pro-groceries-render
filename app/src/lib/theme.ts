/**
 * Light / dark theme. The choice is a display preference, not a credential, so it is kept in
 * localStorage. "system" follows the device setting. index.html applies the same rule before
 * React loads, so there is no flash of the wrong theme.
 */
import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'pg-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage blocked: fall back to the device setting */ }
  return 'system';
}

export function resolveTheme(pref: ThemePref = getThemePref()): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

function apply(): void {
  const theme = resolveTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#100E1F' : '#F5F5FE');
  listeners.forEach(fn => fn());
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* storage blocked: the theme still applies for this visit */ }
  apply();
}

export function initTheme(): void {
  apply();
  window.matchMedia(DARK_QUERY).addEventListener('change', apply);
}

/** Current preference and resolved theme, re-rendering when either changes. */
export function useTheme(): { pref: ThemePref; theme: Theme } {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { pref: getThemePref(), theme: resolveTheme() };
}
