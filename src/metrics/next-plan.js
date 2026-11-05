/**
 * Next suggested plan (4.9): the next active plan by sortOrder after the
 * plan of the last ended session, wrapping to the first. With no history,
 * the first active plan. Ad-hoc sessions (no plan) are ignored.
 *
 * @param {{ id: string, sortOrder: number, isArchived: boolean }[]} plans all plans, archived included
 * @param {{ planId: string|null, startedAt: number, endedAt: number|null }[]} sessions
 * @returns {string|null} plan id
 */
export function suggestNextPlan(plans, sessions) {
  const active = plans.filter((plan) => !plan.isArchived).sort((a, b) => a.sortOrder - b.sortOrder);
  if (active.length === 0) return null;

  const last = sessions
    .filter((session) => session.endedAt !== null && session.planId !== null)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!last) return active[0].id;

  const lastPlan = plans.find((plan) => plan.id === last.planId);
  if (!lastPlan) return active[0].id;
  const next = active.find((plan) => plan.sortOrder > lastPlan.sortOrder);
  return (next ?? active[0]).id;
}
