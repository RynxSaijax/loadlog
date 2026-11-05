import { Equipment, MuscleGroup, MovementPattern } from '../enums.js';
import { normalizeName } from '../normalize.js';

/** Fields the user maps from the file (step 1). `name` and `primaryMuscle` are required. */
export const ImportTarget = Object.freeze({
  name: 'name',
  primaryMuscle: 'primaryMuscle',
  secondaryMuscles: 'secondaryMuscles',
  equipment: 'equipment',
  movementPattern: 'movementPattern',
  mechanic: 'mechanic',
});

export const REQUIRED_TARGETS = Object.freeze([ImportTarget.name, ImportTarget.primaryMuscle]);

const fieldHints = {
  name: ['name', 'nome', 'exercise', 'exercicio', 'titulo', 'title'],
  primaryMuscle: ['primarymuscles', 'primarymuscle', 'primary', 'grupo', 'grupoprimario', 'musculo', 'musculoprimario', 'target', 'muscle', 'bodypart'],
  secondaryMuscles: ['secondarymuscles', 'secondary', 'secundarios', 'gruposecundario', 'grupossecundarios', 'musculossecundarios'],
  equipment: ['equipment', 'equipamento', 'aparelho'],
  movementPattern: ['movementpattern', 'pattern', 'padrao', 'padraodemovimento', 'movimento'],
  mechanic: ['mechanic', 'mecanica', 'tipo'],
};

const compact = (value) => normalizeName(value).replace(/[^a-z0-9]/g, '');

/** Guesses a source field for each target from the file's field names. */
export function suggestMapping(fields) {
  const mapping = {};
  const used = new Set();
  for (const [target, hints] of Object.entries(fieldHints)) {
    const match = fields.find((field) => !used.has(field) && hints.includes(compact(field)));
    mapping[target] = match ?? null;
    if (match) used.add(match);
  }
  return mapping;
}

const muscleSynonyms = new Map(
  Object.entries({
    chest: MuscleGroup.chest, peito: MuscleGroup.chest, peitoral: MuscleGroup.chest, pectorals: MuscleGroup.chest,
    back: MuscleGroup.back, costas: MuscleGroup.back, lats: MuscleGroup.back, 'middle back': MuscleGroup.back, dorsal: MuscleGroup.back, dorsais: MuscleGroup.back, 'upper back': MuscleGroup.back,
    shoulders: MuscleGroup.shoulders, shoulder: MuscleGroup.shoulders, ombros: MuscleGroup.shoulders, ombro: MuscleGroup.shoulders, deltoids: MuscleGroup.shoulders, deltoides: MuscleGroup.shoulders, delts: MuscleGroup.shoulders,
    biceps: MuscleGroup.biceps,
    triceps: MuscleGroup.triceps,
    forearms: MuscleGroup.forearms, forearm: MuscleGroup.forearms, antebraco: MuscleGroup.forearms, antebracos: MuscleGroup.forearms,
    quadriceps: MuscleGroup.quads, quads: MuscleGroup.quads, adductors: MuscleGroup.quads, adutores: MuscleGroup.quads,
    hamstrings: MuscleGroup.hamstrings, posteriores: MuscleGroup.hamstrings, 'posterior de coxa': MuscleGroup.hamstrings, isquiotibiais: MuscleGroup.hamstrings,
    glutes: MuscleGroup.glutes, gluteos: MuscleGroup.glutes, gluteo: MuscleGroup.glutes, abductors: MuscleGroup.glutes, abdutores: MuscleGroup.glutes,
    calves: MuscleGroup.calves, calf: MuscleGroup.calves, panturrilhas: MuscleGroup.calves, panturrilha: MuscleGroup.calves,
    abs: MuscleGroup.abs, abdominals: MuscleGroup.abs, abdominal: MuscleGroup.abs, abdomen: MuscleGroup.abs, core: MuscleGroup.abs,
    'lower back': MuscleGroup.lowerBack, lowerback: MuscleGroup.lowerBack, lombar: MuscleGroup.lowerBack,
    traps: MuscleGroup.traps, trapezius: MuscleGroup.traps, trapezio: MuscleGroup.traps, neck: MuscleGroup.traps, pescoco: MuscleGroup.traps,
  }),
);

const equipmentSynonyms = new Map(
  Object.entries({
    barbell: Equipment.barbell, barra: Equipment.barbell, 'e-z curl bar': Equipment.barbell, 'ez bar': Equipment.barbell, 'barra w': Equipment.barbell,
    dumbbell: Equipment.dumbbell, dumbbells: Equipment.dumbbell, halter: Equipment.dumbbell, halteres: Equipment.dumbbell,
    machine: Equipment.machine, maquina: Equipment.machine, aparelho: Equipment.machine,
    cable: Equipment.cable, cabo: Equipment.cable, polia: Equipment.cable, crossover: Equipment.cable,
    smith: Equipment.smith, 'smith machine': Equipment.smith,
    bodyweight: Equipment.bodyweight, 'body only': Equipment.bodyweight, 'peso corporal': Equipment.bodyweight, 'body weight': Equipment.bodyweight, calistenia: Equipment.bodyweight,
    other: Equipment.other, outro: Equipment.other,
  }),
);

const movementSynonyms = new Map(
  Object.entries({
    ...Object.fromEntries(Object.values(MovementPattern).map((value) => [value.toLowerCase(), value])),
    'empurrar horizontal': MovementPattern.horizontalPush, 'horizontal push': MovementPattern.horizontalPush,
    'empurrar vertical': MovementPattern.verticalPush, 'vertical push': MovementPattern.verticalPush,
    'puxar horizontal': MovementPattern.horizontalPull, 'horizontal pull': MovementPattern.horizontalPull,
    'puxar vertical': MovementPattern.verticalPull, 'vertical pull': MovementPattern.verticalPull,
    agachar: MovementPattern.squat, agachamento: MovementPattern.squat,
    'dobradica de quadril': MovementPattern.hinge, dobradica: MovementPattern.hinge,
    avanco: MovementPattern.lunge, isolamento: MovementPattern.isolation, carregar: MovementPattern.carry,
  }),
);

for (const value of Object.values(MuscleGroup)) muscleSynonyms.set(value.toLowerCase(), value);
for (const value of Object.values(Equipment)) equipmentSynonyms.set(value.toLowerCase(), value);

function lookup(map, raw) {
  return map.get(normalizeName(raw)) ?? map.get(normalizeName(raw).replace(/s$/, '')) ?? null;
}

/** Splits multi-value cells: arrays stay arrays; text splits on , ; | or /. */
function toList(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined) return [];
  return String(value).split(/[,;|/]/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Movement pattern when the file has none: isolation exercises stay
 * isolation; compound ones follow the primary muscle (lats pull vertically).
 */
export function inferMovementPattern(primaryMuscle, rawPrimary, mechanic) {
  if (normalizeName(mechanic) === 'isolation' || normalizeName(mechanic) === 'isolamento') return MovementPattern.isolation;
  switch (primaryMuscle) {
    case MuscleGroup.chest:
    case MuscleGroup.triceps:
      return MovementPattern.horizontalPush;
    case MuscleGroup.shoulders:
      return MovementPattern.verticalPush;
    case MuscleGroup.back:
      return normalizeName(rawPrimary) === 'lats' ? MovementPattern.verticalPull : MovementPattern.horizontalPull;
    case MuscleGroup.quads:
      return MovementPattern.squat;
    case MuscleGroup.hamstrings:
    case MuscleGroup.glutes:
    case MuscleGroup.lowerBack:
      return MovementPattern.hinge;
    case MuscleGroup.abs:
      return MovementPattern.core;
    default:
      return MovementPattern.isolation;
  }
}

const NAME_MAX = 80;

/**
 * Converts one record with the chosen mapping.
 * @returns {{ item: object|null, problem: string|null }} problem is a reason key when the record cannot be imported
 */
export function mapRecord(record, mapping) {
  const read = (target) => (mapping[target] ? record[mapping[target]] : undefined);

  const rawName = read(ImportTarget.name);
  const name = typeof rawName === 'string' || typeof rawName === 'number' ? String(rawName).trim().replace(/\s+/g, ' ') : '';
  if (name === '') return { item: null, problem: 'missingName' };
  if (name.length > NAME_MAX) return { item: null, problem: 'nameTooLong' };

  const rawPrimary = toList(read(ImportTarget.primaryMuscle))[0];
  const primaryMuscle = rawPrimary ? lookup(muscleSynonyms, rawPrimary) : null;
  if (!primaryMuscle) return { item: null, problem: rawPrimary ? 'unknownMuscle' : 'missingMuscle' };

  const secondaryMuscles = [];
  for (const raw of [...toList(read(ImportTarget.primaryMuscle)).slice(1), ...toList(read(ImportTarget.secondaryMuscles))]) {
    const muscle = lookup(muscleSynonyms, raw);
    if (muscle && muscle !== primaryMuscle && !secondaryMuscles.includes(muscle)) secondaryMuscles.push(muscle);
  }

  const rawEquipment = read(ImportTarget.equipment);
  const equipment = (rawEquipment !== null && rawEquipment !== undefined && lookup(equipmentSynonyms, toList(rawEquipment)[0] ?? '')) || Equipment.other;

  const rawPattern = read(ImportTarget.movementPattern);
  const movementPattern =
    (rawPattern && lookup(movementSynonyms, String(rawPattern))) ||
    inferMovementPattern(primaryMuscle, rawPrimary, read(ImportTarget.mechanic));

  return { item: { name, primaryMuscle, secondaryMuscles, equipment, movementPattern }, problem: null };
}
