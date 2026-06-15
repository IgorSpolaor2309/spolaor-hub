# SC Central — MVP da Spolaor Company

Plataforma interna corporativa para gestão de clientes, colaboradores, pendências, documentos, timeline e interações, com 3 perfis (admin, colaborador, cliente).

## Identidade visual
- Paleta: azul institucional `#044C85`, turquesa `#0594C3`, laranja `#FCA229`, fundos brancos/cinza claro
- Sidebar azul escuro, header branco, cards suaves com sombra discreta
- Tipografia serifada nos títulos (alinhada à logo) + sans-serif limpa no corpo
- Logo Spolaor Company em destaque no login e versão reduzida na sidebar
- Estados: Concluída=verde, Aberta=azul, Em andamento=turquesa, Aguardando cliente=laranja, Vencida=vermelho, Cancelada=cinza

## Backend (Lovable Cloud / Supabase)
Vou ativar o Lovable Cloud e criar:

**Tabelas**
- `profiles` (id, full_name, email, phone, status, created_at, updated_at)
- `user_roles` (user_id, role: admin | collaborator | client) — tabela separada + função `has_role` (security definer)
- `collaborators` (profile_id, cargo, departamento, data_admissao, status)
- `clients` (razao_social, nome_fantasia, documento, email, telefone, data_entrada, tipo, observacoes, status, **omie_id, origem_cadastro, data_ultima_sincronizacao**, owner_profile_id opcional para cliente-usuário)
- `client_collaborators` (client_id, collaborator_profile_id)
- `pending_tasks` (client_id, titulo, descricao, tipo, prazo, status, prioridade, collaborator_id, data_conclusao)
- `documents` (client_id, nome, tipo, competencia, status, observacoes, storage_path, uploaded_by)
- `document_requirements` (client_id, tipo_documento, periodicidade)
- `timeline_events` (client_id, actor_profile_id, tipo, descricao, metadata)
- `interactions` (client_id, actor_profile_id, tipo, descricao, anexos)
- `notifications` (user_id, tipo, titulo, mensagem, lida, link)

**Segurança**
- RLS em todas as tabelas
- Admin vê tudo; colaborador vê apenas clientes vinculados via `client_collaborators`; cliente vê apenas onde `owner_profile_id = auth.uid()`
- Triggers para alimentar `timeline_events` automaticamente (cliente criado, doc enviado, pendência criada/atualizada/concluída, interação)
- Storage bucket privado `documents` com policies por perfil

## Frontend (TanStack Start)

**Rotas públicas**
- `/auth` — login (logo grande, card limpo, e-mail + senha)

**Rotas autenticadas** (sob `_authenticated/`, sidebar + header)
- `/` Dashboard (varia por perfil)
- `/clientes` lista + `/clientes/$id` detalhe (abas: visão geral, pendências, documentos, timeline, interações, requisitos) — só admin/colab
- `/colaboradores` + detalhe — só admin
- `/pendencias` com filtros (cliente, colab, status, prazo, prioridade, competência)
- `/documentos` com filtros e upload
- `/timeline` agregada (admin)
- `/interacoes`
- `/notificacoes`
- `/configuracoes` (admin)
- Cliente: `/minha-area`, `/minhas-pendencias`, `/meus-documentos`, `/historico`, `/notificacoes`

Menus renderizados conforme role.

## Escopo do MVP
Implementado: auth + roles, CRUD admin de clientes/colaboradores, vínculos, pendências, documentos com upload, requisitos por cliente, timeline automática, interações, notificações internas, dashboards por perfil, filtros, badges de status, estados vazios.

Fora do escopo (preparado mas não implementado): integração OMIE (campos prontos), IA, envio externo de e-mail/WhatsApp, pagamentos, indicadores de desempenho.

## Entrega
Devido ao tamanho do escopo, vou entregar em ordem: design system + auth/roles → schema + RLS → layout (sidebar/header) + dashboards → clientes/colaboradores → pendências/documentos → timeline/interações/notificações → área do cliente.

Confirma que posso começar?
