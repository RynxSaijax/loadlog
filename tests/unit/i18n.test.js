import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ptBR } from '../../src/i18n/pt-BR.js';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));

async function listJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return listJsFiles(path);
      return entry.name.endsWith('.js') ? [path] : [];
    }),
  );
  return files.flat();
}

test('every literal string key used in src exists in the pt-BR catalog', async () => {
  const keyPattern = /(?:\bt\(|Key:\s*)'([a-zA-Z][\w.]*)'/g;
  const pluralPattern = /\btp\('([a-zA-Z][\w.]*)'/g;
  const missing = [];
  for (const file of await listJsFiles(srcDir)) {
    const source = await readFile(file, 'utf8');
    for (const [, key] of source.matchAll(keyPattern)) {
      if (!(key in ptBR)) missing.push(`${key} (${file})`);
    }
    for (const [, key] of source.matchAll(pluralPattern)) {
      if (!(`${key}.one` in ptBR) || !(`${key}.other` in ptBR)) missing.push(`${key}.one/.other (${file})`);
    }
  }
  assert.deepEqual(missing, []);
});

test('catalog values are non-empty strings', () => {
  for (const [key, value] of Object.entries(ptBR)) {
    assert.equal(typeof value, 'string', key);
    assert.notEqual(value.trim(), '', key);
  }
});

test('feature views contain no quoted pt-BR text', async () => {
  const accented = /['"`][^'"`]*[À-ÿ][^'"`]*['"`]/;
  const offenders = [];
  for (const file of await listJsFiles(join(srcDir, 'features'))) {
    const source = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (accented.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('every import reason, problem, status and target has a message', async () => {
  const { ImportTarget } = await import('../../src/data/import/mapping.js');
  const { ReviewStatus } = await import('../../src/data/import/review.js');
  const keys = [
    ...['empty', 'invalidJson', 'invalidCsv', 'invalidHeader', 'noRecords', 'tooManyRecords', 'tooLarge', 'unreadable', 'requiredMapping'].map((reason) => `import.error.${reason}`),
    ...['missingName', 'nameTooLong', 'missingMuscle', 'unknownMuscle'].map((problem) => `import.problem.${problem}`),
    ...Object.values(ReviewStatus).filter((status) => status !== 'new' && status !== 'invalid').map((status) => `import.status.${status}`),
    ...Object.values(ImportTarget).flatMap((target) => [`import.target.${target}`, `import.targetHint.${target}`]),
  ];
  assert.deepEqual(keys.filter((key) => !(key in ptBR)), []);
});

test('every validated field the UI can hit has a specific message', async () => {
  const fields = ['name', 'prescribedSets', 'repMin', 'repMax', 'restSeconds', 'incrementOverride', 'secondaryMuscles', 'source', 'order'];
  assert.deepEqual(fields.filter((field) => !(`errors.field.${field}` in ptBR)), []);
});
