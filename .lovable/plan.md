# Plan: Corrigir Erro "Unauthorized" em Modelos de Contrato

Corrigir a falha de autorização que impede administradores de salvar modelos de contrato na Digital SC, garantindo segurança via RLS e validação de perfil no servidor.

## Problemas Identificados
- A função `saveContractModel` em `src/lib/contracts-management.functions.ts` usa o cliente Supabase padrão (browser), que está sujeito a RLS.
- Embora existam políticas RLS para administradores, a função falha porque o middleware de autenticação (`requireSupabaseAuth`) não está sendo aplicado à função no servidor, ou o cliente não está recebendo o token corretamente.
- A função tenta realizar operações de escrita (Insert/Update) que podem ser bloqueadas se o perfil do usuário não for validado como `admin` no contexto do servidor antes da operação.

## Soluções

### 1. Backend: Reforço na Segurança e Autorização
- **Middleware de Autenticação:** Aplicar `.middleware([requireSupabaseAuth])` à função `saveContractModel` para garantir que o contexto do Supabase e o `userId` estejam disponíveis.
- **Validação de Papel (Admin):** Utilizar a função de banco `public.has_role` dentro do handler da função para garantir que apenas administradores possam salvar modelos, mesmo que burlam o frontend.
- **Uso do Cliente Supabase do Contexto:** Migrar de `supabase` (importado) para `context.supabase` (do middleware) para garantir que as políticas RLS sejam aplicadas com a identidade correta do usuário.

### 2. Frontend: Melhora na Experiência de Erro
- **Tratamento de Erros:** Atualizar o componente `ContractModelsPage` para capturar e exibir mensagens amigáveis baseadas no tipo de falha (Não autorizado vs Erro de conexão vs Validação).

## Detalhes Técnicos
- Arquivo `src/lib/contracts-management.functions.ts`:
  - Importar `requireSupabaseAuth` de `@/integrations/supabase/auth-middleware`.
  - Atualizar `saveContractModel` para usar o middleware.
  - No handler, verificar `has_role(userId, 'admin')` usando `context.supabase`.
  - Substituir chamadas globais de `supabase` por `context.supabase`.
- Arquivo `src/routes/_authenticated/contract-models.tsx`:
  - Melhorar o bloco `onError` da mutação para parsear mensagens de erro do servidor.

## Verificação
- Testar salvamento de rascunho com usuário admin.
- Tentar editar modelo existente.
- Tentar salvar nova versão.
- Simular tentativa de salvamento com usuário sem perfil admin (via código/console) para validar bloqueio.
