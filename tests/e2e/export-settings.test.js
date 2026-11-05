// Phase 6 in a phone-sized browser: backup → erase → restore round trip
// through the real screens, exports (CSV, PDF, image), settings and the
// failure paths of restoring.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { startServer } from '../../tools/serve.js';

let server;
let browser;
let baseURL;
let scratch;

before(async () => {
  server = await startServer(0);
  baseURL = `http://localhost:${server.address().port}/`;
  browser = await chromium.launch();
  scratch = await mkdtemp(join(tmpdir(), 'loadlog-e2e-'));
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function phone() {
  const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  return { context, page, errors };
}

const inApp = (page, body) =>
  page.evaluate(async (source) => {
    const { getRepository } = await import('./src/data/app-data.js');
    const repository = await getRepository();
    return new Function('repository', `return (async () => { ${source} })()`)(repository);
  }, body);

const screenTitled = (page, title) => page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();

async function withSampleData(page) {
  await page.goto(`${baseURL}?debug#/settings`);
  await screenTitled(page, 'Ajustes');
  await page.locator('#debug-sample').tap();
  await screenTitled(page, 'Histórico');
}

/** Taps `trigger` and returns the download it starts (no share sheet in headless Chromium). */
async function download(page, trigger) {
  const [file] = await Promise.all([page.waitForEvent('download'), trigger.tap()]);
  const path = join(scratch, file.suggestedFilename());
  await file.saveAs(path);
  return { name: file.suggestedFilename(), path };
}

test('acceptance: backup → erase all data → restore → identical counts', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  await page.getByRole('link', { name: 'Ajustes' }).tap();
  await page.locator('#settings-show-rir').check();
  await page.waitForFunction(async () => (await (await import('./src/data/settings.js')).loadSettings()).showRir === true);
  const countsBefore = await inApp(page, 'const c = await repository.counts(); return c;');

  await page.goto(`${baseURL}#/settings/backup`);
  await screenTitled(page, 'Backup e restauração');
  const backup = await download(page, page.locator('#backup-export'));
  assert.match(backup.name, /^loadlog-backup-\d{4}-\d\d-\d\d\.json$/);
  const json = JSON.parse(await readFile(backup.path, 'utf8'));
  assert.equal(json.format, 'loadlog-backup');
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.data.sets.length, countsBefore.sets);

  // Erase everything (cancel once first).
  await page.goto(`${baseURL}#/settings`);
  await screenTitled(page, 'Ajustes');
  await page.locator('#settings-erase').tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap();
  assert.equal((await inApp(page, 'return await repository.counts();')).sessions, countsBefore.sessions);
  await page.locator('#settings-erase').tap();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await screenTitled(page, 'Início');
  await page.getByRole('status').getByText('Todos os dados foram apagados.').waitFor();
  const erased = await inApp(page, 'return await repository.counts();');
  assert.deepEqual([erased.sessions, erased.sets, erased.plans, erased.meta], [0, 0, 0, 0]);
  assert.equal(erased.exercises, countsBefore.exercises, 'built-in catalog is seeded again');

  // Restore: preview shows now → backup counts, then explicit confirmation.
  await page.goto(`${baseURL}#/settings/backup`);
  await screenTitled(page, 'Backup e restauração');
  await page.locator('#restore-file').setInputFiles(backup.path);
  const preview = page.locator('#restore-counts');
  await preview.waitFor();
  await preview.getByText(`agora 0 → ${countsBefore.sessions}`).waitFor();
  await preview.getByText(`agora 0 → ${countsBefore.sets.toLocaleString('pt-BR')}`).waitFor();
  assert.equal((await inApp(page, 'return await repository.counts();')).sessions, 0, 'nothing changes before confirming');
  await page.locator('#restore-confirm').tap();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await screenTitled(page, 'Início');
  await page.getByRole('status').getByText('Backup restaurado.').waitFor();
  const countsAfter = await inApp(page, 'return await repository.counts();');
  assert.deepEqual(countsAfter, countsBefore);
  assert.equal(await inApp(page, "return (await repository.getMeta('settings')).showRir;"), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('restore failures: wrong file, corrupted backup, newer version — nothing changes', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  const before = await inApp(page, 'return await repository.counts();');
  await page.goto(`${baseURL}#/settings/backup`);
  await screenTitled(page, 'Backup e restauração');
  const backup = await download(page, page.locator('#backup-export'));
  const good = JSON.parse(await readFile(backup.path, 'utf8'));

  const write = async (name, content) => {
    const path = join(scratch, name);
    await writeFile(path, content);
    return path;
  };
  const corrupted = structuredClone(good);
  corrupted.data.sets[0].load = 1000.5;
  const orphan = structuredClone(good);
  orphan.data.sets[0].sessionExerciseId = 'gone';
  const cases = [
    [await write('notes.json', 'isto não é json'), 'O arquivo não é um JSON válido.'],
    [await write('other.json', JSON.stringify({ exercises: [] })), 'Este arquivo não é um backup do LoadLog.'],
    [await write('newer.json', JSON.stringify({ ...good, schemaVersion: 2 })), 'Este backup foi feito por uma versão mais nova do LoadLog.'],
    [await write('corrupted.json', JSON.stringify(corrupted)), 'O backup tem dados inválidos. Nada foi alterado.'],
    [await write('orphan.json', JSON.stringify(orphan)), 'O backup tem séries ou exercícios sem o treino'],
    [await write('empty.json', ''), 'O arquivo está vazio.'],
  ];
  for (const [path, message] of cases) {
    await page.locator('#restore-file').setInputFiles(path);
    await page.getByRole('alert').getByText(message).waitFor();
    assert.equal(await page.locator('#restore-confirm').count(), 0, path);
  }
  // A valid file after errors shows the preview; cancelling the confirmation changes nothing.
  await page.locator('#restore-file').setInputFiles(backup.path);
  await page.locator('#restore-confirm').tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap();
  assert.deepEqual(await inApp(page, 'return await repository.counts();'), before);
  assert.deepEqual(errors, []);
  await context.close();
});

test('exports: CSV columns, period PDF, session PDF and image card', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  const sets = (await inApp(page, 'return await repository.counts();')).sets;

  await page.goto(`${baseURL}#/settings/export`);
  await screenTitled(page, 'Exportar');
  const csv = await download(page, page.locator('#export-csv'));
  assert.match(csv.name, /^loadlog-series-\d{4}-\d\d-\d\d\.csv$/);
  const lines = (await readFile(csv.path, 'utf8')).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], 'session_id,started_at,plan_name,exercise_name,set_order,type,load_kg,reps,rir,drop_group_id');
  assert.equal(lines.length - 1, sets);
  assert.ok(lines.some((line) => line.includes(',dropSet,') && /,[0-9a-z-]+$/.test(line)));
  assert.ok(lines.some((line) => line.includes(',Treino avulso,')));

  // Period PDF: invalid period first, then the default last 30 days.
  await page.locator('#export-from').fill('2026-12-31');
  await page.locator('#export-to').fill('2026-01-01');
  await page.locator('#export-pdf').tap();
  await page.getByRole('alert').getByText('Escolha datas válidas').waitFor();
  const today = await page.evaluate(() => new Date().toLocaleDateString('sv'));
  const monthAgo = await page.evaluate(() => new Date(Date.now() - 29 * 86400000).toLocaleDateString('sv'));
  await page.locator('#export-from').fill(monthAgo);
  await page.locator('#export-to').fill(today);
  const pdf = await download(page, page.locator('#export-pdf'));
  const pdfText = (await readFile(pdf.path)).toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4') && pdfText.trimEnd().endsWith('%%EOF'));
  assert.match(pdfText, /Relat\xf3rio de treinos/);
  assert.match(pdfText, /Exemplo A \x97 Peito e tr\xedceps/);

  // Session exports from the history detail.
  await page.goto(`${baseURL}#/history`);
  await screenTitled(page, 'Histórico');
  await page.locator('a.row-anchor[href^="#/history/session/"]', { hasText: /^Exemplo/ }).first().tap();
  await page.locator('#share-pdf').waitFor();
  const sessionPdf = await download(page, page.locator('#share-pdf'));
  assert.match(sessionPdf.name, /^loadlog-treino-\d{4}-\d\d-\d\d\.pdf$/);
  const image = await download(page, page.locator('#share-image'));
  const png = await readFile(image.path);
  assert.deepEqual([...png.subarray(1, 4)].map((byte) => String.fromCharCode(byte)).join(''), 'PNG');
  assert.equal(png.readUInt32BE(16), 1080);
  assert.equal(png.readUInt32BE(20), 1350);
  assert.deepEqual(errors, []);
  await context.close();
});

test('settings: increments change the ± step, ad-hoc rest default, haptics switch, privacy policy', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${baseURL}#/settings`);
  await screenTitled(page, 'Ajustes');
  await page.getByRole('switch', { name: 'Vibração' }).uncheck();
  await page.waitForFunction(async () => (await (await import('./src/data/settings.js')).loadSettings()).haptics === false);
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Diminuir Descanso do treino avulso' }).tap();
  await page.waitForFunction(async () => (await (await import('./src/data/settings.js')).loadSettings()).defaultRestSeconds === 90);

  await page.getByRole('link', { name: /^Incrementos de carga/ }).tap();
  await screenTitled(page, 'Incrementos de carga');
  await page.getByLabel('Barra', { exact: true }).selectOption('1.25');
  await page.waitForFunction(async () => (await (await import('./src/data/settings.js')).loadSettings()).increments.barbell === 1.25);

  // An ad-hoc session with a barbell exercise uses 1,25 kg steps and 1:30 rest.
  await page.getByRole('link', { name: 'Treino' }).tap();
  await page.locator('#start-ad-hoc').tap();
  await page.locator('#session-add-exercise').tap();
  await page.getByPlaceholder('Buscar exercício').fill('supino reto barra');
  await page.locator('.row-button', { has: page.locator('.row-title', { hasText: /^Supino reto com barra$/ }) }).tap();
  await page.locator('#confirm-set').waitFor();
  await page.getByRole('button', { name: 'Aumentar Carga' }).tap();
  await page.locator('[data-focus-key="load-value"]', { hasText: /^1,25 kg$/ }).waitFor();
  await page.locator('#confirm-set').tap();
  await page.locator('.rest-countdown').waitFor();
  assert.match(await page.locator('.rest-countdown').textContent(), /^1:(30|29|28)$/);

  // Reset restores rule 4.1 values.
  await page.goto(`${baseURL}#/settings/increments`);
  await page.locator('#increments-reset').tap();
  await page.getByRole('status').getByText('Incrementos padrão restaurados.').waitFor();
  assert.equal(await page.getByLabel('Barra', { exact: true }).inputValue(), '2.5');

  await page.goto(`${baseURL}#/settings`);
  await page.getByRole('link', { name: /^Política de privacidade/ }).tap();
  await screenTitled(page, 'Política de privacidade');
  assert.equal(await page.locator('.policy-heading').count(), 10);
  await page.getByText('não transfere seus dados para nenhum país', { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});
