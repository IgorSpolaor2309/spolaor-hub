
# Manutenção final — módulo Processos

Escopo real medido no repositório:

- `processos-modelos.tsx` — 1.200 linhas
- `processos.tsx` — 519 linhas
- `processos.$id.tsx` — 496 linhas (contém o optimistic locking)
- `ProcessDocumentsSection.tsx` — 490 linhas
- ~10 pontos de `Carregando…` no módulo Processos
- 1 `.limit(500)` e 2 usos de `confirm()` nativos em `ProcessDocumentsSection.tsx`
- 8 erros de typecheck nos arquivos do módulo (`search`/`params` obrigatórios do TanStack Router)

O item que exige mais cuidado é a divisão de god components: `processos.$id.tsx` contém o optimistic locking validado pela suíte de concorrência; `processos-modelos.tsx` tem estado interligado entre types/steps/requirements. Refatorar tudo em uma pasada, com testes, sem regredir comportamento, é inviável com qualidade em uma única entrega.

Proponho executar em duas fases dentro deste pacote, entregando a Fase 1 agora e a Fase 2 em seguida se aprovada. Assim mantenho baixa regressão e cada arquivo criado com responsabilidade clara.

## Fase 1 — Correções e padronizações (esta rodada)

1. **Typecheck do módulo Processos** — corrigir os 8 erros usando tipagens corretas:
   - `search={{}}` → padrão adequado (função updater ou objeto tipado) em `ProcessListItem.tsx`, `ProcessDocumentsSection.tsx`, `meus-processos.tsx`, `processos.$id.tsx`, `portal-processos.$id.tsx`, `documentos.tsx`.
   - Sem `as any`, `ts-ignore` ou desativações.
2. **AlertDialog** — substituir `window.confirm` / `confirm()` em `ProcessDocumentsSection.tsx` por AlertDialog do design system:
   - Mensagens explícitas: qual documento, que só o vínculo é removido, arquivo original preservado.
   - Botão Remover com estado de carregamento; bloqueio contra duplo clique.
   - Busca por outros `confirm/alert` no módulo.
3. **`.limit(500)` em `PickDocInline`** — reescrita:
   - Busca server-side (`.ilike` em `nome`/`tipo`/`competencia`) com debounce.
   - Paginação limitada (ex.: 50 por página) com indicador de "mais resultados".
   - Preserva `client_id` (isolamento por cliente).
4. **Skeletons compartilhados** — criar `src/components/sc/Skeletons.tsx` com `ListSkeleton`, `DetailSkeleton`, `CardSkeleton`, `TableSkeleton` (usando o `Skeleton` shadcn já presente).
5. **Aplicar skeletons apenas nas rotas do módulo Processos**:
   - `processos.tsx`, `meus-processos.tsx`, `processos.$id.tsx`, `processos-modelos.tsx`, `portal-processos.tsx`, `portal-processos.$id.tsx`, `ProcessDocumentsSection.tsx`.
   - Preserva layout aproximado para evitar salto visual.
6. **Testes**:
   - Novo `scripts/tests/process-docs-limit.test.mjs`: verifica ausência de `.limit(500)` e presença de busca server-side no arquivo.
   - Novo `scripts/tests/process-docs-alert.test.mjs`: verifica ausência de `confirm(`/`alert(` no módulo, presença de `AlertDialog` no arquivo.
   - Reexecutar as 4 suítes existentes.
7. **Verificações finais**: `bunx tsgo --noEmit` (Processos = 0), `bun run build`, grep por `window.confirm|window.alert|.limit(500)|Carregando…` restringido ao módulo.

## Fase 2 — Divisão dos god components (rodada seguinte)

- Extrair de `processos-modelos.tsx` (1.200 → ~250 no arquivo raiz):
  - `ProcessTypeList.tsx`, `ProcessTypeEditor.tsx`, `ProcessStepsEditor.tsx`, `ProcessStepRequirementsEditor.tsx`, `NewProcessTypeDialog.tsx`, `DuplicateProcessTypeDialog.tsx`.
  - Hook `useProcessModels` se emergir uma responsabilidade clara.
- Extrair de `processos.$id.tsx` (496 → ~200 no arquivo raiz):
  - `ProcessHeader.tsx`, `ProcessMetadata.tsx`, `ProcessStepsList.tsx`, `ProcessTimeline.tsx`, `ProcessObservations.tsx`.
  - Optimistic locking permanece no arquivo raiz (a rota mantém `updateProc`/`updateStep`, `expectedVersion`, `scope`) — subcomponentes recebem callbacks e valores.
- Extrair de `ProcessDocumentsSection.tsx` (490 → ~150 no arquivo raiz):
  - `RequirementRow.tsx`, `RequestFromRequirementDialog.tsx`, `LinkDocDialog.tsx`, `PickDocDialog.tsx`, `PickDocInline.tsx`.
- Rodar novamente todas as suítes, `tsgo`, `build` e concorrência.

`processos.tsx` (519 linhas) tem responsabilidade única (listagem + filtros + paginação); não é god component. Não divido a menos que apareça necessidade real durante a Fase 2.

## Fora de escopo (respeitando os limites)

Sem alterações em: banco, RLS, RPCs, MCP, Portal do Cliente (comportamento), regras de negócio, constantes de domínio, novas telas/métricas/status. Erros de typecheck em arquivos fora do módulo (sidebar, segurança, interações, clientes, meu-mês) permanecem no baseline salvo correção natural compartilhada.

## Entrega da Fase 1 incluirá

- Arquivos criados/alterados, linhas antes/depois de `ProcessDocumentsSection.tsx`.
- Decisão detalhada sobre `.limit(500)` (busca server-side + paginação).
- Loaders padronizados listados por rota.
- AlertDialog demonstrado.
- Typecheck do módulo = 0; typecheck total comparado ao baseline.
- Resultado das 6 suítes (4 existentes + 2 novas) e do build.

Ao aprovar, executo a Fase 1 imediatamente. A Fase 2 só entra na sequência quando a Fase 1 estiver validada, para manter a bisseção clara em caso de regressão.
