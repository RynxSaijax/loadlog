// End-to-end check in a phone-sized browser. Dev-only: needs `npm install`
// (Playwright) and a Chromium browser.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { ptBR } from '../../src/i18n/pt-BR.js';

const tabs = [
  ['home', ptBR['tab.home']],
  ['workout', ptBR['tab.workout']],
  ['plans', ptBR['tab.plans']],
  ['history', ptBR['tab.history']],
  ['settings', ptBR['tab.settings']],
];

let server;
let browser;
let baseURL;

before(async () => {
  server = await startServer(0);
  baseURL = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function newPhonePage() {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

test('opens on Início and every tab navigates', async () => {
  const { context, page, errors } = await newPhonePage();
  await page.goto(baseURL);

  const nav = page.getByRole('navigation', { name: ptBR['nav.label'] });
  assert.equal(await nav.getByRole('link').count(), 5);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), ptBR['tab.home']);

  for (const [id, label] of tabs) {
    await nav.getByRole('link', { name: label }).tap();
    await page.waitForURL(`**/#/${id}`);
    await page.getByRole('heading', { level: 1, name: label }).waitFor();
    assert.equal(await page.locator('#screen').getAttribute('data-screen'), id);
    assert.equal(await nav.getByRole('link', { name: label }).getAttribute('aria-current'), 'page');
    assert.equal(await page.title(), `${label} · LoadLog`);
  }

  assert.deepEqual(errors, []);
  await context.close();
});

test('unknown routes fall back to Início', async () => {
  const { context, page } = await newPhonePage();
  await page.goto(`${baseURL}#/nao-existe`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), ptBR['tab.home']);
  await context.close();
});

test('tab targets are at least 44×44 pt', async () => {
  const { context, page } = await newPhonePage();
  await page.goto(baseURL);
  for (const box of await page.locator('.tab').evaluateAll((links) => links.map((link) => link.getBoundingClientRect().toJSON()))) {
    assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box));
  }
  await context.close();
});

test('works offline after the first visit', async () => {
  const { context, page } = await newPhonePage();
  await page.goto(baseURL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  await context.setOffline(true);
  await page.goto(`${baseURL}#/plans`);
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), ptBR['tab.plans']);
  await context.close();
});
