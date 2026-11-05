import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CSV_COLUMNS, csvField, isoLocal, sessionsToCsv } from '../../src/features/export/csv.js';
import { encodeText, PdfDocument, textWidth, wrapText } from '../../src/services/pdf.js';
import { buildSessionsPdf } from '../../src/features/export/pdf-report.js';
import { privacyMarkdown } from '../../tools/privacy-policy.js';
import { DEFAULT_SETTINGS, incrementFor } from '../../src/data/settings.js';

const start = new Date(2026, 10, 2, 18, 5).getTime();
const details = [
  {
    id: 's2', startedAt: start + 86400000, endedAt: start + 86400000 + 1800000, planId: null, planNameSnapshot: '',
    exercises: [{ exerciseNameSnapshot: 'Rosca "martelo", halteres', sets: [{ load: 12.5, reps: 10, rir: 2, type: 'normal', dropGroupId: null }] }],
  },
  {
    id: 's1', startedAt: start, endedAt: start + 3600000, planId: 'p', planNameSnapshot: 'A — Peito',
    exercises: [{ exerciseNameSnapshot: 'Supino reto com barra', sets: [
      { load: 40, reps: 10, rir: null, type: 'warmup', dropGroupId: null },
      { load: 80, reps: 8, rir: null, type: 'normal', dropGroupId: null },
      { load: 70, reps: 6, rir: null, type: 'dropSet', dropGroupId: 'g1' },
    ] }],
  },
];

test('CSV: exact header, one row per set, oldest session first, RFC 4180 quoting', () => {
  const csv = sessionsToCsv(details, { planNameFallback: 'Treino avulso' });
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.at(-1), '');
  assert.equal(lines[0], 'session_id,started_at,plan_name,exercise_name,set_order,type,load_kg,reps,rir,drop_group_id');
  assert.deepEqual(CSV_COLUMNS.length, 10);
  assert.equal(lines.length - 2, 4);
  assert.equal(lines[1], `s1,${isoLocal(start)},A — Peito,Supino reto com barra,1,warmup,40,10,,`);
  assert.equal(lines[3], `s1,${isoLocal(start)},A — Peito,Supino reto com barra,3,dropSet,70,6,,g1`);
  assert.equal(lines[4], `s2,${isoLocal(start + 86400000)},Treino avulso,"Rosca ""martelo"", halteres",1,normal,12.5,10,2,`);
  assert.match(isoLocal(start), /^2026-11-02T18:05:00[+-]\d\d:\d\d$/);
  assert.equal(csvField('a\nb'), '"a\nb"');
  assert.equal(sessionsToCsv([]), '\uFEFFsession_id,started_at,plan_name,exercise_name,set_order,type,load_kg,reps,rir,drop_group_id\r\n');
});

test('PDF text encoding: accents in WinAnsi, unsupported symbols replaced, parentheses escaped', () => {
  assert.equal(encodeText('Supino ção'), 'Supino \xe7\xe3o');
  assert.equal(encodeText('A — B'), 'A \x97 B');
  assert.equal(encodeText('(x) \\'), '\\(x\\) \\\\');
  assert.equal(encodeText('↑ 😀'), '+ ?');
  assert.ok(textWidth('WWW', 10) > textWidth('iii', 10));
  assert.deepEqual(wrapText('um dois tres quatro', 10, textWidth('um dois', 10)), ['um dois', 'tres', 'quatro']);
});

test('PDF document: valid structure, xref offsets point at objects, multi-page reports', () => {
  const doc = new PdfDocument({ title: 'Teste' });
  doc.text(50, 800, 'Olá (mundo)').line(50, 790, 300, 790).rect(50, 700, 100, 20);
  doc.addPage().text(50, 800, 'Página 2');
  const bytes = doc.toBytes();
  const text = String.fromCharCode(...bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/Count 2/);
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(xrefAt).startsWith('xref'));
  const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1}`));
  for (const match of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const begin = match.index + match[0].length;
    assert.equal(text.slice(begin + Number(match[1]), begin + Number(match[1]) + 10), '\nendstream');
  }

  const many = Array.from({ length: 40 }, (_, index) => ({
    detail: { startedAt: start + index * 86400000, exercises: details[1].exercises },
    name: `Treino ${index + 1}`,
    totals: { durationMs: 3600000, effectiveSets: 2, tonnage: 1060 },
  }));
  const report = String.fromCharCode(...buildSessionsPdf({ title: 'Relatório', subtitle: 'x', sessions: many, summary: { sessions: 40, effectiveSets: 80, tonnage: 42400, durationMs: 144000000 }, now: start }));
  const pages = Number(/\/Count (\d+)/.exec(report)[1]);
  assert.ok(pages >= 3, `pages ${pages}`);
  assert.match(report, new RegExp(`P\xe1gina ${pages} de ${pages}`));
  assert.ok(report.includes('aq. 40×10'.replace('×', '\xd7')));
});

test('PRIVACY_POLICY.md matches the in-app policy and covers the LGPD points', async () => {
  const file = await readFile(new URL('../../PRIVACY_POLICY.md', import.meta.url), 'utf8');
  assert.equal(file, privacyMarkdown(), 'run: node tools/privacy-policy.js');
  for (const topic of ['apenas neste aparelho', 'não trata', 'Transferência internacional', 'eliminação', 'Contato', 'LGPD']) assert.ok(file.includes(topic), topic);
});

test('increments: exercise override, then Ajustes per equipment, then rule 4.1 default', () => {
  const settings = { ...DEFAULT_SETTINGS, increments: { ...DEFAULT_SETTINGS.increments, barbell: 1.25 } };
  assert.equal(incrementFor({ equipment: 'barbell', incrementOverride: null }, settings), 1.25);
  assert.equal(incrementFor({ equipment: 'barbell', incrementOverride: 5 }, settings), 5);
  assert.equal(incrementFor({ equipment: 'dumbbell', incrementOverride: null }, settings), 2);
  assert.equal(incrementFor(undefined, settings), 2.5);
});
