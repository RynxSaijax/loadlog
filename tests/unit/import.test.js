import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, detectDelimiter } from '../../src/data/import/csv.js';
import { parseImportFile, ImportParseError, MAX_IMPORT_ROWS } from '../../src/data/import/parse.js';
import { suggestMapping, mapRecord, inferMovementPattern } from '../../src/data/import/mapping.js';
import { buildReview, reviewCounts, ReviewStatus } from '../../src/data/import/review.js';
import { normalizeName } from '../../src/data/normalize.js';
import { builtinCatalog } from '../../src/data/catalog.pt-BR.js';

const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('CSV: quotes, escaped quotes, delimiters inside quotes, CRLF and BOM', () => {
  const text = '﻿a,b,c\r\n"x, y","he said ""hi""",3\r\n\r\nlast,,"multi\nline"\n';
  assert.deepEqual(parseCsv(text), [
    ['a', 'b', 'c'],
    ['x, y', 'he said "hi"', '3'],
    ['last', '', 'multi\nline'],
  ]);
});

test('CSV: semicolon is detected when it dominates the header', () => {
  assert.equal(detectDelimiter('Nome;Grupo;Equipamento'), ';');
  assert.equal(detectDelimiter('name,group'), ',');
  assert.equal(detectDelimiter('"a;b",c'), ',');
});

test('CSV: an unterminated quote is an error', () => {
  assert.throws(() => parseCsv('a,b\n"open,1'));
});

test('file parsing rejects empty, broken and record-less files with a reason', () => {
  const reason = (text, name) => {
    try {
      parseImportFile(text, name);
    } catch (error) {
      assert.ok(error instanceof ImportParseError);
      return error.reason;
    }
    return 'parsed';
  };
  assert.equal(reason('', 'a.json'), 'empty');
  assert.equal(reason('   \n', 'a.csv'), 'empty');
  assert.equal(reason('[{"name": "x"', 'a.json'), 'invalidJson');
  assert.equal(reason('{"version": 1}', 'a.json'), 'noRecords');
  assert.equal(reason('[]', 'a.json'), 'noRecords');
  assert.equal(reason('[1, 2, "x"]', 'a.json'), 'noRecords');
  assert.equal(reason('nome;grupo', 'a.csv'), 'noRecords');
  assert.equal(reason('nome;;grupo\nx;y;z', 'a.csv'), 'invalidHeader');
  assert.equal(reason('nome;nome\nx;y', 'a.csv'), 'invalidHeader');
  assert.equal(reason('nome,grupo\n"x,y', 'a.csv'), 'invalidCsv');
  assert.equal(reason(JSON.stringify(Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({ name: 'x' }))), 'a.json'), 'tooManyRecords');
});

test('JSON wrapped in an object is found', () => {
  const parsed = parseImportFile(JSON.stringify({ meta: { v: 1 }, exercises: [{ name: 'A' }, { name: 'B', extra: 1 }] }), 'x.json');
  assert.deepEqual(parsed.fields, ['name', 'extra']);
  assert.equal(parsed.records.length, 2);
});

test('free-exercise-db: fields are mapped automatically', async () => {
  const parsed = parseImportFile(await fixture('free-exercise-db.json'), 'exercises.json');
  assert.equal(parsed.format, 'json');
  assert.ok(parsed.records.length > 800);
  assert.deepEqual(suggestMapping(parsed.fields), {
    name: 'name',
    primaryMuscle: 'primaryMuscles',
    secondaryMuscles: 'secondaryMuscles',
    equipment: 'equipment',
    movementPattern: null,
    mechanic: 'mechanic',
  });
});

test('free-exercise-db: every record maps to a valid exercise', async () => {
  const parsed = parseImportFile(await fixture('free-exercise-db.json'), 'exercises.json');
  const mapping = suggestMapping(parsed.fields);
  const problems = parsed.records.map((record) => mapRecord(record, mapping)).filter((result) => result.problem);
  assert.deepEqual(problems, []);
});

test('free-exercise-db: values are translated to the app enums', () => {
  const mapping = suggestMapping(['name', 'primaryMuscles', 'secondaryMuscles', 'equipment', 'mechanic']);
  const map = (record) => mapRecord(record, mapping).item;
  assert.deepEqual(map({ name: 'Wide-Grip Lat Pulldown', primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'middle back', 'shoulders'], equipment: 'cable', mechanic: 'compound' }), {
    name: 'Wide-Grip Lat Pulldown', primaryMuscle: 'back', secondaryMuscles: ['biceps', 'shoulders'], equipment: 'cable', movementPattern: 'verticalPull',
  });
  assert.equal(map({ name: 'EZ Curl', primaryMuscles: ['biceps'], equipment: 'e-z curl bar', mechanic: 'isolation' }).equipment, 'barbell');
  assert.equal(map({ name: 'Kettlebell Swing', primaryMuscles: ['hamstrings'], equipment: 'kettlebells', mechanic: 'compound' }).equipment, 'other');
  assert.equal(map({ name: 'Plank', primaryMuscles: ['abdominals'], equipment: null, mechanic: null }).equipment, 'other');
  assert.equal(map({ name: 'Push-up', primaryMuscles: ['chest'], equipment: 'body only', mechanic: 'compound' }).equipment, 'bodyweight');
  assert.equal(map({ name: 'Neck Flex', primaryMuscles: ['neck'], equipment: 'other' }).primaryMuscle, 'traps');
});

test('pt-BR CSV: accents, plural forms and quoted names map correctly', async () => {
  const parsed = parseImportFile(await fixture('exercicios-ptbr.csv'), 'exercicios.csv');
  assert.equal(parsed.format, 'csv');
  const mapping = suggestMapping(parsed.fields);
  assert.deepEqual(mapping, { name: 'Nome', primaryMuscle: 'Grupo', secondaryMuscles: 'Secundários', equipment: 'Equipamento', movementPattern: 'Padrão', mechanic: null });
  const results = parsed.records.map((record) => mapRecord(record, mapping));
  assert.deepEqual(results[0].item, { name: 'Supino com pausa', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell', movementPattern: 'horizontalPush' });
  assert.equal(results[1].item.name, 'Remada "Meadows"');
  assert.equal(results[2].item.equipment, 'dumbbell');
  assert.equal(results[3].item.movementPattern, 'squat', 'inferred from the primary group');
  assert.equal(results[6].problem, 'missingMuscle');
  assert.equal(results[7].item.movementPattern, 'isolation');
  assert.equal(results[8].item.name, 'Remada; com ponto e vírgula');
  assert.equal(results[8].item.equipment, 'cable');
});

test('mapping problems: missing or unknown values', () => {
  const mapping = { name: 'n', primaryMuscle: 'p' };
  assert.equal(mapRecord({ n: '  ', p: 'chest' }, mapping).problem, 'missingName');
  assert.equal(mapRecord({ p: 'chest' }, mapping).problem, 'missingName');
  assert.equal(mapRecord({ n: 'x'.repeat(81), p: 'chest' }, mapping).problem, 'nameTooLong');
  assert.equal(mapRecord({ n: 'Ok', p: 'cardio' }, mapping).problem, 'unknownMuscle');
  assert.equal(mapRecord({ n: 'Ok', p: [] }, mapping).problem, 'missingMuscle');
  assert.equal(mapRecord({ n: { nested: true }, p: 'chest' }, mapping).problem, 'missingName');
  assert.equal(mapRecord({ n: 'Ok', p: 'chest' }, mapping).item.equipment, 'other');
});

test('movement inference: isolation wins; otherwise by primary group', () => {
  assert.equal(inferMovementPattern('chest', 'chest', 'isolation'), 'isolation');
  assert.equal(inferMovementPattern('chest', 'chest', 'compound'), 'horizontalPush');
  assert.equal(inferMovementPattern('back', 'lats', null), 'verticalPull');
  assert.equal(inferMovementPattern('back', 'middle back', null), 'horizontalPull');
  assert.equal(inferMovementPattern('hamstrings', 'hamstrings', null), 'hinge');
  assert.equal(inferMovementPattern('abs', 'abdominals', null), 'core');
});

test('review flags duplicates against the catalog (accents and case ignored) and inside the file', async () => {
  const parsed = parseImportFile(await fixture('exercicios-ptbr.csv'), 'exercicios.csv');
  const existing = builtinCatalog.map((item) => ({ name: item.name }));
  const review = buildReview(parsed.records, suggestMapping(parsed.fields), existing);
  assert.deepEqual(review.map((entry) => entry.status), [
    ReviewStatus.new,
    ReviewStatus.new,
    ReviewStatus.new,
    ReviewStatus.new,
    ReviewStatus.duplicateExisting, // "Agachamento livre com barra" is built in
    ReviewStatus.duplicateInFile, // "supino com PAUSA" repeats row 1
    ReviewStatus.invalid,
    ReviewStatus.new,
    ReviewStatus.new,
  ]);
  assert.deepEqual(reviewCounts(review), { new: 6, duplicateExisting: 1, duplicateInFile: 1, invalid: 1, selected: 6 });
  assert.ok(review.filter((entry) => entry.status !== ReviewStatus.new).every((entry) => !entry.selected));
});

test('free-exercise-db review against the built-in catalog', async () => {
  const parsed = parseImportFile(await fixture('free-exercise-db.json'), 'exercises.json');
  const review = buildReview(parsed.records, suggestMapping(parsed.fields), builtinCatalog);
  const counts = reviewCounts(review);
  assert.equal(counts.invalid, 0);
  assert.equal(counts.new + counts.duplicateExisting + counts.duplicateInFile, parsed.records.length);
  assert.equal(counts.selected, counts.new);
  const names = review.filter((entry) => entry.selected).map((entry) => normalizeName(entry.item.name));
  assert.equal(new Set(names).size, names.length, 'no duplicate among selected items');
});

test('normalizeName ignores accents, case and extra spaces', () => {
  assert.equal(normalizeName('  Elevação   LATERAL '), 'elevacao lateral');
  assert.equal(normalizeName('Tríceps'), normalizeName('triceps'));
});
