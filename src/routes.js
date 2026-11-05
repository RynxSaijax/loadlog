import { renderHome } from './features/home/home.js';
import { renderWorkout } from './features/workout/workout.js';
import { renderSessionAdd } from './features/workout/session-add.js';
import { renderSummary } from './features/workout/summary.js';
import { renderPlans } from './features/plans/plans.js';
import { renderPlanNew } from './features/plans/plan-new.js';
import { renderPlanDetail } from './features/plans/plan-detail.js';
import { renderPlanItem } from './features/plans/plan-item.js';
import { renderExercisePicker } from './features/plans/exercise-picker.js';
import { renderCatalog } from './features/catalog/catalog.js';
import { renderExerciseCreate, renderExerciseEdit } from './features/catalog/exercise-form.js';
import { renderImportFile } from './features/catalog/import-file.js';
import { renderImportMap } from './features/catalog/import-map.js';
import { renderImportReview } from './features/catalog/import-review.js';
import { renderImportConfirm } from './features/catalog/import-confirm.js';
import { renderHistory } from './features/history/history.js';
import { renderSessionDetail } from './features/history/session-detail.js';
import { renderCompare } from './features/history/compare.js';
import { renderExercise, renderExerciseList } from './features/history/exercise.js';
import { renderVolume } from './features/history/volume.js';
import { renderConsistency } from './features/history/consistency.js';
import { renderSettings } from './features/settings/settings.js';
import { renderIncrements } from './features/settings/increments.js';
import { renderExport } from './features/settings/export.js';
import { renderBackup } from './features/settings/backup.js';
import { renderPrivacy } from './features/settings/privacy.js';

/** Every screen. Order matters: fixed segments before ":params". */
export const routes = Object.freeze([
  { path: 'home', tab: 'home', render: renderHome },
  { path: 'workout', tab: 'workout', render: renderWorkout },
  { path: 'workout/add', tab: 'workout', render: renderSessionAdd },
  { path: 'workout/summary/:sessionId', tab: 'workout', render: renderSummary },
  { path: 'plans', tab: 'plans', render: renderPlans },
  { path: 'plans/new', tab: 'plans', render: renderPlanNew },
  { path: 'plans/:planId', tab: 'plans', render: renderPlanDetail },
  { path: 'plans/:planId/add', tab: 'plans', render: renderExercisePicker },
  { path: 'plans/:planId/items/:itemId', tab: 'plans', render: renderPlanItem },
  { path: 'catalog', tab: 'plans', render: renderCatalog },
  { path: 'catalog/new', tab: 'plans', render: renderExerciseCreate },
  { path: 'catalog/import', tab: 'plans', render: renderImportFile },
  { path: 'catalog/import/map', tab: 'plans', render: renderImportMap },
  { path: 'catalog/import/review', tab: 'plans', render: renderImportReview },
  { path: 'catalog/import/confirm', tab: 'plans', render: renderImportConfirm },
  { path: 'catalog/:exerciseId', tab: 'plans', render: renderExerciseEdit },
  { path: 'history', tab: 'history', render: renderHistory },
  { path: 'history/exercises', tab: 'history', render: renderExerciseList },
  { path: 'history/volume', tab: 'history', render: renderVolume },
  { path: 'history/consistency', tab: 'history', render: renderConsistency },
  { path: 'history/session/:sessionId', tab: 'history', render: renderSessionDetail },
  { path: 'history/session/:sessionId/compare', tab: 'history', render: renderCompare },
  { path: 'history/exercise/:exerciseId', tab: 'history', render: renderExercise },
  { path: 'settings', tab: 'settings', render: renderSettings },
  { path: 'settings/increments', tab: 'settings', render: renderIncrements },
  { path: 'settings/export', tab: 'settings', render: renderExport },
  { path: 'settings/backup', tab: 'settings', render: renderBackup },
  { path: 'settings/privacy', tab: 'settings', render: renderPrivacy },
]);
