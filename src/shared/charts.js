/**
 * Small SVG charts with no dependencies. Every chart is an image with a
 * summary label for VoiceOver plus a "Ver dados" table with the exact values,
 * so nothing depends on seeing the drawing. Colors come from CSS classes.
 */
import { h } from './dom.js';
import { t } from '../i18n/i18n.js';

/** SVG namespace, read from the parser (keeps URLs out of the app code). */
let svgNamespace = null;
function namespace() {
  if (!svgNamespace) {
    const template = document.createElement('template');
    template.innerHTML = '<svg></svg>';
    svgNamespace = template.content.firstChild.namespaceURI;
  }
  return svgNamespace;
}

function svg(tag, attributes = {}, ...children) {
  const element = document.createElementNS(namespace(), tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== false) element.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

/** "Nice" axis bounds and 3–5 ticks covering [min, max]. */
export function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rough = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rough) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let value = start; value <= end + step / 1000; value += step) ticks.push(Math.round(value * 1000) / 1000);
  return ticks;
}

function dataTable({ caption, columns, rows }) {
  return h(
    'details',
    { class: 'chart-data' },
    h('summary', {}, t('chart.showData')),
    h(
      'table',
      { class: 'data-table numeric' },
      h('caption', { class: 'visually-hidden' }, caption),
      h('thead', {}, h('tr', {}, columns.map((column) => h('th', { scope: 'col' }, column)))),
      h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((cell, index) => (index === 0 ? h('th', { scope: 'row' }, cell) : h('td', {}, cell)))))),
    ),
  );
}

function legend(items) {
  return h(
    'ul',
    { class: 'chart-legend', 'aria-hidden': 'true' },
    items.map((item) => h('li', {}, h('span', { class: `chart-swatch ${item.className}` }), item.name)),
  );
}

/**
 * Line chart over time. `series`: [{ name, className, points: [{ x, y, flagged }] }].
 * Points with y === null are skipped. Flagged points get a hollow marker.
 */
export function lineChart({ title, summary, series, formatX, formatY, flaggedNote, width = 340, height = 190 }) {
  const margin = { top: 12, right: 12, bottom: 26, left: 44 };
  const all = series.flatMap((line) => line.points.filter((point) => point.y !== null));
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const [yMin, yMax] = [ticks[0], ticks.at(-1)];
  const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sx = (x) => margin.left + (xMax === xMin ? plotWidth / 2 : ((x - xMin) / (xMax - xMin)) * plotWidth);
  const sy = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

  const grid = ticks.map((tick) =>
    svg('g', { class: 'chart-grid' }, svg('line', { x1: margin.left, x2: width - margin.right, y1: sy(tick), y2: sy(tick) }), svg('text', { x: margin.left - 6, y: sy(tick) + 4, 'text-anchor': 'end' }, formatY(tick))),
  );
  const xLabels = xs.length
    ? [svg('text', { class: 'chart-axis', x: sx(xMin), y: height - 6, 'text-anchor': 'start' }, formatX(xMin)), xMax !== xMin ? svg('text', { class: 'chart-axis', x: sx(xMax), y: height - 6, 'text-anchor': 'end' }, formatX(xMax)) : null]
    : [];
  const lines = series.map((line) => {
    const points = line.points.filter((point) => point.y !== null);
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(' ');
    return svg(
      'g',
      { class: `chart-series ${line.className}` },
      points.length > 1 ? svg('path', { d: path, class: 'chart-line' }) : null,
      points.map((point) => svg('circle', { cx: sx(point.x).toFixed(1), cy: sy(point.y).toFixed(1), r: point.flagged ? 4 : 3, class: point.flagged ? 'chart-point chart-point-flagged' : 'chart-point' })),
    );
  });

  const xValues = [...new Set(xs)].sort((a, b) => a - b);
  const rows = xValues.map((x) => [formatX(x), ...series.map((line) => {
    const point = line.points.find((candidate) => candidate.x === x && candidate.y !== null);
    return point ? `${formatY(point.y)}${point.flagged ? ' *' : ''}` : '—';
  })]);

  return h(
    'figure',
    { class: 'chart' },
    h('figcaption', { class: 'chart-title' }, title),
    legend(series),
    (() => {
      const element = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary }, grid, xLabels, lines);
      return element;
    })(),
    flaggedNote && series.some((line) => line.points.some((point) => point.flagged)) ? h('p', { class: 'chart-note' }, flaggedNote) : null,
    dataTable({ caption: title, columns: [t('chart.date'), ...series.map((line) => line.name)], rows }),
  );
}

/**
 * Horizontal (grouped) bar chart. `categories`: [{ label, values: [n per series], marker }].
 * `series`: [{ name, className }]. Values are never encoded by color alone:
 * each bar has its number next to it.
 */
export function barChart({ title, summary, categories, series, formatValue }) {
  const max = Math.max(1e-9, ...categories.flatMap((category) => category.values.filter((value) => value !== null)));
  const width = 340;
  const labelWidth = 104;
  const valueWidth = 54;
  const barHeight = 14;
  const gap = 4;
  const groupGap = 12;
  const plot = width - labelWidth - valueWidth;
  let y = 4;
  const groups = categories.map((category) => {
    const top = y;
    const bars = category.values.map((value, index) => {
      const barY = y;
      y += barHeight + gap;
      const length = value === null ? 0 : Math.max(value > 0 ? 2 : 0, (value / max) * plot);
      return svg(
        'g',
        { class: `chart-series ${series[index].className}` },
        svg('rect', { x: labelWidth, y: barY, width: length.toFixed(1), height: barHeight, rx: 3, class: 'chart-bar' }),
        svg('text', { class: 'chart-value', x: labelWidth + length + 4, y: barY + barHeight - 3 }, value === null ? '—' : formatValue(value)),
      );
    });
    const groupHeight = y - top - gap;
    y += groupGap - gap;
    return svg(
      'g',
      {},
      svg('text', { class: 'chart-label', x: 0, y: top + groupHeight / 2 + 4 }, truncate(category.label, 15)),
      bars,
    );
  });
  const height = Math.max(y, 24);
  const rows = categories.map((category) => [category.label, ...category.values.map((value) => (value === null ? '—' : formatValue(value)))]);
  return h(
    'figure',
    { class: 'chart' },
    h('figcaption', { class: 'chart-title' }, title),
    series.length > 1 ? legend(series) : null,
    svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': summary }, groups),
    dataTable({ caption: title, columns: [t('chart.category'), ...series.map((entry) => entry.name)], rows }),
  );
}

function truncate(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
