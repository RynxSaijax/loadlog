import { t } from '../../i18n/i18n.js';
import { getRepository } from '../../data/app-data.js';
import { backupFileName, makeBackup } from '../../data/backup.js';
import { APP_VERSION } from '../../version.js';
import { shareFile } from '../../services/share.js';
import { formatShortDate } from '../../shared/format.js';
import { bestSet, countEffectiveSets } from '../../metrics/index.js';
import { sessionSummary, setsOf } from '../workout/session-logic.js';
import { sessionTotals } from '../history/analysis.js';
import { exerciseName, loadHistory, sessionName } from '../history/history-model.js';
import { csvFileName, sessionsToCsv } from './csv.js';
import { buildSessionsPdf, pdfFileName } from './pdf-report.js';
import { renderSessionCard } from './image-card.js';

const DAY_MS = 86_400_000;

function reportEntry(data, detail) {
  return { detail, name: sessionName(detail), totals: sessionTotals(data.snapshotsById.get(detail.id)) };
}

/** PNG card of one ended session. */
export async function exportSessionImage(sessionId) {
  const data = await loadHistory();
  const detail = data.detailsById.get(sessionId);
  const snapshot = data.snapshotsById.get(sessionId);
  const others = data.snapshots.filter((candidate) => candidate.sessionId !== sessionId);
  const exerciseIds = [...new Set(snapshot.exercises.map((exercise) => exercise.exerciseId))];
  const records = sessionSummary(snapshot, others).records;
  const blob = await renderSessionCard({
    name: sessionName(detail),
    startedAt: detail.startedAt,
    totals: sessionTotals(snapshot),
    exercises: exerciseIds.map((exerciseId) => {
      const sets = setsOf(snapshot, exerciseId);
      return { name: exerciseName(data, exerciseId), best: bestSet(sets), sets: countEffectiveSets(sets) };
    }),
    records: [...new Set(records.map((record) => record.exerciseId))].map((exerciseId) => ({ name: exerciseName(data, exerciseId) })),
  });
  return shareFile(blob, pdfFileName('treino', detail.startedAt).replace(/\.pdf$/, '.png'), { title: sessionName(detail) });
}

/** PDF of one ended session. */
export async function exportSessionPdf(sessionId) {
  const data = await loadHistory();
  const detail = data.detailsById.get(sessionId);
  const entry = reportEntry(data, detail);
  const bytes = buildSessionsPdf({ title: entry.name, subtitle: t('pdf.sessionSubtitle', { date: formatShortDate(detail.startedAt) }), sessions: [entry] });
  return shareFile(new Blob([bytes], { type: 'application/pdf' }), pdfFileName('treino', detail.startedAt), { title: entry.name });
}

/**
 * Sessions started between the start of `fromDay` and the end of `toDay`
 * (local days), oldest first.
 */
export function sessionsInPeriod(details, fromDay, toDay) {
  const from = new Date(fromDay);
  const to = new Date(toDay);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() + DAY_MS;
  return details.filter((detail) => detail.startedAt >= start && detail.startedAt < end).sort((a, b) => a.startedAt - b.startedAt);
}

/** PDF of every ended session in a period, with totals. */
export async function exportPeriodPdf(fromDay, toDay) {
  const data = await loadHistory();
  const entries = sessionsInPeriod(data.details, fromDay, toDay).map((detail) => reportEntry(data, detail));
  const summary = entries.reduce(
    (sum, entry) => ({
      sessions: sum.sessions + 1,
      effectiveSets: sum.effectiveSets + entry.totals.effectiveSets,
      tonnage: sum.tonnage + entry.totals.tonnage,
      durationMs: sum.durationMs + (entry.totals.durationMs ?? 0),
    }),
    { sessions: 0, effectiveSets: 0, tonnage: 0, durationMs: 0 },
  );
  const title = t('pdf.periodTitle');
  const bytes = buildSessionsPdf({ title, subtitle: t('pdf.periodSubtitle', { from: formatShortDate(fromDay), to: formatShortDate(toDay) }), sessions: entries, summary });
  return { result: await shareFile(new Blob([bytes], { type: 'application/pdf' }), pdfFileName('periodo', fromDay, toDay), { title }), count: entries.length };
}

/** CSV with one row per set of every session. */
export async function exportCsv() {
  const details = await (await getRepository()).listSessionDetails();
  const text = sessionsToCsv(details, { planNameFallback: t('session.adHocName') });
  return shareFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), csvFileName(), { title: t('export.csv.title') });
}

/** Full JSON backup. */
export async function exportBackup() {
  const dump = await (await getRepository()).exportAll();
  const backup = makeBackup(dump, { appVersion: APP_VERSION });
  const text = JSON.stringify(backup);
  return shareFile(new Blob([text], { type: 'application/json' }), backupFileName(), { title: t('export.backup.title') });
}
