import { h } from '../../shared/dom.js';
import { t } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, confirmDialog, errorArea, fragment, infoRow, navHeader, runAction } from '../../shared/ui.js';
import { setFlash } from '../../shared/flash.js';
import { formatDateTime, formatNumber } from '../../shared/format.js';
import { toast } from '../../services/feedback.js';
import { readFileText } from '../../services/share.js';
import { stopRestTimer } from '../../services/rest-timer.js';
import { setHapticsEnabled } from '../../services/feedback.js';
import { getRepository } from '../../data/app-data.js';
import { backupCounts, MAX_BACKUP_BYTES, parseBackup } from '../../data/backup.js';
import { DomainError, ErrorCode } from '../../data/errors.js';
import { loadSettings } from '../../data/settings.js';
import { exportBackup } from '../export/export-actions.js';
import { uiState } from '../workout/session-model.js';

function backupError(error) {
  if (error instanceof DomainError && error.code === ErrorCode.invalidBackup) return t(`backup.error.${error.details.reason}`);
  return error;
}

/** Backup (export JSON) and restore with preview and explicit confirmation. */
export async function renderBackup() {
  const repository = await getRepository();
  const current = await repository.exportAll();
  const currentCounts = backupCounts(current);
  const errors = errorArea();
  const preview = h('div', { id: 'restore-preview' });

  const save = button(t('backup.export'), {
    variant: 'primary',
    id: 'backup-export',
    onClick: async (event) => {
      const result = await runAction(event.currentTarget, errors, () => exportBackup());
      if (result === 'shared') toast(t('export.shared'));
      if (result === 'downloaded') toast(t('export.downloaded'));
    },
  });

  const input = h('input', { id: 'restore-file', type: 'file', accept: '.json,application/json', class: 'visually-hidden' });
  const pick = h('label', { for: 'restore-file', class: 'button button-secondary', id: 'restore-pick' }, t('backup.pick'));
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    preview.replaceChildren();
    errors.clear();
    if (!file) return;
    let parsed;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new DomainError(ErrorCode.invalidBackup, 'too large', { reason: 'tooLarge' });
      parsed = parseBackup(await readFileText(file));
    } catch (error) {
      errors.show(backupError(error));
      return;
    }
    const counts = parsed.counts;
    const replace = button(t('backup.replace'), {
      variant: 'destructive',
      id: 'restore-confirm',
      onClick: async (event) => {
        const trigger = event.currentTarget;
        const confirmed = await confirmDialog({
          title: t('backup.confirmTitle'),
          message: t('backup.confirmMessage', { sessions: formatNumber(currentCounts.sessions), sets: formatNumber(currentCounts.sets) }),
          confirmLabel: t('backup.replace'),
          destructive: true,
        });
        if (!confirmed) return;
        const done = await runAction(trigger, errors, async () => {
          await repository.replaceAll(parsed.data);
          await repository.seedCatalog();
          return true;
        });
        if (!done) return;
        await stopRestTimer();
        uiState(null);
        setHapticsEnabled((await loadSettings()).haptics);
        setFlash(t('backup.restored'));
        navigate(href('home'));
      },
    });
    preview.replaceChildren(
      h(
        'section',
        { class: 'group', 'aria-labelledby': 'restore-preview-title' },
        h('h2', { class: 'group-header', id: 'restore-preview-title' }, t('backup.previewTitle', { name: file.name })),
        h(
          'ul',
          { class: 'group-list', id: 'restore-counts' },
          parsed.exportedAt ? infoRow(t('backup.exportedAt'), formatDateTime(Date.parse(parsed.exportedAt))) : null,
          infoRow(t('backup.count.exercises'), t('backup.countChange', { now: formatNumber(currentCounts.exercises), next: formatNumber(counts.exercises) })),
          infoRow(t('backup.count.plans'), t('backup.countChange', { now: formatNumber(currentCounts.plans), next: formatNumber(counts.plans) })),
          infoRow(t('backup.count.sessions'), t('backup.countChange', { now: formatNumber(currentCounts.sessions), next: formatNumber(counts.sessions) })),
          infoRow(t('backup.count.sets'), t('backup.countChange', { now: formatNumber(currentCounts.sets), next: formatNumber(counts.sets) })),
        ),
        h('p', { class: 'group-footer' }, t('backup.previewFooter')),
      ),
      h('div', { class: 'actions' }, replace),
    );
    preview.querySelector('h2')?.focus?.();
  });

  return fragment(
    navHeader({ title: t('backup.title'), backHref: href('settings'), backLabel: t('tab.settings') }),
    errors.element,
    h(
      'section',
      { class: 'group', 'aria-labelledby': 'backup-export-title' },
      h('h2', { class: 'group-header', id: 'backup-export-title' }, t('backup.exportTitle')),
      h('div', { class: 'card' }, h('p', { class: 'card-detail' }, t('backup.exportDescription', { sessions: formatNumber(currentCounts.sessions), sets: formatNumber(currentCounts.sets) })), save),
    ),
    h(
      'section',
      { class: 'group', 'aria-labelledby': 'backup-restore-title' },
      h('h2', { class: 'group-header', id: 'backup-restore-title' }, t('backup.restoreTitle')),
      h('div', { class: 'card' }, h('p', { class: 'card-detail' }, t('backup.restoreDescription')), input, pick),
    ),
    preview,
  );
}
