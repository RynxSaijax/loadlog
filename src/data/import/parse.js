import { parseCsv } from './csv.js';

/** Largest import file accepted, in bytes. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export class ImportParseError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'ImportParseError';
    this.reason = reason;
  }
}

function findArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      if (Array.isArray(child) && child.some((item) => item && typeof item === 'object' && !Array.isArray(item))) return child;
    }
  }
  return null;
}

function parseJsonRecords(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportParseError('invalidJson');
  }
  const array = findArray(data);
  if (!array) throw new ImportParseError('noRecords');
  return array.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

function parseCsvRecords(text) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch {
    throw new ImportParseError('invalidCsv');
  }
  if (rows.length < 2) throw new ImportParseError('noRecords');
  const header = rows[0].map((name) => name.trim());
  if (header.some((name) => name === '') || new Set(header).size !== header.length) {
    throw new ImportParseError('invalidHeader');
  }
  return rows.slice(1).map((cells) => Object.fromEntries(header.map((name, column) => [name, cells[column] ?? ''])));
}

/**
 * Reads a user-provided file's text into flat records.
 * @param {string} text
 * @param {string} fileName used to choose JSON or CSV
 * @returns {{ format: 'json'|'csv', fields: string[], records: object[] }}
 */
export function parseImportFile(text, fileName = '') {
  if (typeof text !== 'string' || text.trim() === '') throw new ImportParseError('empty');
  const looksJson = /\.json$/i.test(fileName) || /^\s*[[{]/.test(text);
  const format = looksJson ? 'json' : 'csv';
  const records = format === 'json' ? parseJsonRecords(text) : parseCsvRecords(text);
  if (records.length === 0) throw new ImportParseError('noRecords');
  if (records.length > MAX_IMPORT_ROWS) throw new ImportParseError('tooManyRecords');
  const fields = [];
  for (const record of records) {
    for (const key of Object.keys(record)) if (!fields.includes(key)) fields.push(key);
  }
  return { format, fields, records };
}
