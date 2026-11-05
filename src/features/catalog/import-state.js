/**
 * In-memory state of the import wizard. Nothing is stored until the user
 * confirms in the last step; reloading the app discards the wizard.
 */
let state = null;

export function startImport({ fileName, parsed }) {
  state = { fileName, parsed, mapping: null, review: null };
  return state;
}

export function importState() {
  return state;
}

export function clearImport() {
  state = null;
}
