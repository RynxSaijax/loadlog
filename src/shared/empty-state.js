import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from '../i18n/i18n.js';

/** Full-screen empty state used by tab roots that have no content yet. */
export function emptyState({ titleKey, messageKey, iconName }) {
  return h(
    'section',
    { class: 'empty-state' },
    icon(iconName, 'empty-state-icon'),
    h('h2', { class: 'empty-state-title' }, t(titleKey)),
    h('p', { class: 'empty-state-message' }, t(messageKey)),
  );
}
