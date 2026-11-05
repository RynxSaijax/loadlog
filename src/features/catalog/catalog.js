import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { flashBanner, fragment, group, linkButton, linkRow, navHeader } from '../../shared/ui.js';
import { exerciseSubtitle, searchableExerciseList } from '../../shared/exercise-list.js';
import { loadCatalog } from './catalog-model.js';

export async function renderCatalog({ tabTitle }) {
  const { active, archived } = await loadCatalog();
  const row = (exercise) => linkRow({ target: href('catalog', exercise.id), title: exercise.name, subtitle: exerciseSubtitle(exercise) });
  const { search, list } = searchableExerciseList(active, row);
  return fragment(
    navHeader({ title: t('catalog.title'), backHref: href('plans'), backLabel: tabTitle }),
    flashBanner(),
    h(
      'div',
      { class: 'actions' },
      linkButton(t('catalog.new'), href('catalog', 'new'), { variant: 'primary', id: 'new-exercise' }),
      linkButton(t('catalog.import'), href('catalog', 'import'), { id: 'import-exercises' }),
    ),
    h('p', { class: 'screen-subtitle numeric' }, tp('catalog.count', active.length)),
    search,
    list,
    archived.length
      ? h('details', { class: 'disclosure' }, h('summary', {}, tp('catalog.archivedCount', archived.length)), group({}, ...archived.map(row)))
      : null,
  );
}
