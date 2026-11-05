// Generates PRIVACY_POLICY.md from the same pt-BR strings shown in
// Ajustes › Política de privacidade, so the two never drift apart.
// Usage: node tools/privacy-policy.js  (tests check the file is current)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ptBR } from '../src/i18n/pt-BR.js';

export const SECTIONS = ['about', 'data', 'notDone', 'hosting', 'sharing', 'transfer', 'rights', 'security', 'contact', 'changes'];

export function privacyMarkdown() {
  const lines = [`# ${ptBR['privacy.title']} — ${ptBR['app.name']}`, '', `_${ptBR['privacy.effective']}_`, ''];
  for (const key of SECTIONS) lines.push(`## ${ptBR[`privacy.${key}.title`]}`, '', ptBR[`privacy.${key}.body`], '');
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(new URL('../PRIVACY_POLICY.md', import.meta.url), privacyMarkdown());
  console.log('PRIVACY_POLICY.md written');
}
