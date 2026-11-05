import { t, tp } from '../../i18n/i18n.js';
import { A4, PdfDocument, wrapText } from '../../services/pdf.js';
import { formatDateTime, formatHoursMinutes, formatKg, formatNumber } from '../../shared/format.js';
import { SetType } from '../../data/enums.js';

const MARGIN = 48;
const NAME_WIDTH = 170;
const BOTTOM = 60;

function setsText(sets) {
  return sets
    .map((set) => {
      const values = t('pdf.setValues', { load: formatNumber(set.load), reps: set.reps });
      const rir = set.rir === null || set.rir === undefined ? '' : ` ${t('session.rirValue', { rir: set.rir })}`;
      return set.type === SetType.normal ? `${values}${rir}` : `${t(`pdf.type.${set.type}`)} ${values}${rir}`;
    })
    .join('  ·  ');
}

/**
 * PDF of one or more sessions (a session, or a period of the history).
 * @param {{ title: string, subtitle: string, sessions: { detail: object, name: string, totals: object }[], summary?: object }} report
 * @returns {Uint8Array}
 */
export function buildSessionsPdf({ title, subtitle, sessions, summary = null, now = Date.now() }) {
  const doc = new PdfDocument({ title, author: t('app.name') });
  const right = A4.width - MARGIN;
  let y = A4.height - MARGIN;

  const header = () => {
    doc.text(MARGIN, y, t('app.name'), { size: 9, bold: true, gray: 0.45 });
    doc.text(right, y, t('pdf.generatedAt', { date: formatDateTime(now) }), { size: 8, gray: 0.45, align: 'right' });
    y -= 26;
  };
  const ensure = (height) => {
    if (y - height < BOTTOM) {
      doc.addPage();
      y = A4.height - MARGIN;
      header();
    }
  };

  header();
  doc.text(MARGIN, y, title, { size: 18, bold: true });
  y -= 18;
  if (subtitle) {
    doc.text(MARGIN, y, subtitle, { size: 10, gray: 0.35 });
    y -= 16;
  }
  if (summary) {
    y -= 4;
    doc.rect(MARGIN, y - 30, right - MARGIN, 38, { gray: 0.94 });
    const columns = [
      [t('pdf.summary.sessions'), String(summary.sessions)],
      [t('summary.effectiveSets'), String(summary.effectiveSets)],
      [t('summary.tonnage'), formatKg(summary.tonnage)],
      [t('summary.duration'), formatHoursMinutes(summary.durationMs)],
    ];
    const width = (right - MARGIN) / columns.length;
    columns.forEach(([label, value], index) => {
      const x = MARGIN + 10 + index * width;
      doc.text(x, y - 6, label, { size: 8, gray: 0.4 });
      doc.text(x, y - 22, value, { size: 12, bold: true });
    });
    y -= 50;
  }
  y -= 6;

  if (sessions.length === 0) {
    doc.text(MARGIN, y, t('pdf.empty'), { size: 11, gray: 0.35 });
  }

  for (const { detail, name, totals } of sessions) {
    ensure(60);
    doc.line(MARGIN, y + 8, right, y + 8, { gray: 0.75, width: 0.8 });
    y -= 8;
    doc.text(MARGIN, y, name, { size: 12, bold: true });
    doc.text(right, y, formatDateTime(detail.startedAt), { size: 10, gray: 0.35, align: 'right' });
    y -= 14;
    doc.text(MARGIN, y, t('pdf.sessionLine', {
      duration: totals.durationMs === null ? t('summary.inProgress') : formatHoursMinutes(totals.durationMs),
      sets: tp('history.sets', totals.effectiveSets),
      tonnage: formatKg(totals.tonnage),
    }), { size: 9, gray: 0.35 });
    y -= 16;

    for (const item of detail.exercises) {
      const nameLines = wrapText(item.exerciseNameSnapshot, 10, NAME_WIDTH - 10, { bold: true });
      const setLines = item.sets.length ? wrapText(setsText(item.sets), 9.5, right - MARGIN - NAME_WIDTH) : [t('session.noSets')];
      const height = Math.max(nameLines.length, setLines.length) * 13 + 4;
      ensure(height);
      nameLines.forEach((line, index) => doc.text(MARGIN, y - index * 13, line, { size: 10, bold: true }));
      setLines.forEach((line, index) => doc.text(MARGIN + NAME_WIDTH, y - index * 13, line, { size: 9.5, gray: item.sets.length ? 0 : 0.45 }));
      y -= height;
    }
    y -= 10;
  }

  const total = doc.pages.length;
  doc.pages.forEach((page, index) => {
    doc.current = page;
    doc.text(A4.width / 2, 32, t('pdf.page', { page: index + 1, total }), { size: 8, gray: 0.5, align: 'center' });
  });
  return doc.toBytes();
}

/** "loadlog-treino-2026-11-04.pdf" / "loadlog-periodo-2026-10-01-a-2026-10-31.pdf" */
export function pdfFileName(kind, from, to = null) {
  const day = (timestamp) => {
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  return to === null ? `loadlog-${kind}-${day(from)}.pdf` : `loadlog-${kind}-${day(from)}-a-${day(to)}.pdf`;
}

