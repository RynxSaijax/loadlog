import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { button, flashBanner, fragment, navHeader, selectField } from '../../shared/ui.js';
import { setFlash } from '../../shared/flash.js';
import { formatNumber } from '../../shared/format.js';
import { navigate } from '../../router.js';
import { defaultIncrement, Equipment, labelKey } from '../../data/enums.js';
import { INCREMENT_CHOICES, loadSettings, updateSettings } from '../../data/settings.js';

/** Default load increment per equipment (5.6). An exercise's own increment still wins. */
export async function renderIncrements() {
  const settings = await loadSettings();
  const rows = Object.values(Equipment).map((equipment) => {
    const choices = [...new Set([...INCREMENT_CHOICES, settings.increments[equipment]])].sort((a, b) => a - b);
    const field = selectField({
      label: t(labelKey('equipment', equipment)),
      value: String(settings.increments[equipment]),
      name: `increment-${equipment}`,
      options: choices.map((value) => ({
        value: String(value),
        label: value === defaultIncrement[equipment] ? t('increments.optionDefault', { value: formatNumber(value) }) : t('units.kg', { value: formatNumber(value) }),
      })),
    });
    field.select.addEventListener('change', async () => {
      const current = await loadSettings();
      await updateSettings({ increments: { ...current.increments, [equipment]: Number(field.select.value) } });
    });
    return h('div', { class: 'increment-field' }, field.element, h('p', { class: 'field-hint' }, t(`loadHint.${equipment}`)));
  });
  const reset = button(t('increments.reset'), {
    id: 'increments-reset',
    onClick: async () => {
      await updateSettings({ increments: { ...defaultIncrement } });
      setFlash(t('increments.resetDone'));
      navigate(href('settings', 'increments'));
    },
  });
  return fragment(
    navHeader({ title: t('increments.title'), backHref: href('settings'), backLabel: t('tab.settings') }),
    flashBanner(),
    h('p', { class: 'session-meta' }, t('increments.intro')),
    h('div', { class: 'form' }, rows),
    h('div', { class: 'actions' }, reset),
  );
}
