import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../../src/version.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
  );
  return files.flat();
}

async function readServiceWorker() {
  const source = await readFile(join(root, 'sw.js'), 'utf8');
  const version = source.match(/const CACHE_VERSION = '([^']+)'/)[1];
  const list = source.match(/const PRECACHE = \[([\s\S]*?)\];/)[1];
  const precache = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return { version, precache };
}

test('service worker cache version matches the app and package versions', async () => {
  const { version } = await readServiceWorker();
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(version, APP_VERSION);
  assert.equal(pkg.version, APP_VERSION);
});

test('service worker precaches exactly the files the app ships', async () => {
  const { precache } = await readServiceWorker();
  const shipped = [
    ...(await listFiles(join(root, 'src'))),
    ...(await listFiles(join(root, 'assets'))),
    join(root, 'index.html'),
    join(root, 'manifest.webmanifest'),
  ].map((file) => `./${relative(root, file).split('\\').join('/')}`);
  const expected = ['./', ...shipped].sort();
  assert.deepEqual([...precache].sort(), expected);
});

test('app code makes no network requests', async () => {
  const forbidden = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|https?:\/\//;
  const offenders = [];
  for (const file of await listFiles(join(root, 'src'))) {
    if (!file.endsWith('.js')) continue;
    if (forbidden.test(await readFile(file, 'utf8'))) offenders.push(relative(root, file));
  }
  assert.deepEqual(offenders, []);
});
