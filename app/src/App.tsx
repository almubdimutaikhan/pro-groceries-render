import { useEffect, useRef } from 'react';
import { useRoute, go } from './state/router';
import { boot, getState, useApp } from './state/store';
import { rememberStores } from './lib/matching';
import { Toasts, Spinner, AppHeader, useDesktop } from './components/ui';
import { Welcome } from './screens/Welcome';
import { ListInput } from './screens/ListInput';
import { StorePick } from './screens/StorePick';
import { Confirm } from './screens/Confirm';
import { Result } from './screens/Result';
import { Compare } from './screens/Compare';
import { Shop } from './screens/Shop';
import { Home } from './screens/Home';
import { Report } from './screens/Report';
import { Settings } from './screens/Settings';
import { Plan } from './screens/Plan';

export function App() {
  const route = useRoute();
  const booted = useApp(s => s.booted);
  const hasBasket = useApp(s => !!s.comparison);
  const desktop = useDesktop();

  useEffect(() => { boot().then(() => rememberStores(getState().stores)); }, []);
  // Returning shoppers land on their saved basket; the landing page stays one click away.
  useEffect(() => { if (booted && hasBasket && route === 'welcome' && !location.hash) go('home', true); }, [booted]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a screen change, move focus to the new screen's heading so keyboard and screen-reader users
  // start at the top of what just opened. The first render is skipped: the page already starts there.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const id = requestAnimationFrame(() => {
      const h = document.querySelector<HTMLElement>('.route h1');
      if (!h) return;
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [route]);

  if (!booted) return <div className="boot"><Spinner label="Opening your basket" /></div>;

  const screen = {
    welcome: <Welcome />,
    list: <ListInput />,
    store: <StorePick />,
    confirm: <Confirm />,
    result: <Result />,
    compare: <Compare />,
    shop: <Shop />,
    home: hasBasket ? <Home /> : <Welcome />,
    report: <Report />,
    settings: <Settings />,
    plan: <Plan />,
  }[route];

  const isLanding = route === 'welcome' || (route === 'home' && !hasBasket);
  return (
    <div className={`app ${isLanding ? 'is-landing' : ''} ${desktop ? 'is-desk' : ''}`}>
      {desktop && <AppHeader />}
      <div className="route" key={route}>{screen}</div>
      <Toasts />
    </div>
  );
}
