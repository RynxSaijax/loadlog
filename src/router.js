/**
 * Hash router: #/plans/abc/items/def?x=1. Routes are matched in order;
 * ":name" segments become params. Hash routing works on static hosting and
 * offline without server rules.
 */
export function currentLocation() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, search = ''] = raw.split('?');
  const segments = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { segments, query: new URLSearchParams(search) };
}

export function matchRoute(routes, segments) {
  for (const route of routes) {
    const parts = route.path.split('/');
    if (parts.length !== segments.length) continue;
    const params = {};
    const matches = parts.every((part, index) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = segments[index];
        return true;
      }
      return part === segments[index];
    });
    if (matches) return { route, params };
  }
  return null;
}

/** Builds "#/a/b" from segments, encoding each one. */
export function href(...segments) {
  return `#/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
}

export function navigate(target) {
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function onRouteChange(callback) {
  window.addEventListener('hashchange', callback);
}
