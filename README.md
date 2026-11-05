# LoadLog

Registro de carga e repetições para musculação. Site instalável (PWA): funciona offline, não tem conta nem servidor, e todos os dados ficam no aparelho.

## Usar no iPhone

1. Abra o endereço publicado no **Safari**.
2. Toque em **Compartilhar** › **Adicionar à Tela de Início**.
3. Abra o LoadLog pelo ícone. A partir daí ele funciona sem internet.

## Publicar (GitHub Pages)

1. Coloque esta pasta na raiz de um repositório do GitHub.
2. No repositório: **Settings › Pages › Build and deployment** › Source: *Deploy from a branch*, branch `main`, pasta `/ (root)`.
3. O endereço fica `https://<seu-usuário>.github.io/<repositório>/`.

A cada nova versão, aumente `APP_VERSION` em `src/version.js`, `CACHE_VERSION` em `sw.js` e `version` em `package.json` (os testes conferem).

## Desenvolver

Requer Node 22 ou mais novo.

```sh
npm install         # uma vez: instala as ferramentas de teste
npm test            # métricas, dados (IndexedDB), textos e cache offline
npm run serve       # abre em http://localhost:8080
npx playwright install chromium
npm run test:e2e    # no navegador com tela de iPhone: abas, fichas, importação, sessão de treino, histórico e gráficos, exportação, backup e restauração, ajustes, offline e dados após recarregar
```

## Estrutura

```
index.html, manifest.webmanifest, sw.js
src/
  app.js, router.js, tabs.js, version.js
  design/      tokens.css (cores, espaços, fontes), base.css
  i18n/        pt-BR.js (todos os textos), i18n.js
  data/        banco local (IndexedDB), catálogo, validação, snapshots
  metrics/     regras da seção 4, sem DOM
  shared/      componentes
  features/    home, workout, plans, history, settings
assets/icons/
tests/unit/          node --test
tests/integration/   banco de dados (fake-indexeddb)
tests/e2e/     Playwright
tools/serve.js servidor local de desenvolvimento
```

## Dados de exemplo

Abra o app com `?debug` no endereço (por exemplo `…/index.html?debug#/settings`) e toque em **Gerar dados de exemplo** em Ajustes. São criadas fichas "Exemplo" e cerca de 10 semanas de treinos para conferir o histórico e os gráficos.

## Backup e privacidade

- **Ajustes › Backup** cria um arquivo JSON com todos os dados. Para restaurar, escolha o arquivo: o app mostra o que ele contém e só substitui os dados depois da confirmação.
- **Ajustes › Exportar** gera o CSV (uma linha por série) e o PDF de um período; o cartão de imagem e o PDF de um treino ficam no detalhe do treino, no Histórico.
- `PRIVACY_POLICY.md` é gerado dos textos do app: depois de mudar `privacy.*` em `src/i18n/pt-BR.js`, rode `node tools/privacy-policy.js`.
