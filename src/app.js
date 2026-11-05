import { h } from './shared/dom.js';
import { icon } from './shared/icons.js';
import { errorState } from './shared/ui.js';
import { t, locale } from './i18n/i18n.js';
import { tabs, defaultTabId } from './tabs.js';
import { routes } from './routes.js';
import { currentLocation, matchRoute, onRouteChange, href, navigate } from './router.js';
import { getRepository, requestPersistentStorage } from './data/app-data.js';
import { DomainError } from './data/errors.js';
import { loadSettings } from './data/settings.js';
import { initRestTimer } from './services/rest-timer.js';
import { setHapticsEnabled } from './services/feedback.js';

const screenElement = document.getElementById('screen');
const tabbarElement = document.getElementById('tabbar');
let renderToken = 0;

function buildTabbar() {
  tabbarElement.setAttribute('aria-label', t('nav.label'));
  for (const tab of tabs) {
    tabbarElement.append(
      h(
        'a',
        { class: 'tab', href: href(tab.id), 'data-tab': tab.id },
        icon(tab.icon, 'tab-icon'),
        h('span', { class: 'tab-label' }, t(tab.titleKey)),
      ),
    );
  }
}

function resolve() {
  const { segments, query } = currentLocation();
  const match = matchRoute(routes, segments);
  if (match) return { ...match, query };
  return { ...matchRoute(routes, [defaultTabId]), query };
}

async function render({ moveFocus }) {
  const token = ++renderToken;
  const { route, params, query } = resolve();
  const tab = tabs.find((candidate) => candidate.id === route.tab);

  for (const link of tabbarElement.querySelectorAll('.tab')) {
    if (link.dataset.tab === route.tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  screenElement.setAttribute('aria-busy', 'true');
  let content;
  try {
    content = await route.render({ params, query, tabTitle: t(tab.titleKey) });
  } catch (error) {
    if (!(error instanceof DomainError)) console.error(error);
    content = errorState(error);
  }
  if (token !== renderToken) return;

  screenElement.replaceChildren(content);
  screenElement.dataset.screen = route.path;
  screenElement.removeAttribute('aria-busy');
  const heading = screenElement.querySelector('h1');
  document.title = t('app.documentTitle', { screen: heading?.textContent || t(tab.titleKey) });
  window.scrollTo(0, 0);
  if (moveFocus) screenElement.focus({ preventScroll: true });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const { protocol, hostname } = window.location;
  if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}

document.documentElement.lang = locale;
buildTabbar();
render({ moveFocus: false });
onRouteChange(() => render({ moveFocus: true }));
registerServiceWorker();
requestPersistentStorage();

/**
 * Restoration: the rest timer comes back from storage, and an open session
 * reopens the Treino tab when the app starts on Início.
 */
async function restore() {
  const repository = await getRepository();
  const [open, settings] = await Promise.all([repository.getOpenSession(), loadSettings()]);
  setHapticsEnabled(settings.haptics);
  await initRestTimer();
  const { segments } = currentLocation();
  if (open && (segments.length === 0 || (segments.length === 1 && segments[0] === 'home'))) navigate(href('workout'));
}

restore().catch((error) => {
  if (!(error instanceof DomainError)) console.error('LoadLog storage is unavailable', error);
});
