# Decisões

Registro de escolhas tomadas onde a especificação não define o comportamento. Formato: data, decisão, motivo.

## Mudança de plataforma

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | O LoadLog passa de app iOS nativo para site instalável (PWA), usado pela tela de início do iPhone. Decisão do Eduardo. | Não há Mac disponível para compilar e instalar um app nativo. |
| 2026-11-04 | Saem do escopo: Apple Watch (Fase 8) e widget (Fase 7). | Sites não têm acesso a watchOS nem a WidgetKit. |
| 2026-11-04 | Timer de descanso: o aviso só é garantido com o app aberto. | O iOS não permite que um site agende notificação local com a tela bloqueada. |
| 2026-11-04 | Haptics viram retorno visual. | O Safari do iOS não implementa a Vibration API. |
| 2026-11-04 | As regras de domínio da seção 4 não mudam. | Pedido explícito da especificação. |

## Mapeamento da especificação

| Original (iOS) | Web |
|---|---|
| Swift / SwiftUI | JavaScript (ES modules), HTML e CSS, sem framework |
| SwiftData | IndexedDB (a partir da Fase 1) |
| `Packages/LoadLogKit/Sources/Metrics` | `src/metrics/` (módulos puros, sem DOM e sem armazenamento) |
| `DesignSystem` | `src/design/tokens.css` (variáveis CSS) |
| `Localizable.xcstrings` | `src/i18n/pt-BR.js` + função `t()` |
| XcodeGen / `project.yml` | Nenhuma etapa de build: os arquivos são servidos como estão |
| `swift test` / XCTest | `node --test` (embutido no Node) |
| XCUITest | Playwright (só em desenvolvimento) |
| Share Sheet | Web Share API, com download de arquivo como alternativa |

## Escolhas da Fase 0

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Sem framework e sem etapa de build; ES modules servidos direto. | Equivalente à regra "sem dependências de terceiros em runtime". Permite publicar em hospedagem estática (GitHub Pages) sem configuração. |
| 2026-11-04 | Playwright é a única dependência, e só de desenvolvimento, para os testes de navegação. | Substitui o XCUITest. Não entra no app publicado. |
| 2026-11-04 | Roteamento por hash (`#/home`, `#/workout`...). | Funciona em hospedagem estática sem regras de servidor e com o app offline. |
| 2026-11-04 | Service worker com cache de todos os arquivos (cache-first). A versão nova é ativada na próxima abertura do app. | Abre offline. Não troca a versão no meio de um treino. Os testes garantem que a lista de cache bate com os arquivos e que a versão bate com `src/version.js`. |
| 2026-11-04 | Content Security Policy com `connect-src 'none'`. | Garante no navegador que o app não faz requisição de rede, como pede a seção 7. |
| 2026-11-04 | O texto de `<noscript>` em `index.html` fica fora do catálogo. | Sem JavaScript o catálogo não pode ser lido. É a única exceção. |
| 2026-11-04 | Tamanhos de fonte em `rem` sobre `font: -apple-system-body`. | No Safari do iOS o tamanho base segue o Dynamic Type do sistema. |
| 2026-11-04 | O app segue a aparência do sistema (claro/escuro). Os tokens têm o escuro como referência. | "Dark-first" foi lido como prioridade de design; o modo claro precisa funcionar. |
| 2026-11-04 | Cor de destaque única: verde-limão (`#B8F24A` no escuro, `#4A7A0C` no claro). Positivo e negativo têm cores próprias, sempre com ícone. | Todas as combinações de texto têm contraste ≥ 4,5:1 (AA). |
| 2026-11-04 | `src/metrics/` já nasce com o indicador ↑/→/↓ (regra 4.3, ±1%) e seus testes. | Mantido da versão nativa, onde o package não aceitava módulo vazio. A regra não foi alterada. |
| 2026-11-04 | Indicador com valor anterior igual a 0 usa o sinal do valor atual (↑ se > 0, → se 0). | A variação relativa é indefinida quando o anterior é 0. |

## Escolhas da Fase 1

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Um object store por modelo (`exercises`, `plans`, `planExercises`, `sessions`, `sessionExercises`, `sets`), ligados por id e índices. A cascata é feita dentro da mesma transação. | IndexedDB não tem relacionamentos. Uma transação por operação garante "tudo ou nada": nunca sobra série órfã. |
| 2026-11-04 | Datas guardadas como milissegundos (número). | Simplifica ordenação, snapshots e o backup JSON da Fase 6. |
| 2026-11-04 | O catálogo fica em `src/data/catalog.pt-BR.js` (módulo JS), não em `.json`. | A política de segurança bloqueia `fetch`, inclusive do próprio site. |
| 2026-11-04 | Catálogo com 111 exercícios. Cada um tem uma chave fixa (`builtinKey`) usada pela carga inicial para não duplicar. | Permite acrescentar exercícios em versões futuras sem duplicar os existentes. |
| 2026-11-04 | Adutores não existem na lista de grupos da seção 3; a cadeira adutora usa quadríceps como grupo primário. | Não alterar o enum sem perguntar. Pode ser revisto. |
| 2026-11-04 | Excluir exercício que ainda está em alguma ficha é recusado (erro `inUse`), mesmo sem histórico. | Evita alterar fichas em silêncio. O usuário remove da ficha primeiro. |
| 2026-11-04 | Validação além da seção 3: nome com 1 a 80 caracteres (sem espaços nas pontas); séries prescritas de 1 a 20; reps mín. ≤ máx.; descanso de 0 a 3600 s; incremento próprio positivo, múltiplo de 0,25 e até 100 kg. | Limites simples que evitam dados absurdos. |
| 2026-11-04 | Drop-set exige `dropGroupId`; os demais tipos não podem ter. | Mantém a regra 4.2 consistente desde a gravação. |
| 2026-11-04 | Sessão avulsa grava `planNameSnapshot` vazio. | A interface mostra o rótulo "Treino avulso" a partir do catálogo de textos. |
| 2026-11-04 | O app pede armazenamento persistente (`navigator.storage.persist()`) ao abrir e mostra o estado em Ajustes. | Reduz o risco de o iPhone apagar os dados por falta de espaço. |
| 2026-11-04 | `fake-indexeddb` entra como dependência só de desenvolvimento. | Roda os testes de integração no Node, sem navegador. Os mesmos fluxos também são testados no Chromium real. |

## Escolhas da Fase 2

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Carga média usa as séries efetivas com o drop-set reduzido à etapa principal. | "Séries consideradas" não está definido; as etapas seguintes do drop-set puxariam a média para baixo sem refletir a carga de trabalho. |
| 2026-11-04 | Melhor série: maior carga, depois mais reps; empate total fica com a série registrada antes. | A regra 4.3 não define o empate completo. |
| 2026-11-04 | Na comparação, entram só as sessões em que o exercício tem ao menos uma série efetiva. Se o exercício aparece duas vezes na mesma sessão, as séries são somadas. | Uma sessão só com aquecimento não tem "melhor série" para comparar. |
| 2026-11-04 | Empate de `startedAt` entre sessões é desempatado pelo id, para a ordem ser sempre a mesma. | Evita resultado diferente a cada cálculo. |
| 2026-11-04 | Estagnação é avaliada nas sessões mais recentes: o app mostra o alerta enquanto a sequência atual tiver 3 ou mais sessões. Tonelagem igual conta como "não aumentou". | A regra 4.5 fala em "não aumenta"; igual não é aumento. |
| 2026-11-04 | PRs: a primeira série de um exercício só define a base, sem banner. Igualar um recorde não é PR. "Mais reps numa carga" só vale para uma carga já feita antes. | Evita um banner de PR em cada exercício novo. |
| 2026-11-04 | Para PR de 1RM, séries antigas com mais de 12 reps também são ignoradas como referência. | Coerente com "apenas séries com reps ≤ 12". |
| 2026-11-04 | Média do volume semanal: as 4 semanas completas antes da semana atual (semanas sem treino contam como 0). | A semana atual ainda está em andamento e distorceria a média. |
| 2026-11-04 | Próxima ficha: a "última sessão encerrada" é a de `startedAt` mais recente com ficha; sessões avulsas são ignoradas. Se a ficha dela foi arquivada, segue para a próxima ativa na ordem; se foi excluída, volta para a primeira. | Regra 4.9 não cobre sessão avulsa nem ficha arquivada. |
| 2026-11-04 | Indicador ↑/→/↓ com valor anterior 0: decide pelo sinal do valor atual. | (Registrado na Fase 0.) |

## Escolhas da Fase 3

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | O catálogo de exercícios fica dentro da aba Fichas (Fichas › Exercícios). | A especificação fixa 5 abas; o catálogo é usado principalmente ao montar fichas. |
| 2026-11-04 | Exercício novo na ficha entra com 3 × 8–12 e 2:00 de descanso, e a tela de ajuste abre em seguida. | Ponto de partida comum; o ajuste fica a um toque. |
| 2026-11-04 | Descanso ajustável de 0 a 10 min, em passos de 15 s. | Cobre os casos reais com poucos toques (o banco aceita até 60 min). |
| 2026-11-04 | Reordenar usa botões ↑ ↓ em vez de arrastar. | Funciona com uma mão, com VoiceOver e sem gestos ocultos. |
| 2026-11-04 | Excluir ficha ou exercício pede confirmação; arquivar e desarquivar não. | Exclusão não tem volta; arquivar tem. |
| 2026-11-04 | Exercícios do catálogo embutido não podem ser excluídos, só arquivados; deles só o incremento é editável. | A carga inicial recriaria um exercício embutido apagado. |
| 2026-11-04 | Nomes de exercício são únicos, ignorando acentos, maiúsculas e espaços. | Mesma regra da deduplicação da importação, para o catálogo não acumular repetidos. |
| 2026-11-04 | Importação: o mapeamento é de colunas; os valores (grupo, equipamento, padrão) são traduzidos por uma tabela de sinônimos em português e inglês. Grupo desconhecido torna o item inválido; equipamento desconhecido vira "Outro". | Mantém a tela de mapeamento simples, como pede a especificação. |
| 2026-11-04 | Grupos do free-exercise-db fora da lista da seção 3: dorsais e meio das costas → costas; abdutores → glúteos; adutores → quadríceps; pescoço → trapézio. | A lista de grupos não foi alterada. |
| 2026-11-04 | Sem padrão de movimento no arquivo, ele é deduzido: "isolation" → isolamento; senão pelo grupo primário (dorsais → puxar vertical, outras costas → puxar horizontal, peito/tríceps → empurrar horizontal, ombros → empurrar vertical, quadríceps → agachar, posteriores/glúteos/lombar → dobradiça, abdômen → core). | O free-exercise-db não tem esse campo. |
| 2026-11-04 | Na revisão, duplicados e inválidos aparecem com o motivo, mas não podem ser marcados. Itens novos começam marcados. | "Nunca importar silenciosamente" e sem duplicar. |
| 2026-11-04 | Limites da importação: 5 MB e 5.000 registros por arquivo. | Evita travar o aparelho com um arquivo errado. |
| 2026-11-04 | O assistente de importação guarda o arquivo só na memória; recarregar o app volta ao início. | Nada é gravado antes da confirmação. |
| 2026-11-04 | `tests/fixtures/free-exercise-db.json` é o arquivo oficial (domínio público), usado nos testes. | Prova a importação com o formato real, não com um exemplo inventado. |

## Escolhas da Fase 4

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Pré-preenchimento da próxima série: 1) série anterior do mesmo exercício nesta sessão; 2) melhor série da última sessão com a mesma ficha; 3) melhor série da última vez em qualquer ficha; 4) 0 kg × reps mínimas (ou 8). | Na maioria das vezes, confirmar sem mexer em nada. |
| 2026-11-04 | A tela da sessão abre no primeiro exercício com séries pendentes; a troca é por abas (chips) no topo ou deslizando o painel para os lados. | Abas dão o mesmo resultado sem depender de gesto. |
| 2026-11-04 | Toque longo numa série e o botão "Opções" abrem o mesmo menu (tipo, RIR, iniciar drop-set, excluir). Deslizar o editor para a direita equivale a "Confirmar série". | Todo gesto tem alternativa por botão, para VoiceOver e uso com uma mão. |
| 2026-11-04 | Drop-set: começa pelo menu da última série efetiva; cada nova série entra no mesmo drop-set, com a carga já reduzida em um incremento, até tocar "Encerrar drop-set". Conta como uma série, e cada etapa reinicia o descanso. | Segue a seção 4 (drop-set conta como 1 série); o descanso passa a contar da última etapa. |
| 2026-11-04 | Excluir série não pede confirmação; a mensagem confirma o que foi excluído. | Ação rápida no meio do treino; refazer a série custa um toque. |
| 2026-11-04 | Teclado numérico próprio na tela (sem o teclado do iPhone). Carga inválida (fora de 0–1000 kg ou fora de múltiplos de 0,25) ou reps fora de 1–100 mostram erro e nada é salvo. | Evita o teclado do sistema cobrindo o botão e impede valores fora das regras. |
| 2026-11-04 | Timer de descanso: a hora de término fica salva no aparelho, então sobrevive a recarregar ou fechar o app. Se terminou há mais de 1 minuto com o app fechado, some sem aviso. | Um alarme atrasado depois de reabrir o app não ajuda. |
| 2026-11-04 | Fim do descanso com o app aberto: mensagem na tela e pulso visual (o Safari do iPhone não vibra). Com o app em segundo plano, notificação só se o iPhone permitir notificações do app da tela de início (iOS 16.4+), sem garantia de horário exato. | Limite da plataforma web no iPhone, já previsto na troca para site. |
| 2026-11-04 | Treino avulso usa descanso de 2:00. | Mesmo padrão dos exercícios novos na ficha; ajustável na Fase 6. |
| 2026-11-04 | RIR fica desligado por padrão e é ligado em Ajustes › Treino; só é salvo com a opção ligada. | Menos toques para quem não usa RIR. |
| 2026-11-04 | Início do treino pode ser mudado (antes ou durante), nunca para o futuro. Ao mudar, as sugestões de carga são recalculadas. | Registro retroativo, conforme a especificação. |
| 2026-11-04 | Ao encerrar um treino iniciado há 6 horas ou mais, o fim vira início + tempo entre a primeira e a última série. | Um treino lançado no dia seguinte não fica com duração de 20 horas. |
| 2026-11-04 | Encerrar sem nenhuma série oferece descartar o treino (apagado). | Uma sessão vazia não tem o que guardar. |
| 2026-11-04 | Se há treino em andamento, abrir o app no Início leva direto à aba Treino. | Restauração do estado depois de o iPhone fechar o app. |
| 2026-11-04 | Recordes aparecem na hora (mensagem) e no resumo; a base de comparação é todo o histórico anterior do exercício, em qualquer ficha. | Recorde é do exercício, não da ficha. |

## Escolhas da Fase 5

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Gráficos desenhados em SVG pelo próprio app (linha, barras e barras agrupadas), sem biblioteca. Cada gráfico tem descrição para o VoiceOver e um "Ver dados" com a tabela dos valores. | Substitui o Swift Charts sem dependências externas; o VoiceOver lê os números exatos. |
| 2026-11-04 | Barras horizontais em vez de verticais. | Nomes de grupos e exercícios cabem na largura do iPhone. |
| 2026-11-04 | Análise fica dentro da aba Histórico: Exercícios, Volume semanal e Consistência. | A especificação fixa 5 abas. |
| 2026-11-04 | Filtro do histórico: todas as fichas, uma ficha ou só treinos avulsos, guardado no endereço (`?ficha=`). | Voltar de um detalhe mantém o filtro. |
| 2026-11-04 | Gráfico do exercício: um ponto por sessão; 1RM estimado = maior entre as séries de até 12 reps. Sessão só com séries acima de 12 reps usa o maior valor delas e aparece com ponto vazado e aviso. | Segue a seção 4.3 (flag de baixa confiança) sem sumir com a sessão do gráfico. |
| 2026-11-04 | Recordes e gráfico do exercício cruzam fichas (inclui treinos avulsos); progresso parcial e estagnação são mostrados por ficha. | Segue 4.4, 4.5 e 4.6. |
| 2026-11-04 | Comparação sessão × anterior usa a melhor série (carga e reps) e a tonelagem de cada exercício, com seta e palavra além da cor. Treino avulso não tem comparação. | Mesma chave de comparação da seção 4.4 (ficha + exercício). |
| 2026-11-04 | Tendência do volume: regressão das últimas 8 semanas completas (a semana atual fica de fora por estar incompleta), começando na primeira semana com treino; semanas sem treino contam como 0. Direção pela regra de ±1% entre o início e o fim da reta. | A seção 4.8 pede no mínimo 3 pontos semanais; a semana em andamento puxaria a reta para baixo. |
| 2026-11-04 | Consistência: calendário das últimas 16 semanas, segunda a domingo; cor mais forte com mais treinos no dia (até 3). | Cabe na largura do iPhone e mostra cerca de 4 meses. |
| 2026-11-04 | Início: "sequência da semana" = semanas seguidas com pelo menos um treino (a atual conta quando já tem treino); "aderência" = treinos nesta semana, com os dias marcados. PRs recentes = últimos 30 dias, até 5. | A especificação não define meta semanal; não inventei uma. |
| 2026-11-04 | Detalhe de sessão editável: carga, reps, tipo e RIR de cada série, adicionar e excluir séries, início e fim (gravados juntos), excluir o treino (com confirmação). | "Detalhe de qualquer sessão passada (editável)". |
| 2026-11-04 | Gerador de dados de exemplo (o "DEBUG" da especificação): aparece em Ajustes só com `?debug` no endereço. Cria fichas "Exemplo" e ~10 semanas de treinos, com uma semana de folga, drop-sets, aquecimentos, um exercício estagnado e um treino avulso. Nunca apaga nada. | Permite conferir todos os gráficos sem afetar o uso normal. |

## Escolhas da Fase 6

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Toda exportação abre a folha de compartilhar do iPhone (salvar no Arquivos, AirDrop, Mensagens). Se o navegador não oferecer compartilhar arquivos, o arquivo é baixado. | Nada sai pela internet; o usuário escolhe o destino. |
| 2026-11-04 | PDF gerado pelo próprio app (fonte Helvetica do PDF). Símbolos fora dessa fonte são trocados (↑ vira +, ↓ vira -). | Sem bibliotecas nem rede; acentos do português funcionam. |
| 2026-11-04 | Cartão de imagem 1080×1350 (formato de story/feed), sempre escuro, até 7 exercícios com a melhor série e uma faixa de recordes. | Fica igual em qualquer aparência do iPhone. |
| 2026-11-04 | CSV: colunas da seção 5.5, decimal com ponto, datas ISO no horário local com fuso, BOM UTF-8, linhas CRLF, treino mais antigo primeiro, `set_order` começa em 1. Treino avulso aparece como "Treino avulso" em `plan_name`. | Abre certo no Excel e no Numbers e é fácil de processar. |
| 2026-11-04 | PDF de período: do início do primeiro dia ao fim do último dia escolhidos (padrão: últimos 30 dias), com totais do período. | Período inclusivo, como o usuário espera. |
| 2026-11-04 | Backup JSON com `format`, `schemaVersion` (1), versão do app e data; inclui exercícios, fichas, treinos, séries e ajustes. O timer de descanso não entra. | Um descanso em andamento não faz sentido em outro aparelho. |
| 2026-11-04 | Restaurar: o arquivo é validado inteiro (formato, versão, cada registro pelas regras do app, referências, ids repetidos, no máximo um treino em andamento) e a troca é feita numa única operação: ou tudo é substituído ou nada muda. Depois, o catálogo padrão é completado. | Um arquivo corrompido nunca deixa os dados pela metade. |
| 2026-11-04 | Backup de versão mais nova que o app é recusado com aviso para atualizar o app. Campos desconhecidos são ignorados. | Evita perder dados que a versão atual não entende. |
| 2026-11-04 | "Apagar todos os dados" pede confirmação, apaga tudo e recoloca o catálogo padrão de exercícios. | O app volta ao estado de recém-instalado. |
| 2026-11-04 | Incrementos padrão por equipamento editáveis em Ajustes (0,25 a 10 kg). Ordem: incremento do próprio exercício, senão o de Ajustes para o equipamento, senão o padrão da seção 4.1. A regra 4.1 em si não mudou. | Só muda o valor padrão sugerido, como pede a seção 5.6. |
| 2026-11-04 | Descanso do treino avulso ajustável em Ajustes (0 a 10 min, padrão 2:00). Vibração liga/desliga em Ajustes. | Ajuste previsto na Fase 4. |
| 2026-11-04 | Política de privacidade: contato pelo perfil do GitHub (github.com/dudu120666-ship-it), não por e-mail. Menciona que o serviço de hospedagem (GitHub Pages) pode registrar o IP de acesso. `PRIVACY_POLICY.md` é gerado dos mesmos textos do app (`node tools/privacy-policy.js`), e um teste confere que são iguais. | Não publicar o e-mail sem perguntar; o texto do app e o arquivo nunca divergem. |
