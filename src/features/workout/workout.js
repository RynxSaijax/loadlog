import { loadOpenSessionId } from './session-model.js';
import { renderStart } from './start.js';
import { renderSession } from './session-view.js';

/** Treino tab: the open session if there is one, otherwise the start screen. */
export async function renderWorkout(context) {
  const sessionId = await loadOpenSessionId();
  return sessionId ? renderSession({ ...context, sessionId }) : renderStart(context);
}
