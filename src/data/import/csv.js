/**
 * RFC 4180 CSV parser with quoted fields, escaped quotes ("") and CRLF.
 * The delimiter is detected from the header line (comma or semicolon,
 * the latter being common in spreadsheets exported in pt-BR).
 */
export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  return semicolons > commas ? ';' : ',';
}

/** @returns {string[][]} rows of cells; blank lines are skipped */
export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  const source = text.replace(/^﻿/, '');

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.length > 1 || row[0].trim() !== '') rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
    } else {
      cell += char;
    }
    index += 1;
  }
  if (quoted) throw new Error('unterminated quoted field');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
