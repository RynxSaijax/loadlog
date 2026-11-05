import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { setFlash } from '../../shared/flash.js';
import { button, errorArea, fragment, linkButton, navHeader, runAction } from '../../shared/ui.js';
import { getRepository } from '../../data/app-data.js';
import { clearImport, importState } from './import-state.js';

const PREVIEW_COUNT = 5;

export function renderImportConfirm() {
  const state = importState();
  const selected = state?.review?.filter((entry) => entry.selected) ?? [];
  if (selected.length === 0) {
    navigate(href('catalog', 'import', state?.review ? 'review' : ''));
    return fragment();
  }
  const errors = errorArea();
  const names = selected.slice(0, PREVIEW_COUNT).map((entry) => h('li', {}, entry.item.name));
  const more = selected.length - PREVIEW_COUNT;

  const confirm = button(tp('import.confirmButton', selected.length), { variant: 'primary', id: 'import-confirm' });
  confirm.addEventListener('click', async () => {
    const result = await runAction(confirm, errors, async () => (await getRepository()).importExercises(selected.map((entry) => entry.item)));
    if (!result) return;
    clearImport();
    setFlash(
      result.skipped
        ? t('import.doneWithSkipped', { inserted: result.inserted, skipped: result.skipped })
        : tp('import.done', result.inserted),
    );
    navigate(href('catalog'));
  });

  return fragment(
    navHeader({ title: t('import.confirmTitle'), backHref: href('catalog', 'import', 'review'), backLabel: t('common.back') }),
    h('p', { class: 'step' }, t('import.step', { step: 3, total: 3 })),
    h('div', { class: 'prose' }, h('p', {}, tp('import.confirmMessage', selected.length, { file: state.fileName }))),
    h('ul', { class: 'preview-list' }, names, more > 0 ? h('li', {}, tp('import.andMore', more)) : null),
    h('p', { class: 'field-hint' }, t('import.confirmNote')),
    errors.element,
    h('div', { class: 'actions' }, confirm, linkButton(t('common.cancel'), href('catalog'))),
  );
}
