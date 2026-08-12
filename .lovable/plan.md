# Plano de Correção: Consulta de CNPJ na Landing Pública

O objetivo é permitir que a consulta de CNPJ funcione na landing page (visitantes não autenticados) mantendo a segurança e reutilizando a infraestrutura existente (Minha Receita via Edge Function).

## Alterações Técnicas

### 1. Backend (Edge Function)
- Modificar `supabase/functions/consultar-cnpj/index.ts` para tornar a autenticação via JWT opcional.
- Implementar uma validação alternativa quando o usuário não estiver autenticado (ex: verificar se a origem é permitida ou apenas prosseguir com rate limit).
- O Supabase gerencia automaticamente a injeção de `SUPABASE_SERVICE_ROLE_KEY` no ambiente da função se necessário para consultas internas, mas aqui o objetivo é permitir a chamada `anon`.

### 2. Frontend (Server Function)
- Manter `src/lib/cnpj-lookup.functions.ts` como o gateway.
- Como `createServerFn` roda no servidor (Worker), ele pode invocar a Edge Function usando a `service_role` (via `supabaseAdmin`) se o usuário estiver deslogado, ou manter o comportamento atual se estiver logado.
- Adicionar validação rigorosa do CNPJ antes de disparar a chamada para evitar desperdício de recursos.

### 3. Segurança
- A Server Function no TanStack Start atua como um proxy seguro: o cliente nunca vê a API externa ou chaves sensíveis.
- Implementar normalização de dados para garantir que apenas o CNPJ exato seja consultado.

## Etapas de Implementação

1. **Edge Function:** Atualizar `supabase/functions/consultar-cnpj/index.ts` para aceitar chamadas sem o header `Authorization` válido, retornando os dados se o CNPJ for válido.
2. **Server Function:** Atualizar `src/lib/cnpj-lookup.functions.ts` para tratar casos onde não há sessão ativa, usando um cliente administrativo (importado dinamicamente) para invocar a função se necessário, ou simplesmente permitindo a invocação `anon` se a Edge Function for aberta.
3. **Validação:** Garantir que `SwitchingChatFlow.tsx` e outros componentes continuem usando `lookupCNPJ` de forma transparente.

## Plano de Testes
- **Público:** Acessar a landing em modo anônimo, iniciar o fluxo "Trocar de contador" e inserir os CNPJs de teste (`68.543.874/0001-29`, `45.355.783/0001-64`).
- **Administrativo:** Realizar a mesma consulta logado no painel administrativo.
