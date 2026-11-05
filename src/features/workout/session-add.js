import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { errorArea, fragment, navHeader, runAction } from '../../shared/ui.js';
import { exerciseSubtitle, searchableExerciseList } from '../../shared/exercise-list.js';
import { loadCatalog } from '../catalog/catalog-model.js';
import { addExerciseToSession, loadOpenSessionId } from './session-model.js';

/** Picks an exercise to add to the open session (ad-hoc or beyond the plan). */
export async function renderSessionAdd({ tabTitle }) {
  const sessionId = await loadOpenSessionId();
  if (!sessionId) {
    navigate(href('workout'));
    return fragment();
  }
  const { active } = await loadCatalog();
  const errors = errorArea();

  const row = (exercise) => {
    const choose = h(
      'button',
      { type: 'button', class: 'row-anchor row-button' },
      h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, exercise.name), h('span', { class: 'row-subtitle' }, exerciseSubtitle(exercise))),
    );
    choose.addEventListener('click', async () => {
      const item = await runAction(choose, errors, () => addExerciseToSession(sessionId, exercise.id));
      if (item) navigate(href('workout'));
    });
    return h('li', { class: 'row row-link' }, choose);
  };

  const { search, list } = searchableExerciseList(active, row);
  return fragment(navHeader({ title: t('session.addExercise'), backHref: href('workout'), backLabel: tabTitle }), errors.element, search, list);
}
