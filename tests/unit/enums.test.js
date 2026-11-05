import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ptBR } from '../../src/i18n/pt-BR.js';
import { SetType, Equipment, MuscleGroup, MovementPattern, ExerciseSource, defaultIncrement, labelKey } from '../../src/data/enums.js';
import { isEffective } from '../../src/metrics/set-type.js';

const kinds = [
  ['setType', SetType],
  ['equipment', Equipment],
  ['muscle', MuscleGroup],
  ['movement', MovementPattern],
  ['source', ExerciseSource],
];

test('every enum value has a pt-BR label', () => {
  for (const [kind, values] of kinds) {
    for (const value of Object.values(values)) {
      assert.ok(labelKey(kind, value) in ptBR, `${kind}.${value}`);
    }
  }
});

test('enum values are stable strings equal to their keys', () => {
  for (const [, values] of kinds) {
    for (const [key, value] of Object.entries(values)) assert.equal(key, value);
  }
});

test('the spec lists 13 muscle groups, 7 equipment types, 10 movement patterns and 5 set types', () => {
  assert.equal(Object.keys(MuscleGroup).length, 13);
  assert.equal(Object.keys(Equipment).length, 7);
  assert.equal(Object.keys(MovementPattern).length, 10);
  assert.equal(Object.keys(SetType).length, 5);
});

test('default increments follow rule 4.1', () => {
  assert.deepEqual({ ...defaultIncrement }, {
    barbell: 2.5, smith: 2.5, dumbbell: 2, machine: 5, cable: 5, bodyweight: 2.5, other: 2.5,
  });
});

test('every equipment type has a load-convention hint', () => {
  for (const equipment of Object.values(Equipment)) assert.ok(`loadHint.${equipment}` in ptBR, equipment);
});

test('warmup is the only non-effective set type', () => {
  assert.deepEqual(Object.values(SetType).filter((type) => !isEffective(type)), [SetType.warmup]);
});
