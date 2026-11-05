// Phase 3 flows in a phone-sized browser: plans CRUD, custom exercises and
// file import (free-exercise-db JSON and pt-BR CSV), plus failure paths.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { startServer } from '../../tools/serve.js';
import { builtinCatalog } from '../../src/data/catalog.pt-BR.js';

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

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
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  return { context, page, errors };
}

const heading = (page) => page.getByRole('heading', { level: 1 });
/** Waits for the screen whose h1 is exactly `title`. */
const screenTitled = (page, title) => page.getByRole('heading', { level: 1, name: title, exact: true }).waitFor();
const status = (page) => page.getByRole('status');

async function createPlan(page, name) {
  await page.goto(`${baseURL}#/plans`);
  await page.getByRole('link', { name: 'Nova ficha' }).tap();
  await page.getByLabel('Nome da ficha').fill(name);
  await page.getByRole('button', { name: 'Criar ficha' }).tap();
  await screenTitled(page, name);
}

async function addExercise(page, search, exerciseName) {
  await page.getByRole('link', { name: 'Adicionar exercício' }).tap();
  await page.getByPlaceholder('Buscar exercício').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}`) }).tap();
  await screenTitled(page, exerciseName);
}

test('plan flow: create, add exercises, edit prescription, reorder, rename, duplicate, archive, delete', async () => {
  const { context, page, errors } = await phone();
  await createPlan(page, 'A — Superiores');

  await addExercise(page, 'supino reto barra', 'Supino reto com barra');
  await page.getByRole('button', { name: 'Aumentar Séries' }).tap();
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Diminuir Reps mínimas' }).tap();
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Diminuir Reps máximas' }).tap();
  for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Aumentar Descanso' }).tap();
  await page.getByRole('button', { name: 'Salvar' }).tap();
  await status(page).filter({ hasText: 'Alterações salvas.' }).waitFor();
  await page.getByText('4 × 6–8 · 2:30').waitFor();

  await addExercise(page, 'remada curvada', 'Remada curvada com barra');
  await page.getByRole('link', { name: 'A — Superiores' }).tap();
  await screenTitled(page, 'A — Superiores');
  const rows = page.locator('.group-list .row-title');
  assert.deepEqual(await rows.allTextContents(), ['Supino reto com barra', 'Remada curvada com barra']);

  await page.getByRole('button', { name: 'Mover Remada curvada com barra para cima' }).tap();
  await page.locator('.group-list .row-title').first().filter({ hasText: 'Remada' }).waitFor();
  assert.deepEqual(await rows.allTextContents(), ['Remada curvada com barra', 'Supino reto com barra']);

  await page.getByLabel('Nome da ficha').fill('A — Peito e costas');
  await page.getByLabel('Nome da ficha').press('Enter');
  await screenTitled(page, 'A — Peito e costas');

  await page.getByRole('button', { name: 'Duplicar' }).tap();
  await screenTitled(page, 'A — Peito e costas (cópia)');
  assert.equal(await page.locator('.group-list .row-title').count(), 2);

  await page.getByRole('button', { name: 'Arquivar' }).tap();
  await status(page).filter({ hasText: 'Ficha arquivada.' }).waitFor();
  await page.getByText('1 ficha arquivada').tap();
  await page.locator('details .row-title', { hasText: '(cópia)' }).tap();
  await page.getByRole('button', { name: 'Desarquivar' }).tap();
  await status(page).filter({ hasText: 'Ficha desarquivada.' }).waitFor();

  await page.getByRole('link', { name: /\(cópia\)/ }).tap();
  await page.getByRole('button', { name: 'Excluir ficha' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).tap();
  await screenTitled(page, 'A — Peito e costas (cópia)');
  await page.getByRole('button', { name: 'Excluir ficha' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir ficha' }).tap();
  await status(page).filter({ hasText: 'Ficha excluída.' }).waitFor();
  assert.deepEqual(await page.locator('.group-list .row-title').allTextContents(), ['A — Peito e costas', 'Exercícios']);

  assert.deepEqual(errors, []);
  await context.close();
});

test('reordering plans from the list', async () => {
  const { context, page } = await phone();
  await createPlan(page, 'A');
  await createPlan(page, 'B');
  await page.goto(`${baseURL}#/plans`);
  await page.getByRole('button', { name: 'Reordenar' }).tap();
  await page.getByRole('button', { name: 'Mover B para cima' }).tap();
  await page.getByRole('button', { name: 'Concluído' }).waitFor();
  await page.getByRole('button', { name: 'Concluído' }).tap();
  assert.deepEqual((await page.locator('.group-list .row-title').allTextContents()).slice(0, 2), ['B', 'A']);
  await context.close();
});

test('custom exercise: create from a plan, rename, block duplicates, archive and delete', async () => {
  const { context, page, errors } = await phone();
  await createPlan(page, 'C');
  await page.getByRole('link', { name: 'Adicionar exercício' }).tap();
  await page.getByRole('link', { name: 'Criar exercício' }).tap();
  await page.getByLabel('Nome').fill('Remada no aparelho articulado');
  await page.getByLabel('Grupo primário').selectOption('back');
  await page.getByLabel('Bíceps').check();
  await page.getByLabel('Equipamento').selectOption('machine');
  await page.getByLabel('Padrão de movimento').selectOption('horizontalPull');
  await page.getByLabel('Incremento de carga (kg)').fill('2,5');
  await page.getByRole('button', { name: 'Criar exercício' }).tap();
  await screenTitled(page, 'Remada no aparelho articulado');
  await page.getByRole('button', { name: 'Salvar' }).tap();
  await status(page).filter({ hasText: 'Alterações salvas.' }).waitFor();

  await page.goto(`${baseURL}#/catalog/new`);
  await page.getByLabel('Nome').fill('remada no APARELHO articulado');
  await page.getByRole('button', { name: 'Criar exercício' }).tap();
  await page.getByRole('alert').filter({ hasText: 'Já existe um exercício com esse nome.' }).waitFor();

  await page.getByLabel('Nome').fill('Exercício descartável');
  await page.getByLabel('Incremento de carga (kg)').fill('abc');
  await page.getByRole('button', { name: 'Criar exercício' }).tap();
  await page.getByRole('alert').filter({ hasText: 'Incremento deve ser' }).waitFor();
  await page.getByLabel('Incremento de carga (kg)').fill('');
  await page.getByRole('button', { name: 'Criar exercício' }).tap();
  await status(page).filter({ hasText: 'Exercício criado.' }).waitFor();

  await page.getByPlaceholder('Buscar exercício').fill('descartavel');
  await page.getByRole('link', { name: /Exercício descartável/ }).tap();
  await page.getByRole('button', { name: 'Excluir exercício' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir exercício' }).tap();
  await status(page).filter({ hasText: 'Exercício excluído.' }).waitFor();

  await page.getByPlaceholder('Buscar exercício').fill('articulado');
  await page.getByRole('link', { name: /Remada no aparelho articulado/ }).tap();
  assert.equal(await page.getByRole('button', { name: 'Excluir exercício' }).count(), 0, 'used by plan C: no delete');
  await page.getByText('remova-o antes destas fichas: C').waitFor();
  await page.getByRole('button', { name: 'Arquivar' }).tap();
  await status(page).filter({ hasText: 'Exercício arquivado.' }).waitFor();
  await page.getByText('1 exercício arquivado').waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});

test('built-in exercise: only the increment can change', async () => {
  const { context, page } = await phone();
  await page.goto(`${baseURL}#/catalog`);
  await page.getByPlaceholder('Buscar exercício').fill('rosca martelo');
  await page.getByRole('link', { name: /Rosca martelo/ }).tap();
  assert.equal(await page.getByLabel('Nome').count(), 0);
  assert.equal(await page.getByLabel('Incremento de carga (kg)').getAttribute('placeholder'), 'Padrão: 2');
  await page.getByLabel('Incremento de carga (kg)').fill('1');
  await page.getByRole('button', { name: 'Salvar' }).tap();
  await status(page).filter({ hasText: 'Alterações salvas.' }).waitFor();
  await context.close();
});

async function startImport(page, file) {
  await page.goto(`${baseURL}#/catalog`);
  await page.getByRole('link', { name: 'Importar' }).tap();
  await page.locator('input[type=file]').setInputFiles(file);
}

test('import the free-exercise-db JSON: mapping, review, confirmation, and nothing new the second time', async () => {
  const { context, page, errors } = await phone();
  await startImport(page, fixture('free-exercise-db.json'));
  await screenTitled(page, 'Campos do arquivo');
  assert.equal(await page.getByLabel('Nome (obrigatório)').inputValue(), 'name');
  assert.equal(await page.getByLabel('Grupo primário (obrigatório)').inputValue(), 'primaryMuscles');
  await page.getByRole('button', { name: 'Continuar' }).tap();

  await screenTitled(page, 'Revisar exercícios');
  await page.getByText('873 novos · 3 já existem · 0 repetidos no arquivo · 0 inválidos').waitFor();
  await page.getByRole('button', { name: 'Desmarcar todos', exact: true }).tap();
  assert.equal(await page.locator('#review-continue').isDisabled(), true);
  await page.getByPlaceholder('Filtrar por nome').fill('bench press');
  await page.getByRole('button', { name: 'Marcar todos', exact: true }).tap();
  const selected = await page.locator('.review-row:not([hidden]) input:checked').count();
  assert.ok(selected > 5, `${selected}`);
  await page.getByPlaceholder('Filtrar por nome').fill('');
  await page.getByLabel(/^Barbell Bench Press - Medium Grip/).uncheck();
  await page.locator('#review-continue').tap();

  await screenTitled(page, 'Confirmar importação');
  const button = page.locator('#import-confirm');
  assert.equal(await button.textContent(), `Importar ${selected - 1} exercícios`);
  await button.tap();
  await status(page).filter({ hasText: `${selected - 1} exercícios importados.` }).waitFor();
  await page.getByText(`${builtinCatalog.length + selected - 1} exercícios ativos`).waitFor();

  await startImport(page, fixture('free-exercise-db.json'));
  await page.getByRole('button', { name: 'Continuar' }).tap();
  await page.getByText(`${873 - (selected - 1)} novos · ${3 + selected - 1} já existem`).waitFor();

  assert.deepEqual(errors, []);
  await context.close();
});

test('import a pt-BR CSV with semicolons, duplicates and an invalid row', async () => {
  const { context, page } = await phone();
  await startImport(page, fixture('exercicios-ptbr.csv'));
  await page.getByRole('button', { name: 'Continuar' }).tap();
  await page.getByText('6 novos · 1 já existem · 1 repetidos no arquivo · 1 inválidos').waitFor();
  await page.getByText('Sem grupo primário').waitFor();
  assert.equal(await page.getByLabel(/^Agachamento livre com barra/).isDisabled(), true);
  await page.locator('#review-continue').tap();
  await page.locator('#import-confirm').tap();
  await status(page).filter({ hasText: '6 exercícios importados.' }).waitFor();
  await page.getByPlaceholder('Buscar exercício').fill('meadows');
  await page.getByRole('link', { name: /Remada "Meadows"/ }).waitFor();
  await context.close();
});

test('import failures: unreadable file, missing required mapping, reload mid-wizard', async () => {
  const { context, page } = await phone();
  await page.goto(`${baseURL}#/catalog/import`);
  await page.locator('input[type=file]').setInputFiles({ name: 'quebrado.json', mimeType: 'application/json', buffer: Buffer.from('[{"name": "x"') });
  await page.getByRole('alert').filter({ hasText: 'Este arquivo JSON não pôde ser lido' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'vazio.csv', mimeType: 'text/csv', buffer: Buffer.from('') });
  await page.getByRole('alert').filter({ hasText: 'O arquivo está vazio.' }).waitFor();

  await page.locator('input[type=file]').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('coluna1;coluna2\na;b\n') });
  await screenTitled(page, 'Campos do arquivo');
  await page.getByRole('button', { name: 'Continuar' }).tap();
  await page.getByRole('alert').filter({ hasText: 'Escolha as colunas de nome e de grupo primário.' }).waitFor();

  await page.reload();
  await screenTitled(page, 'Importar exercícios');
  await page.goto(`${baseURL}#/catalog/import/confirm`);
  await screenTitled(page, 'Importar exercícios');
  await context.close();
});

test('a plan with history offers archive but not delete', async () => {
  const context = await browser.newContext({ ...devices['iPhone 13'], bypassCSP: true });
  const page = await context.newPage();
  await page.goto(baseURL);
  const planId = await page.evaluate(async () => {
    const { getRepository } = await import('./src/data/app-data.js');
    const repository = await getRepository();
    const [bench] = (await repository.listExercises()).filter((exercise) => exercise.builtinKey === 'supino-reto-barra');
    const plan = await repository.createPlan({ name: 'Com histórico' });
    await repository.addExerciseToPlan(plan.id, { exerciseId: bench.id, prescribedSets: 3, repMin: 8, repMax: 10, restSeconds: 90 });
    const session = await repository.startSession({ planId: plan.id });
    await repository.endSession(session.id);
    return plan.id;
  });
  await page.goto(`${baseURL}#/plans/${planId}`);
  await page.getByText('pode ser arquivada, mas não excluída').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Excluir ficha' }).count(), 0);
  await context.close();
});

test('opening a link to something that no longer exists shows an error screen', async () => {
  const { context, page } = await phone();
  await page.goto(`${baseURL}#/plans/nao-existe`);
  await screenTitled(page, 'Não foi possível abrir esta tela');
  await page.getByText('Este item não existe mais.').waitFor();
  await context.close();
});
