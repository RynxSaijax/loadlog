import { h } from '../../shared/dom.js';
import { t, tp } from '../../i18n/i18n.js';
import { href, navigate } from '../../router.js';
import { button, emptyRow, errorArea, flashBanner, fragment, group, linkButton, linkRow, rootHeader, runAction } from '../../shared/ui.js';
import { emptyState } from '../../shared/empty-state.js';
import { formatList, formatShortDate, formatTime, formatKg } from '../../shared/format.js';
import { getRepository } from '../../data/app-data.js';
import { suggestNextPlan } from '../../metrics/index.js';
import { recentRecords, weekStatus } from '../history/analysis.js';
import { exerciseName, loadHistory, sessionName } from '../history/history-model.js';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Início: open session or next plan, this week, recent records. */
export async function renderHome({ tabTitle }) {
  const data = await loadHistory();
  const repository = await getRepository();
  const errors = errorArea();
  const now = Date.now();

  let main;
  if (data.openSession) {
    main = h(
      'section',
      { class: 'card card-accent', 'aria-labelledby': 'home-open' },
      h('p', { class: 'card-eyebrow' }, t('home.open.eyebrow')),
      h('h2', { class: 'card-title', id: 'home-open' }, sessionName(data.openSession)),
      h('p', { class: 'card-detail numeric' }, t('home.open.since', { time: formatTime(data.openSession.startedAt) })),
      linkButton(t('home.open.continue'), href('workout'), { variant: 'primary', id: 'home-continue' }),
    );
  } else {
    const active = data.plans.filter((plan) => !plan.isArchived);
    const suggestedId = suggestNextPlan(data.plans, data.details);
    const suggested = active.find((plan) => plan.id === suggestedId);
    if (!suggested) {
      main = fragment(
        emptyState({ titleKey: 'home.empty.title', messageKey: 'home.empty.message', iconName: 'home' }),
        h('div', { class: 'actions' }, linkButton(t('plans.new'), href('plans', 'new'), { variant: 'primary' })),
      );
    } else {
      const plan = await repository.getPlan(suggested.id);
      const start = button(t('home.next.start'), {
        variant: 'primary',
        id: 'home-start',
        attributes: { 'aria-label': t('start.startPlan', { name: plan.name }) },
        onClick: async (event) => {
          const trigger = event.currentTarget;
          const session = await runAction(trigger, errors, async () => (await getRepository()).startSession({ planId: plan.id, startedAt: Date.now() }));
          if (session) navigate(href('workout'));
        },
      });
      main = h(
        'section',
        { class: 'card card-accent', 'aria-labelledby': 'home-next' },
        h('p', { class: 'card-eyebrow' }, t('home.next.eyebrow')),
        h('h2', { class: 'card-title', id: 'home-next' }, plan.name),
        h('p', { class: 'card-detail' }, plan.exercises.length ? formatList(plan.exercises.slice(0, 4).map((item) => exerciseName(data, item.exerciseId))) : tp('plans.exerciseCount', 0)),
        start,
      );
    }
  }

  const status = weekStatus(data.snapshots, now);
  const trained = new Set(status.trainedDays);
  const trainedNames = status.trainedDays.map((index) => t(`weekday.long.${WEEKDAY_KEYS[index]}`));
  const todayIndex = (new Date(now).getDay() + 6) % 7;
  const dots = h(
    'ol',
    { class: 'week-dots', 'aria-label': trainedNames.length ? t('home.week.trainedOn', { days: formatList(trainedNames) }) : t('home.week.none') },
    WEEKDAY_KEYS.map((key, index) =>
      h(
        'li',
        { class: ['week-dot', trained.has(index) ? 'week-dot-done' : null, index === todayIndex ? 'week-dot-today' : null].filter(Boolean).join(' '), 'aria-hidden': 'true' },
        h('span', { class: 'week-dot-mark' }),
        h('span', { class: 'week-dot-label' }, t(`weekday.initial.${key}`)),
      ),
    ),
  );
  const week = h(
    'section',
    { class: 'card', 'aria-labelledby': 'home-week' },
    h('h2', { class: 'card-eyebrow', id: 'home-week' }, t('home.week.title')),
    dots,
    h(
      'div',
      { class: 'stat-row' },
      h('p', { class: 'stat', id: 'home-adherence' }, h('span', { class: 'stat-value numeric' }, String(status.sessionsThisWeek)), h('span', { class: 'stat-label' }, tp('home.week.sessions', status.sessionsThisWeek))),
      h('p', { class: 'stat', id: 'home-streak' }, h('span', { class: 'stat-value numeric' }, String(status.weekStreak)), h('span', { class: 'stat-label' }, tp('home.week.streak', status.weekStreak))),
    ),
  );

  const records = recentRecords(data.snapshots, now);
  const recordRows = records.length
    ? records.map((record) =>
        linkRow({
          target: href('history', 'exercise', record.exerciseId),
          title: exerciseName(data, record.exerciseId),
          subtitle: t('home.records.line', {
            records: formatList(record.types.map((type) => t(`record.${type}`))),
            set: t('session.setValues', { load: formatKg(record.set.load), reps: record.set.reps }),
            date: formatShortDate(record.startedAt),
          }),
        }),
      )
    : [emptyRow(t('home.records.none'))];

  return fragment(
    rootHeader(tabTitle),
    flashBanner(),
    errors.element,
    main,
    data.details.length ? week : null,
    data.details.length ? group({ header: t('home.records.title'), id: 'home-records' }, recordRows) : null,
    data.details.length ? h('div', { class: 'actions' }, linkButton(t('home.history'), href('history'))) : null,
  );
}
