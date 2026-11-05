import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { errorArea, fragment, navHeader } from '../../shared/ui.js';
import { ImportParseError, MAX_IMPORT_BYTES, parseImportFile } from '../../data/import/parse.js';
import { suggestMapping } from '../../data/import/mapping.js';
import { startImport } from './import-state.js';

let fieldId = 0;

export function renderImportFile() {
  const errors = errorArea();
  const id = `import-file-${++fieldId}`;
  const input = h('input', { id, type: 'file', accept: '.json,.csv,application/json,text/csv,text/plain', class: 'visually-hidden' });
  const label = h('label', { for: id, class: 'button button-primary' }, t('import.chooseFile'));

  input.addEventListener('change', async () => {
    errors.clear();
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      errors.show(t('import.error.tooLarge'));
      return;
    }
    try {
      const parsed = parseImportFile(await file.text(), file.name);
      const state = startImport({ fileName: file.name, parsed });
      state.mapping = suggestMapping(parsed.fields);
      navigate(href('catalog', 'import', 'map'));
    } catch (error) {
      const reason = error instanceof ImportParseError ? error.reason : 'unreadable';
      errors.show(t(`import.error.${reason}`));
    }
  });

  return fragment(
    navHeader({ title: t('import.title'), backHref: href('catalog'), backLabel: t('catalog.title') }),
    h('div', { class: 'prose' }, h('p', {}, t('import.intro')), h('p', {}, t('import.formats')), h('p', { class: 'field-hint' }, t('import.privacy'))),
    errors.element,
    h('div', { class: 'actions' }, input, label),
  );
}
