// Phase 4: the active session in a phone-sized browser. Acceptance flow,
// screen-reader labels, restoration after a reload and failure paths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startServer } from '../../tools/serve.js';

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
  // bypassCSP only so the test can seed data with inApp(); the app never evaluates strings.
  const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true });
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
const toastText = (page, text) => page.locator('#toast').getByText(text).waitFor();

/**
 * Plan "A — Peito" with bench press (4 × 6–8, 90 s rest) and row (3 × 8–12),
 * plus one ended session a week ago: bench 80 × 8, 80 × 7, row 60 × 10.
 */
async function seed(page, { history = true } = {}) {
  await page.goto(baseURL);
  await page.getByRole('heading', { level: 1, name: 'Início', exact: true }).waitFor();
  return inApp(
    page,
    `
    const exercises = await repository.listExercises();
    const bench = exercises.find((e) => e.name === 'Supino reto com barra');
    const row = exercises.find((e) => e.name === 'Remada curvada com barra');
    const plan = await repository.createPlan({ name: 'A — Peito' });
    await repository.addExerciseToPlan(plan.id, { exerciseId: bench.id, prescribedSets: 4, repMin: 6, repMax: 8, restSeconds: 90 });
    await repository.addExerciseToPlan(plan.id, { exerciseId: row.id, prescribedSets: 3, repMin: 8, repMax: 12, restSeconds: 120 });
    if (${history}) {
      const weekAgo = Date.now() - 7 * 86400000;
      const session = await repository.startSession({ planId: plan.id, startedAt: weekAgo });
      const detail = await repository.getSessionDetail(session.id);
      const [b, r] = detail.exercises;
      await repository.addSet(b.id, { load: 80, reps: 8, completedAt: weekAgo + 60000 });
      await repository.addSet(b.id, { load: 80, reps: 7, completedAt: weekAgo + 240000 });
      await repository.addSet(r.id, { load: 60, reps: 10, completedAt: weekAgo + 600000 });
      await repository.endSession(session.id, weekAgo + 3600000);
    }
    return { planId: plan.id, benchId: bench.id };
  `,
  );
}

const setRows = (page) => page.locator('.set-list .set-row-text');

async function startPlan(page, name = 'A — Peito') {
  await page.getByRole('link', { name: 'Treino' }).tap();
  await screenTitled(page, 'Treino');
  await page.getByRole('button', { name: `Iniciar ${name}` }).tap();
  await screenTitled(page, name);
}

test('acceptance: start plan → prefilled set in 1 tap → adjust load and confirm in 2 taps → end → correct summary', async () => {
  const { context, page, errors } = await phone();
  await seed(page);
  await startPlan(page);

  // Prefill comes from last session's best set (80 × 8); confirming takes one tap.
  await page.getByText('Última vez: 80 kg × 8 em').waitFor();
  const confirm = page.locator('#confirm-set');
  assert.equal(await confirm.getAttribute('aria-label'), 'Confirmar série: 80 kg, 8 repetições');
  await confirm.tap();
  await page.locator('.set-list .set-row').first().waitFor();
  assert.equal(await setRows(page).first().getAttribute('aria-label'), 'Série 1: 80 kg, 8 repetições');

  // Rest timer starts with the plan's 90 s.
  const countdown = page.locator('.rest-countdown');
  await countdown.waitFor();
  assert.match(await countdown.textContent(), /^1:(30|29|28)$/);

  // + then confirm: two taps, 82.5 kg (barbell increment 2.5).
  await page.getByRole('button', { name: 'Aumentar Carga' }).tap();
  await confirm.tap();
  await setRows(page).nth(1).waitFor();
  assert.equal(await setRows(page).nth(1).getAttribute('aria-label'), 'Série 2: 82,5 kg, 8 repetições');
  await toastText(page, 'Novo recorde: Maior carga e 1RM estimado!');

  // Tab chip shows progress and is announced.
  const benchTab = page.getByRole('tab', { name: 'Supino reto com barra, 2/4 séries' });
  assert.equal(await benchTab.getAttribute('aria-selected'), 'true');

  // Next exercise through the tab, prefilled from last time (60 × 10).
  await page.getByRole('tab', { name: /^Remada curvada com barra/ }).tap();
  await page.getByRole('heading', { level: 2, name: 'Remada curvada com barra' }).waitFor();
  assert.equal(await confirm.getAttribute('aria-label'), 'Confirmar série: 60 kg, 10 repetições');
  await page.getByRole('button', { name: 'Diminuir Reps' }).tap();
  await confirm.tap();
  await setRows(page).first().waitFor();
  assert.equal(await setRows(page).first().getAttribute('aria-label'), 'Série 1: 60 kg, 9 repetições');

  await page.locator('#session-finish').tap();
  await page.getByRole('dialog').getByText('3 séries registradas.', { exact: false }).waitFor();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await screenTitled(page, 'Resumo do treino');

  const totals = await page.locator('#summary-totals .row').allTextContents();
  // 80×8 + 82,5×8 + 60×9 = 640 + 660 + 540 = 1840
  assert.deepEqual(totals.map((text) => text.trim()), ['Duração0:00', 'Tonelagem1.840 kg', 'Séries efetivas3']);
  const groups = await page.locator('#summary-groups .row').allTextContents();
  assert.ok(groups.some((text) => text.startsWith('Peito') && text.endsWith('2 séries')), groups.join(' | '));
  assert.ok(groups.some((text) => text.startsWith('Costas') && text.endsWith('1 série')), groups.join(' | '));
  const records = await page.locator('#summary-records .row').allTextContents();
  assert.equal(records.length, 1, records.join(' | '));
  assert.match(records[0], /^Supino reto com barraMaior carga e 1RM estimado · 82,5 kg × 8$/);

  // The rest timer stopped with the session; Concluir goes home.
  assert.equal(await page.locator('.rest-bar').count(), 0);
  await page.locator('#summary-done').tap();
  await screenTitled(page, 'Início');
  const open = await inApp(page, 'return await repository.getOpenSession();');
  assert.equal(open, null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('restoration: open session and rest timer survive a reload; Início reopens Treino', async () => {
  const { context, page, errors } = await phone();
  await seed(page);
  await startPlan(page);
  await page.locator('#confirm-set').tap();
  await page.locator('.rest-countdown').waitFor();

  // Edit the draft (not stored) and switch exercise, then reload from Início.
  await page.goto(`${baseURL}#/home`);
  await page.reload();
  await screenTitled(page, 'A — Peito');
  assert.equal(await setRows(page).count(), 1);
  await page.locator('.rest-countdown').waitFor();
  const seconds = await page.locator('.rest-countdown').textContent();
  assert.match(seconds, /^1:(30|[0-2]\d)$/);

  // Skip stops the timer and the stored timer is gone.
  await page.locator('#rest-skip').tap();
  await page.locator('.rest-bar').waitFor({ state: 'detached' });
  assert.equal(await inApp(page, "return (await repository.getMeta('restTimer')) ?? null;"), null);

  // +15 s adds to a running timer.
  await page.locator('#confirm-set').tap();
  await page.locator('.rest-countdown').waitFor();
  await page.locator('#rest-extend').tap();
  const stored = await inApp(page, "return await repository.getMeta('restTimer');");
  assert.equal(stored.total, 105);
  assert.deepEqual(errors, []);
  await context.close();
});

test('rest timer that ended while closed ends silently; one that ends with the app open shows a message', async () => {
  const { context, page, errors } = await phone();
  await seed(page);
  await startPlan(page);
  await inApp(page, "await repository.setMeta('restTimer', { endsAt: Date.now() - 5 * 60000, total: 90, label: 'x' });");
  await page.reload();
  await screenTitled(page, 'A — Peito');
  assert.equal(await page.locator('.rest-bar').count(), 0);
  assert.equal(await inApp(page, "return (await repository.getMeta('restTimer')) ?? null;"), null);

  await inApp(page, "await repository.setMeta('restTimer', { endsAt: Date.now() + 1500, total: 2, label: 'Supino' });");
  await page.reload();
  await page.locator('.rest-bar').waitFor();
  await toastText(page, 'Descanso encerrado. Hora da próxima série!');
  await page.locator('.rest-bar').waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('keypad: typed values are used; invalid values show an error and save nothing', async () => {
  const { context, page, errors } = await phone();
  await seed(page, { history: false });
  await startPlan(page);
  // No history: 0 kg × bottom of the range.
  assert.equal(await page.locator('#confirm-set').getAttribute('aria-label'), 'Confirmar série: 0 kg, 6 repetições');

  const loadValue = page.locator('[data-focus-key="load-value"]');
  await loadValue.tap();
  for (const key of ['1', '0', '0', '0', ',', '5']) await page.locator(`.keypad [data-key="${key}"]`).tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.getByRole('alert').getByText('A carga deve ficar entre 0 e 1000 kg, em múltiplos de 0,25.').waitFor();

  // 2,3 is not a multiple of 0.25.
  await page.locator('.keypad-actions').getByRole('button', { name: 'Cancelar' }).tap();
  await loadValue.tap();
  for (const key of ['2', ',', '3']) await page.locator(`.keypad [data-key="${key}"]`).tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.getByRole('alert').getByText('A carga deve ficar entre 0 e 1000 kg').waitFor();
  // Backspace fixes it: 2,25 is fine.
  await page.locator('.keypad [data-key="back"]').tap();
  for (const key of ['2', '5']) await page.locator(`.keypad [data-key="${key}"]`).tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.locator('[data-focus-key="load-value"]', { hasText: /^2,25 kg$/ }).waitFor();

  // Reps 0 and 101 are rejected; 12 is accepted.
  const repsValue = page.locator('[data-focus-key="reps-value"]');
  await repsValue.tap();
  assert.equal(await page.locator('.keypad [data-key=","]').count(), 0);
  await page.locator('.keypad [data-key="0"]').tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.getByRole('alert').getByText('As reps devem ser um número inteiro de 1 a 100.').waitFor();
  await page.locator('.keypad-actions').getByRole('button', { name: 'Cancelar' }).tap();
  await repsValue.tap();
  for (const key of ['1', '0', '1']) await page.locator(`.keypad [data-key="${key}"]`).tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.getByRole('alert').getByText('As reps devem ser').waitFor();
  await page.locator('.keypad-actions').getByRole('button', { name: 'Cancelar' }).tap();
  await repsValue.tap();
  for (const key of ['1', '2']) await page.locator(`.keypad [data-key="${key}"]`).tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.locator('[data-focus-key="reps-value"]', { hasText: /^12$/ }).waitFor();

  // Nothing was stored by the failed attempts.
  assert.equal(await inApp(page, 'const s = await repository.getOpenSession(); return (await repository.getSessionDetail(s.id)).exercises.flatMap((e) => e.sets).length;'), 0);
  await page.locator('#confirm-set').tap();
  await setRows(page).first().waitFor();
  assert.equal(await setRows(page).first().getAttribute('aria-label'), 'Série 1: 2,25 kg, 12 repetições');

  // Minus is disabled at 0 kg.
  await loadValue.tap();
  await page.locator('.keypad [data-key="0"]').tap();
  await page.locator('[data-keypad-ok]').tap();
  await page.locator('[data-focus-key="load-value"]', { hasText: /^0 kg$/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Diminuir Carga' }).isDisabled(), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('set menu: change type, delete; extra-set warning; drop-set; warmups do not count', async () => {
  const { context, page, errors } = await phone();
  await seed(page);
  await startPlan(page);
  const confirm = page.locator('#confirm-set');

  // First set as warmup through the menu: it no longer counts toward 4.
  await confirm.tap();
  await setRows(page).first().waitFor();
  await page.getByRole('button', { name: 'Opções da série 1' }).tap();
  await page.getByRole('dialog').getByLabel('Aquecimento').check();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await page.getByRole('tab', { name: 'Supino reto com barra, 0/4 séries' }).waitFor();
  assert.equal(await setRows(page).first().getAttribute('aria-label'), 'Série 1: 80 kg, 8 repetições, Aquecimento');

  for (let i = 0; i < 4; i += 1) {
    await confirm.tap();
    await setRows(page).nth(i + 1).waitFor();
  }
  await page.getByRole('tab', { name: 'Supino reto com barra, 4/4 séries' }).waitFor();
  await page.locator('#extra-set-notice').getByText('A ficha prescreve 4 séries. Esta será a 5ª.').waitFor();

  // Long-press opens the same menu. Delete the last set: warning goes away.
  await page.locator('.set-row').nth(4).dispatchEvent('pointerdown', { clientX: 10, clientY: 10 });
  await page.getByRole('dialog').waitFor();
  await page.locator('#set-menu-delete').tap();
  await toastText(page, 'Série 5 excluída.');
  assert.equal(await setRows(page).count(), 4);
  await page.getByRole('tab', { name: 'Supino reto com barra, 3/4 séries' }).waitFor();
  assert.equal(await page.locator('#extra-set-notice').count(), 0);

  // Drop-set from the last set: next set is a lighter drop step of the same set.
  await page.getByRole('button', { name: 'Opções da série 4' }).tap();
  await page.locator('#set-menu-drop').tap();
  await page.getByText('Drop-set em andamento', { exact: false }).waitFor();
  assert.equal(await confirm.getAttribute('aria-label'), 'Confirmar série: 77,5 kg, 8 repetições');
  await confirm.tap();
  await setRows(page).nth(4).waitFor();
  assert.equal(await setRows(page).nth(4).getAttribute('aria-label'), 'Série 5: 77,5 kg, 8 repetições, Drop-set');
  // A drop-set counts as one set, however many steps it has.
  await page.getByRole('tab', { name: 'Supino reto com barra, 3/4 séries' }).waitFor();
  await page.locator('#end-drop-set').tap();
  await page.locator('#end-drop-set').waitFor({ state: 'detached' });
  await confirm.tap();
  await page.getByRole('tab', { name: 'Supino reto com barra, 4/4 séries' }).waitFor();
  await page.locator('#extra-set-notice').waitFor();

  const types = await inApp(page, 'const s = await repository.getOpenSession(); return (await repository.getSessionDetail(s.id)).exercises[0].sets.map((set) => [set.type, Boolean(set.dropGroupId)]);');
  assert.deepEqual(types, [['warmup', false], ['normal', false], ['normal', false], ['dropSet', true], ['dropSet', true], ['normal', false]]);
  assert.deepEqual(errors, []);
  await context.close();
});

test('ad-hoc session: add exercise, discard when empty, retroactive start', async () => {
  const { context, page, errors } = await phone();
  await seed(page, { history: false });
  await page.getByRole('link', { name: 'Treino' }).tap();
  await screenTitled(page, 'Treino');

  // Future start is rejected.
  await page.getByText('Começou em outro horário?').tap();
  await page.getByLabel('Início').fill('2099-01-01T10:00');
  await page.locator('#start-ad-hoc').tap();
  await page.getByRole('alert').getByText('Informe uma data e hora válidas').waitFor();
  assert.equal(await inApp(page, 'return await repository.getOpenSession();'), null);

  // Retroactive start yesterday at 18:00.
  const yesterday = await page.evaluate(() => {
    const date = new Date(Date.now() - 86400000);
    date.setHours(18, 0, 0, 0);
    const pad = (value) => String(value).padStart(2, '0');
    return { value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T18:00`, time: date.getTime() };
  });
  await page.getByLabel('Início').fill(yesterday.value);
  await page.locator('#start-ad-hoc').tap();
  await screenTitled(page, 'Treino avulso');
  await page.getByText('Nenhum exercício ainda').waitFor();

  // Discard is offered while there are no sets.
  await page.getByRole('button', { name: 'Descartar treino' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap();

  await page.locator('#session-add-exercise').tap();
  await screenTitled(page, 'Adicionar exercício');
  await page.getByPlaceholder('Buscar exercício').fill('rosca direta');
  await page.locator('.row-button', { has: page.locator('.row-title', { hasText: /^Rosca direta com barra$/ }) }).tap();
  await screenTitled(page, 'Treino avulso');
  assert.equal(await page.locator('#confirm-set').getAttribute('aria-label'), 'Confirmar série: 0 kg, 8 repetições');
  await page.locator('#confirm-set').tap();
  await setRows(page).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Descartar treino' }).count(), 0);

  // Ending a retroactive session keeps a realistic duration (not ~a day).
  await page.locator('#session-finish').tap();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await screenTitled(page, 'Resumo do treino');
  const session = await inApp(page, 'return (await repository.listSessions()).at(-1);');
  assert.equal(session.startedAt, yesterday.time);
  assert.ok(session.endedAt - session.startedAt < 60_000, `duration ${session.endedAt - session.startedAt}`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('empty ad-hoc session can be discarded; ending with no sets discards too', async () => {
  const { context, page, errors } = await phone();
  await seed(page, { history: false });
  await page.getByRole('link', { name: 'Treino' }).tap();
  await page.locator('#start-ad-hoc').tap();
  await screenTitled(page, 'Treino avulso');
  await page.locator('#session-finish').tap();
  await page.getByRole('dialog').getByText('Descartar este treino?').waitFor();
  await page.getByRole('dialog').locator('[data-confirm]').tap();
  await screenTitled(page, 'Treino');
  await toastText(page, 'Treino descartado.');
  assert.equal(await inApp(page, 'return (await repository.listSessions()).length;'), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('RIR toggle in Ajustes adds an RIR control and stores it; swipe right confirms', async () => {
  const { context, page, errors } = await phone();
  await seed(page, { history: false });
  await page.getByRole('link', { name: 'Ajustes' }).tap();
  await page.getByRole('switch', { name: 'Mostrar RIR' }).check();
  await page.waitForFunction(async () => {
    const { loadSettings } = await import('./src/data/settings.js');
    return (await loadSettings()).showRir === true;
  });
  await startPlan(page);
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Aumentar RIR' }).tap();
  await page.locator('#confirm-set').tap();
  await setRows(page).first().waitFor();
  assert.equal(await setRows(page).first().getAttribute('aria-label'), 'Série 1: 0 kg, 6 repetições, RIR 2');

  // Swipe right on the editor confirms another set.
  const box = await page.locator('.set-editor').boundingBox();
  const y = box.y + box.height - 10;
  await page.locator('.set-editor').dispatchEvent('pointerdown', { clientX: box.x + 20, clientY: y });
  await page.locator('.set-editor').dispatchEvent('pointerup', { clientX: box.x + 200, clientY: y });
  await setRows(page).nth(1).waitFor();

  // Swipe left on the panel goes to the next exercise.
  await page.locator('.session-panel').dispatchEvent('pointerdown', { clientX: 300, clientY: 200 });
  await page.locator('.session-panel').dispatchEvent('pointerup', { clientX: 100, clientY: 200 });
  await page.getByRole('heading', { level: 2, name: 'Remada curvada com barra' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});
