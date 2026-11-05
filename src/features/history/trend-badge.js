import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';

const SYMBOL = { up: '↑', flat: '→', down: '↓' };

/**
 * Direction shown with an arrow, a word for screen readers and a color
 * class: never by color alone.
 */
export function trendBadge(direction, text) {
  return h(
    'span',
    { class: `trend trend-${direction}` },
    h('span', { class: 'trend-symbol', 'aria-hidden': 'true' }, SYMBOL[direction]),
    h('span', { class: 'visually-hidden' }, `${t(`trend.${direction}`)} `),
    text,
  );
}
