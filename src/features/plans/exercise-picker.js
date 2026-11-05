import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { errorArea, fragment, linkButton, navHeader, runAction } from '../../shared/ui.js';
import { exerciseSubtitle, searchableExerciseList } from '../../shared/exercise-list.js';
import { getRepository } from '../../data/app-data.js';
import { loadCatalog } from '../catalog/catalog-model.js';
import { addExerciseWithDefaults } from './plans-model.js';

export async function renderExercisePicker({ params }) {
  const repository = await getRepository();
  const plan = await repository.getPlan(params.planId);
  const { active } = await loadCatalog();
  const errors = errorArea();

  const row = (exercise) => {
    const choose = h(
      'button',
      { type: 'button', class: 'row-anchor row-button' },
      h('span', { class: 'row-text' }, h('span', { class: 'row-title' }, exercise.name), h('span', { class: 'row-subtitle' }, exerciseSubtitle(exercise))),
    );
    choose.addEventListener('click', async () => {
      const item = await runAction(choose, errors, () => addExerciseWithDefaults(plan.id, exercise.id));
      if (item) navigate(href('plans', plan.id, 'items', item.id));
    });
    return h('li', { class: 'row row-link' }, choose);
  };

  const { search, list } = searchableExerciseList(active, row);
  return fragment(
    navHeader({ title: t('plans.addExercise'), backHref: href('plans', plan.id), backLabel: plan.name }),
    errors.element,
    search,
    h('div', { class: 'actions' }, linkButton(t('catalog.new'), `${href('catalog', 'new')}?plan=${encodeURIComponent(plan.id)}`)),
    list,
  );
}
