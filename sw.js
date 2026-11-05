/*
 * LoadLog service worker: precaches the whole app so it opens offline.
 * It never fetches anything outside this origin and never sends user data.
 *
 * When releasing, bump CACHE_VERSION (must match APP_VERSION in
 * src/version.js) and keep PRECACHE in sync with the files on disk; both
 * are checked by `npm test`.
 */
const CACHE_VERSION = '1.0.0';
const CACHE_NAME = `loadlog-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/icon.svg',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/data/app-data.js',
  './src/data/backup.js',
  './src/data/catalog.pt-BR.js',
  './src/data/database.js',
  './src/data/enums.js',
  './src/data/errors.js',
  './src/data/idb.js',
  './src/data/import/csv.js',
  './src/data/import/mapping.js',
  './src/data/import/parse.js',
  './src/data/import/review.js',
  './src/data/normalize.js',
  './src/data/repository.js',
  './src/data/session-snapshots.js',
  './src/data/settings.js',
  './src/data/snapshots.js',
  './src/data/validation.js',
  './src/design/base.css',
  './src/design/tokens.css',
  './src/dev/sample-data.js',
  './src/features/catalog/catalog-model.js',
  './src/features/catalog/catalog.js',
  './src/features/catalog/exercise-form.js',
  './src/features/catalog/import-confirm.js',
  './src/features/catalog/import-file.js',
  './src/features/catalog/import-map.js',
  './src/features/catalog/import-review.js',
  './src/features/catalog/import-state.js',
  './src/features/export/csv.js',
  './src/features/export/export-actions.js',
  './src/features/export/image-card.js',
  './src/features/export/pdf-report.js',
  './src/features/history/analysis.js',
  './src/features/history/compare.js',
  './src/features/history/consistency.js',
  './src/features/history/exercise.js',
  './src/features/history/history-model.js',
  './src/features/history/history.js',
  './src/features/history/session-detail.js',
  './src/features/history/trend-badge.js',
  './src/features/history/volume.js',
  './src/features/home/home.js',
  './src/features/plans/exercise-picker.js',
  './src/features/plans/plan-detail.js',
  './src/features/plans/plan-item.js',
  './src/features/plans/plan-new.js',
  './src/features/plans/plans-model.js',
  './src/features/plans/plans.js',
  './src/features/settings/backup.js',
  './src/features/settings/export.js',
  './src/features/settings/increments.js',
  './src/features/settings/privacy.js',
  './src/features/settings/settings.js',
  './src/features/workout/inputs.js',
  './src/features/workout/keypad.js',
  './src/features/workout/session-add.js',
  './src/features/workout/session-logic.js',
  './src/features/workout/session-model.js',
  './src/features/workout/session-view.js',
  './src/features/workout/start.js',
  './src/features/workout/summary.js',
  './src/features/workout/workout.js',
  './src/i18n/i18n.js',
  './src/i18n/pt-BR.js',
  './src/metrics/index.js',
  './src/metrics/next-plan.js',
  './src/metrics/one-rep-max.js',
  './src/metrics/progress.js',
  './src/metrics/records.js',
  './src/metrics/regression.js',
  './src/metrics/set-type.js',
  './src/metrics/sets.js',
  './src/metrics/snapshots.js',
  './src/metrics/trend.js',
  './src/metrics/volume.js',
  './src/metrics/weeks.js',
  './src/router.js',
  './src/routes.js',
  './src/services/feedback.js',
  './src/services/pdf.js',
  './src/services/rest-timer.js',
  './src/services/share.js',
  './src/shared/charts.js',
  './src/shared/datetime.js',
  './src/shared/dom.js',
  './src/shared/empty-state.js',
  './src/shared/error-message.js',
  './src/shared/exercise-list.js',
  './src/shared/flash.js',
  './src/shared/format.js',
  './src/shared/gestures.js',
  './src/shared/icons.js',
  './src/shared/prescription.js',
  './src/shared/screen.js',
  './src/shared/ui.js',
  './src/tabs.js',
  './src/version.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith('loadlog-') && name !== CACHE_NAME).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
});
