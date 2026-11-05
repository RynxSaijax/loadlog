/**
 * Minimal PDF writer (no dependencies): A4 pages with text in the standard
 * Helvetica fonts (WinAnsi encoding, which covers Portuguese accents), lines
 * and filled rectangles. Enough for LoadLog's session and period reports.
 */

export const A4 = Object.freeze({ width: 595.28, height: 841.89 });

// Helvetica advance widths (1/1000 em) for ASCII 32–126, from the AFM.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD_FACTOR = 1.08;

/** WinAnsi code points outside Latin-1 that LoadLog text may use. */
const WIN_ANSI_EXTRA = new Map([
  ['€', 0x80], ['…', 0x85], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
]);
const REPLACEMENTS = new Map([['−', '-'], ['↑', '+'], ['↓', '-'], ['→', '='], ['✓', 'v'], ['⚠', '!'], [' ', ' ']]);

/** Byte for one character in WinAnsi, or "?" when it has none. */
function winAnsiByte(char) {
  const replaced = REPLACEMENTS.get(char) ?? char;
  const code = replaced.codePointAt(0);
  if (replaced.length === 1 && ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff))) return code;
  if (WIN_ANSI_EXTRA.has(replaced)) return WIN_ANSI_EXTRA.get(replaced);
  return 0x3f;
}

/** Text as a PDF literal string body (bytes as Latin-1 characters). */
export function encodeText(text) {
  let result = '';
  for (const char of String(text)) {
    const byte = winAnsiByte(char);
    const value = String.fromCharCode(byte);
    result += value === '(' || value === ')' || value === '\\' ? `\\${value}` : value;
  }
  return result;
}

function charWidth(char) {
  const base = (REPLACEMENTS.get(char) ?? char).normalize('NFD')[0];
  const code = base.codePointAt(0);
  if (code >= 32 && code <= 126) return WIDTHS[code - 32];
  if (char === '—' || char === '…') return 1000;
  if (char === '–' || char === '•') return 556;
  return 556;
}

/** Width of `text` in points at `size`. */
export function textWidth(text, size, { bold = false } = {}) {
  let total = 0;
  for (const char of String(text)) total += charWidth(char);
  return (total * size * (bold ? BOLD_FACTOR : 1)) / 1000;
}

/** Splits `text` into lines no wider than `maxWidth`. */
export function wrapText(text, size, maxWidth, options) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, options) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const number = (value) => (Math.round(value * 100) / 100).toString();

export class PdfDocument {
  constructor({ title = '', author = '' } = {}) {
    this.title = title;
    this.author = author;
    this.pages = [];
    this.addPage();
  }

  addPage() {
    this.current = [];
    this.pages.push(this.current);
    return this;
  }

  /** Text with its baseline at (x, y) from the bottom-left corner. */
  text(x, y, value, { size = 10, bold = false, gray = 0, align = 'left' } = {}) {
    let left = x;
    if (align === 'right') left = x - textWidth(value, size, { bold });
    else if (align === 'center') left = x - textWidth(value, size, { bold }) / 2;
    this.current.push(`BT ${number(gray)} g /${bold ? 'F2' : 'F1'} ${number(size)} Tf 1 0 0 1 ${number(left)} ${number(y)} Tm (${encodeText(value)}) Tj ET`);
    return this;
  }

  line(x1, y1, x2, y2, { gray = 0.8, width = 0.5 } = {}) {
    this.current.push(`${number(gray)} G ${number(width)} w ${number(x1)} ${number(y1)} m ${number(x2)} ${number(y2)} l S`);
    return this;
  }

  rect(x, y, width, height, { gray = 0.9 } = {}) {
    this.current.push(`${number(gray)} g ${number(x)} ${number(y)} ${number(width)} ${number(height)} re f`);
    return this;
  }

  /** The finished file. */
  toBytes() {
    const objects = [];
    const add = (body) => {
      objects.push(body);
      return objects.length;
    };
    const catalog = add(null);
    const pages = add(null);
    const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pageIds = this.pages.map((commands) => {
      const content = commands.join('\n');
      const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      return add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`);
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
    objects[pages - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    const info = add(`<< /Title (${encodeText(this.title)}) /Author (${encodeText(this.author)}) /Producer (LoadLog) >>`);

    let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets = [];
    objects.forEach((body, index) => {
      offsets.push(output.length);
      output += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = output.length;
    output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
    output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(output.length);
    for (let index = 0; index < output.length; index += 1) bytes[index] = output.charCodeAt(index) & 0xff;
    return bytes;
  }
}
