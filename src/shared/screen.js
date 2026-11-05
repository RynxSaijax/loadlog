import { h } from './dom.js';

/** Standard screen layout: large title followed by content. */
export function screen(title, ...content) {
  const fragment = document.createDocumentFragment();
  fragment.append(h('h1', { class: 'screen-title' }, title), ...content.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return fragment;
}
