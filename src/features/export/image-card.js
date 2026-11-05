/**
 * Shareable image card of a session (replaces ImageRenderer): drawn on a
 * canvas and exported as PNG. Fixed dark palette so the card looks the same
 * whatever the phone's appearance setting.
 */
import { t, tp } from '../../i18n/i18n.js';
import { formatHoursMinutes, formatKg, formatList, formatLongDate } from '../../shared/format.js';

export const CARD_SIZE = Object.freeze({ width: 1080, height: 1350 });
const COLORS = { background: '#0e0f11', surface: '#17191c', text: '#f2f4f6', secondary: '#9ba3ad', accent: '#b8f24a', onAccent: '#0e0f11' };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, "Segoe UI", Roboto, sans-serif';
const MAX_EXERCISES = 7;
const PAD = 80;

function fit(context, text, maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

/**
 * @param {{ name: string, startedAt: number, totals: object, exercises: { name: string, best: object|null, sets: number }[], records: { name: string, types: string[] }[] }} card
 * @returns {Promise<Blob>} PNG
 */
export function renderSessionCard(card) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE.width;
  canvas.height = CARD_SIZE.height;
  const context = canvas.getContext('2d');
  const width = CARD_SIZE.width - PAD * 2;

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, CARD_SIZE.width, CARD_SIZE.height);
  context.fillStyle = COLORS.accent;
  context.fillRect(0, 0, CARD_SIZE.width, 14);

  context.textBaseline = 'alphabetic';
  context.fillStyle = COLORS.accent;
  context.font = `700 34px ${FONT}`;
  context.fillText(t('app.name'), PAD, 110);

  context.fillStyle = COLORS.text;
  context.font = `800 76px ${FONT}`;
  context.fillText(fit(context, card.name, width), PAD, 215);
  context.fillStyle = COLORS.secondary;
  context.font = `400 38px ${FONT}`;
  context.fillText(fit(context, formatLongDate(card.startedAt), width), PAD, 272);

  // Stats row.
  const stats = [
    [t('summary.duration'), formatHoursMinutes(card.totals.durationMs ?? 0)],
    [t('summary.tonnage'), formatKg(Math.round(card.totals.tonnage))],
    [t('summary.effectiveSets'), String(card.totals.effectiveSets)],
  ];
  const statWidth = (width - 40) / 3;
  stats.forEach(([label, value], index) => {
    const x = PAD + index * (statWidth + 20);
    context.fillStyle = COLORS.surface;
    roundRect(context, x, 320, statWidth, 170, 28);
    context.fill();
    context.fillStyle = COLORS.text;
    context.font = `700 56px ${FONT}`;
    context.fillText(fit(context, value, statWidth - 48), x + 28, 410);
    context.fillStyle = COLORS.secondary;
    context.font = `500 28px ${FONT}`;
    context.fillText(fit(context, label, statWidth - 48), x + 28, 458);
  });

  // Exercises with their best set.
  let y = 580;
  const shown = card.exercises.slice(0, MAX_EXERCISES);
  for (const exercise of shown) {
    context.fillStyle = COLORS.text;
    context.font = `600 38px ${FONT}`;
    const value = exercise.best ? t('session.setValues', { load: formatKg(exercise.best.load), reps: exercise.best.reps }) : '—';
    context.font = `700 38px ${FONT}`;
    const valueWidth = context.measureText(value).width;
    context.fillStyle = COLORS.accent;
    context.fillText(value, PAD + width - valueWidth, y);
    context.font = `500 38px ${FONT}`;
    context.fillStyle = COLORS.text;
    context.fillText(fit(context, exercise.name, width - valueWidth - 40), PAD, y);
    context.fillStyle = COLORS.secondary;
    context.font = `400 28px ${FONT}`;
    context.fillText(tp('history.sets', exercise.sets), PAD, y + 40);
    y += 98;
  }
  if (card.exercises.length > shown.length) {
    context.fillStyle = COLORS.secondary;
    context.font = `400 30px ${FONT}`;
    context.fillText(t('card.moreExercises', { count: card.exercises.length - shown.length }), PAD, y);
  }

  // Records banner.
  if (card.records.length) {
    const text = t('card.records', { records: formatList(card.records.map((record) => record.name)) });
    context.fillStyle = COLORS.accent;
    roundRect(context, PAD, CARD_SIZE.height - 200, width, 110, 28);
    context.fill();
    context.fillStyle = COLORS.onAccent;
    context.font = `700 36px ${FONT}`;
    context.fillText(fit(context, text, width - 60), PAD + 30, CARD_SIZE.height - 132);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png');
  });
}
