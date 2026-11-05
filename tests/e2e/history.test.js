// Phase 5 in a phone-sized browser: sample data (debug) shows every chart,
// history editing with failure paths, filters and Início.
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

async function withSampleData(page) {
  await page.goto(`${baseURL}?debug#/settings`);
  await screenTitled(page, 'Ajustes');
  await page.locator('#debug-sample').tap();
  await screenTitled(page, 'Histórico');
  await page.getByRole('status').getByText('Dados de exemplo criados').waitFor();
}

test('Ajustes hides the sample generator without ?debug', async () => {
  const { context, page, errors } = await phone();
  await page.goto(`${baseURL}#/settings`);
  await screenTitled(page, 'Ajustes');
  assert.equal(await page.locator('#debug-sample').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('acceptance: sample data shows every chart correctly', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  const sessions = await inApp(page, 'return (await repository.listSessions()).length;');

  // History: weeks, rows link to details, analysis shortcuts.
  const weekHeaders = page.locator('.group-header', { hasText: /^Semana de/ });
  assert.equal(await weekHeaders.count(), 9);
  assert.equal(await page.locator('a.row-anchor[href^="#/history/session/"]').count(), sessions);

  // Exercise screen: line chart with two series, one point per session, plus data table.
  await page.goto(`${baseURL}?debug#/history/exercises`);
  await screenTitled(page, 'Exercícios');
  await page.getByRole('link', { name: /^Supino reto com barra/ }).tap();
  await screenTitled(page, 'Supino reto com barra');
  const chart = page.getByRole('img', { name: /^Gráfico de linha de \d+ sessões/ });
  await chart.waitFor();
  const points = await page.locator('.chart-series.series-1 .chart-point').count();
  assert.ok(points >= 8, `points ${points}`);
  assert.equal(await page.locator('.chart-series.series-2 .chart-point').count(), points);
  assert.equal(await page.locator('.chart-line').count(), 2);
  const d = await page.locator('.series-1 .chart-line').getAttribute('d');
  assert.ok(!/NaN|Infinity/.test(d), d);
  await page.getByText('Ver dados').tap();
  assert.equal(await page.locator('.chart-data tbody tr').count(), points);
  assert.equal(await page.locator('#exercise-executions .row').count(), points);

  // Stagnation alert on the knee extension.
  await page.goto(`${baseURL}?debug#/history/exercises`);
  await screenTitled(page, 'Exercícios');
  await page.getByRole('link', { name: /^Cadeira extensora/ }).tap();
  await page.getByRole('status').getByText(/^Estagnado em Exemplo C/).waitFor();

  // Volume: grouped bars (3 per group) and a trend or "dados insuficientes" per group.
  await page.goto(`${baseURL}?debug#/history/volume`);
  await screenTitled(page, 'Volume semanal');
  const groups = await page.locator('.volume-row').count();
  assert.ok(groups >= 8, `groups ${groups}`);
  assert.equal(await page.locator('.chart-bar').count(), groups * 3);
  assert.equal(await page.locator('.volume-row .trend-symbol').count(), groups, 'every group has ≥ 3 weeks of data');

  // Comparison from the latest planned session.
  await page.goto(`${baseURL}?debug#/history`);
  await screenTitled(page, 'Histórico');
  await page.locator('a.row-anchor[href^="#/history/session/"]', { hasText: /^Exemplo/ }).first().tap();
  await page.locator('#open-compare').tap();
  await screenTitled(page, 'Comparação');
  assert.equal(await page.locator('.compare-table').count(), 3);
  assert.equal(await page.locator('.chart-bar').count(), 6);
  // Deltas always carry an arrow and a hidden word, never color alone.
  const trends = page.locator('.delta-list .trend');
  assert.equal(await trends.count(), 9);
  for (const text of await page.locator('.delta-list .trend .visually-hidden').allTextContents()) assert.match(text, /^(Subiu|Estável|Caiu) $/);

  // Heatmap: 16 weeks × 7 days, sessions counted.
  await page.goto(`${baseURL}?debug#/history/consistency`);
  await screenTitled(page, 'Consistência');
  assert.equal(await page.locator('.heatmap .heatmap-cell').count(), 16 * 7);
  const counted = await page.locator('.heatmap .heatmap-cell').evaluateAll((cells) => cells.reduce((sum, cell) => sum + Number(cell.dataset.count), 0));
  assert.equal(counted, sessions);
  await page.getByRole('img', { name: new RegExp(`${sessions} treinos nas últimas 16 semanas`) }).waitFor();

  // Início: next plan, this week, records.
  await page.goto(`${baseURL}?debug#/home`);
  await screenTitled(page, 'Início');
  await page.getByText('Próxima ficha').waitFor();
  await page.locator('#home-streak .stat-value').waitFor();
  assert.ok(Number(await page.locator('#home-streak .stat-value').textContent()) >= 3);
  assert.ok((await page.locator('#home-records .row').count()) >= 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('history filter by plan and ad-hoc', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  await page.getByLabel('Ficha').selectOption({ label: 'Exemplo C — Pernas' });
  await page.waitForURL(/ficha=/);
  await page.locator('a.row-anchor[href^="#/history/session/"]').first().waitFor();
  const titles = await page.locator('a.row-anchor[href^="#/history/session/"] .row-title').allTextContents();
  assert.ok(titles.length > 0 && titles.every((title) => title === 'Exemplo C — Pernas'), titles.join());
  await page.getByLabel('Ficha').selectOption({ label: 'Treino avulso' });
  await page.waitForFunction(() => location.hash.includes('ficha=avulso'));
  await page.locator('a.row-anchor[href^="#/history/session/"] .row-title', { hasText: 'Treino avulso' }).first().waitFor();
  assert.equal(await page.locator('a.row-anchor[href^="#/history/session/"]').count(), 1);
  // Unknown filter falls back to all sessions.
  await page.goto(`${baseURL}#/history?ficha=nao-existe`);
  await screenTitled(page, 'Histórico');
  assert.ok((await page.locator('a.row-anchor[href^="#/history/session/"]').count()) > 1);
  assert.deepEqual(errors, []);
  await context.close();
});

test('session detail editing: invalid values save nothing; edit, add and delete sets; times; delete session', async () => {
  const { context, page, errors } = await phone();
  await page.goto(baseURL);
  await screenTitled(page, 'Início');
  const sessionId = await inApp(
    page,
    `
    const exercises = await repository.listExercises();
    const bench = exercises.find((e) => e.name === 'Supino reto com barra');
    const plan = await repository.createPlan({ name: 'A' });
    await repository.addExerciseToPlan(plan.id, { exerciseId: bench.id, prescribedSets: 3, repMin: 6, repMax: 8, restSeconds: 90 });
    const start = Date.now() - 2 * 86400000;
    const s = await repository.startSession({ planId: plan.id, startedAt: start });
    const d = await repository.getSessionDetail(s.id);
    await repository.addSet(d.exercises[0].id, { load: 80, reps: 8, completedAt: start + 60000 });
    await repository.addSet(d.exercises[0].id, { load: 80, reps: 7, completedAt: start + 240000 });
    await repository.endSession(s.id, start + 3600000);
    return s.id;
  `,
  );
  const storedSets = () => inApp(page, `return (await repository.getSessionDetail('${sessionId}')).exercises[0].sets.map((s) => [s.load, s.reps, s.type]);`);
  await page.goto(`${baseURL}#/history/session/${sessionId}`);
  await screenTitled(page, 'A');
  await page.getByRole('button', { name: 'Editar Série 1: 80 kg, 8 repetições' }).tap();
  const dialog = page.getByRole('dialog');

  // Invalid load, then invalid reps: error, dialog stays, nothing saved.
  await dialog.getByLabel('Carga (kg)').fill('80,3');
  await dialog.locator('[data-confirm]').tap();
  await dialog.getByRole('alert').getByText('A carga deve ficar entre 0 e 1000 kg').waitFor();
  await dialog.getByLabel('Carga (kg)').fill('abc');
  await dialog.locator('[data-confirm]').tap();
  await dialog.getByRole('alert').getByText('A carga deve ficar').waitFor();
  await dialog.getByLabel('Carga (kg)').fill('82,5');
  await dialog.getByLabel('Reps', { exact: true }).fill('0');
  await dialog.locator('[data-confirm]').tap();
  await dialog.getByRole('alert').getByText('As reps devem ser').waitFor();
  assert.deepEqual(await storedSets(), [[80, 8, 'normal'], [80, 7, 'normal']]);

  // Valid edit: 82,5 × 6 as warmup.
  await dialog.getByLabel('Reps', { exact: true }).fill('6');
  await dialog.getByLabel('Tipo da série').selectOption('warmup');
  await dialog.locator('[data-confirm]').tap();
  await page.getByRole('status').getByText('Série 1 salva.').waitFor();
  assert.deepEqual(await storedSets(), [[82.5, 6, 'warmup'], [80, 7, 'normal']]);
  await page.getByRole('button', { name: 'Editar Série 1: 82,5 kg, 6 repetições, Aquecimento' }).waitFor();

  // Add a set (prefilled from the last one), then delete set 2.
  await page.getByRole('button', { name: 'Adicionar série em Supino reto com barra' }).tap();
  assert.equal(await dialog.getByLabel('Carga (kg)').inputValue(), '80');
  await dialog.getByLabel('Reps', { exact: true }).fill('5');
  await dialog.locator('[data-confirm]').tap();
  await page.getByRole('status').getByText('Série adicionada').waitFor();
  await page.getByRole('button', { name: /^Editar Série 2:/ }).tap();
  await page.locator('#history-delete-set').tap();
  await page.getByRole('status').getByText('Série 2 excluída.').waitFor();
  assert.deepEqual(await storedSets(), [[82.5, 6, 'warmup'], [80, 5, 'normal']]);

  // Times: end before start is refused; a valid change saves both at once.
  await page.locator('#edit-times').tap();
  const start = await dialog.getByLabel('Início').inputValue();
  await dialog.getByLabel('Fim').fill(start.replace(/T\d\d:\d\d$/, 'T00:00'));
  await dialog.getByLabel('Início').fill(start.replace(/T\d\d:\d\d$/, 'T10:00'));
  await dialog.locator('[data-confirm]').tap();
  await dialog.getByRole('alert').getByText('O fim deve ser depois do início').waitFor();
  await dialog.getByLabel('Fim').fill(start.replace(/T\d\d:\d\d$/, 'T11:15'));
  await dialog.locator('[data-confirm]').tap();
  await page.getByRole('status').getByText('Horário salvo.').waitFor();
  const times = await inApp(page, `const s = (await repository.listSessions())[0]; return [new Date(s.startedAt).getHours(), new Date(s.endedAt).getHours(), (s.endedAt - s.startedAt) / 60000];`);
  assert.deepEqual(times, [10, 11, 75]);
  await page.locator('#session-totals').getByText('1:15', { exact: true }).waitFor();

  // Delete the session (cancel first, then confirm).
  await page.locator('#delete-session').tap();
  await dialog.getByRole('button', { name: 'Cancelar' }).tap();
  assert.equal(await inApp(page, 'return (await repository.listSessions()).length;'), 1);
  await page.locator('#delete-session').tap();
  await dialog.locator('[data-confirm]').tap();
  await screenTitled(page, 'Histórico');
  await page.getByRole('status').getByText('Treino excluído.').waitFor();
  assert.equal(await inApp(page, 'return (await repository.listSessions()).length;'), 0);
  assert.equal(await inApp(page, 'return (await repository.counts()).sets;'), 0);

  // Links to sessions or exercises that no longer exist show the error screen.
  await page.goto(`${baseURL}#/history/session/${sessionId}`);
  await screenTitled(page, 'Não foi possível abrir esta tela');
  await page.goto(`${baseURL}#/history/exercise/nao-existe`);
  await screenTitled(page, 'Não foi possível abrir esta tela');
  assert.deepEqual(errors, []);
  await context.close();
});

test('Início: open session card, start suggested plan; comparison for ad-hoc and first session', async () => {
  const { context, page, errors } = await phone();
  await withSampleData(page);
  await page.goto(`${baseURL}?debug#/home`);
  await screenTitled(page, 'Início');
  const planName = await page.locator('#home-next').textContent();
  await page.locator('#home-start').tap();
  await screenTitled(page, planName);
  await page.goto(`${baseURL}?debug#/home`);
  await screenTitled(page, 'Início');
  await page.getByText('Treino em andamento').waitFor();
  await page.locator('#home-continue').tap();
  await screenTitled(page, planName);

  // Ad-hoc session: comparison explains there is no plan.
  const adHocId = await inApp(page, 'return (await repository.listSessions()).find((s) => s.planId === null).id;');
  await page.goto(`${baseURL}?debug#/history/session/${adHocId}/compare`);
  await page.locator('#compare-empty').getByText('Treinos avulsos não têm ficha').waitFor();
  // The open session is not in history: its detail link goes to Treino.
  const openId = await inApp(page, 'return (await repository.getOpenSession()).id;');
  await page.goto(`${baseURL}?debug#/history/session/${openId}`);
  await screenTitled(page, planName);
  assert.deepEqual(errors, []);
  await context.close();
});
