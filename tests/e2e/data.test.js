// Real-browser checks of the storage layer (IndexedDB in Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { builtinCatalog } from '../../src/data/catalog.pt-BR.js';
import { ptBR } from '../../src/i18n/pt-BR.js';

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

async function phone() {
  const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  return { context, page, errors };
}

// Test-only: runs code against the app's repository inside the page. Needs
// bypassCSP because the app's CSP forbids evaluating strings (as it should).
const inApp = (page, body) =>
  page.evaluate(async (source) => {
    const { getRepository } = await import('./src/data/app-data.js');
    const repository = await getRepository();
    return new Function('repository', `return (async () => { ${source} })()`)(repository);
  }, body);

test('first launch seeds the catalog and Ajustes shows the count', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${baseURL}#/settings`);
  await page.locator('#settings-exercises', { hasText: String(builtinCatalog.length) }).waitFor();
  assert.notEqual(await page.locator('#settings-persistent').textContent(), ptBR['settings.data.loading']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('an open session with sets survives reloading the app, and reloads never duplicate the seed', async () => {
  const { context, page, errors } = await phone();
  await page.goto(baseURL);
  const sessionId = await inApp(page, `
    const [bench] = (await repository.listExercises()).filter((e) => e.builtinKey === 'supino-reto-barra');
    const plan = await repository.createPlan({ name: 'A — Upper' });
    await repository.addExerciseToPlan(plan.id, { exerciseId: bench.id, prescribedSets: 4, repMin: 6, repMax: 8, restSeconds: 150 });
    const session = await repository.startSession({ planId: plan.id });
    const detail = await repository.getSessionDetail(session.id);
    await repository.addSet(detail.exercises[0].id, { load: 80, reps: 8 });
    await repository.addSet(detail.exercises[0].id, { load: 80, reps: 7 });
    return session.id;
  `);

  for (let i = 0; i < 3; i += 1) await page.reload();

  const restored = await inApp(page, `
    const open = await repository.getOpenSession();
    const detail = await repository.getSessionDetail(open.id);
    return { id: open.id, plan: detail.planNameSnapshot, sets: detail.exercises[0].sets.map((s) => [s.load, s.reps]), counts: await repository.counts() };
  `);
  assert.equal(restored.id, sessionId);
  assert.equal(restored.plan, 'A — Upper');
  assert.deepEqual(restored.sets, [[80, 8], [80, 7]]);
  assert.equal(restored.counts.exercises, builtinCatalog.length);
  assert.deepEqual(errors, []);
  await context.close();
});

test('two tabs opening at once still seed only once', async () => {
  const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true });
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
  await Promise.all(pages.map((page) => page.goto(baseURL)));
  const count = await inApp(pages[0], 'return (await repository.counts()).exercises;');
  assert.equal(count, builtinCatalog.length);
  await context.close();
});

test('the app keeps working offline with data intact', async () => {
  const { context, page } = await phone();
  await page.goto(baseURL);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await inApp(page, `await repository.createPlan({ name: 'Offline' });`);
  await context.setOffline(true);
  await page.reload();
  const names = await inApp(page, 'return (await repository.listPlans()).map((p) => p.name);');
  assert.deepEqual(names, ['Offline']);
  await context.close();
});
