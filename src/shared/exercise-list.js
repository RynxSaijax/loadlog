import { h } from './dom.js';
import { t } from '../i18n/i18n.js';
import { labelKey, ExerciseSource } from '../data/enums.js';
import { group, emptyRow, searchField } from './ui.js';
import { filterExercises, groupByMuscle } from '../features/catalog/catalog-model.js';

export function exerciseSubtitle(exercise) {
  const equipment = t(labelKey('equipment', exercise.equipment));
  return exercise.source === ExerciseSource.builtin
    ? equipment
    : t('common.pair', { first: equipment, second: t(labelKey('source', exercise.source)) });
}

/**
 * Searchable list of exercises grouped by muscle. `row(exercise)` builds
 * each list item. Returns the search field and the list container.
 */
export function searchableExerciseList(exercises, row) {
  const list = h('div', { class: 'exercise-list' });
  const draw = (query) => {
    const sections = groupByMuscle(filterExercises(exercises, query));
    list.replaceChildren(
      ...(sections.length
        ? sections.map((section) => group({ header: t(labelKey('muscle', section.muscle)) }, ...section.exercises.map(row)))
        : [group({}, emptyRow(t('catalog.noResults')))]),
    );
  };
  const search = searchField({ label: t('catalog.search'), onInput: draw });
  search.input.placeholder = t('catalog.search');
  draw('');
  return { search: search.element, list };
}
