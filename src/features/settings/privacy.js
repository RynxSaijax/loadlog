import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href } from '../../router.js';
import { fragment, navHeader } from '../../shared/ui.js';

/** Sections of the privacy policy, in order. PRIVACY_POLICY.md is generated from the same strings. */
export const PRIVACY_SECTIONS = Object.freeze(['about', 'data', 'notDone', 'hosting', 'sharing', 'transfer', 'rights', 'security', 'contact', 'changes']);

export function renderPrivacy() {
  return fragment(
    navHeader({ title: t('privacy.title'), backHref: href('settings'), backLabel: t('tab.settings') }),
    h('p', { class: 'session-meta' }, t('privacy.effective')),
    h(
      'article',
      { class: 'policy' },
      PRIVACY_SECTIONS.map((key) => h('section', {}, h('h2', { class: 'policy-heading' }, t(`privacy.${key}.title`)), h('p', { class: 'policy-body' }, t(`privacy.${key}.body`)))),
    ),
  );
}
