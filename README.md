# Spolaor Central Hub

Crie uma plataforma web interna chamada SC Central.

Subtítulo: Central Operacional Interna da Spolaor Company.

A plataforma será usada internamente para melhorar a comunicação entre clientes e colaboradores, organizar documentos, controlar pendências, reduzir trabalho manual e preparar a empresa para futuras automações com IA.

Este projeto é interno, sem objetivo de venda como SaaS. Não criar planos, assinaturas, pagamentos ou marketplace.

A plataforma não deve substituir o OMIE. Futuramente poderá existir integração com a API do OMIE, mas nesta primeira versão NÃO implemente integração real com OMIE. Apenas deixe a estrutura preparada para uma integração futura.

O foco inicial é construir um MVP funcional, organizado, seguro e escalável.

IDENTIDADE VISUAL

Usar a logo da Spolaor Company anexada como principal referência visual.

A plataforma deve transmitir:

Profissionalismo

Organização

Confiança

Eficiência

Aparência corporativa e premium

Paleta de cores baseada na logo:

Azul escuro institucional: #044C85

Azul turquesa secundário: #0594C3

Laranja de destaque: #FCA229

Branco, gelo e cinza claro para fundos neutros

Direção visual:

Interface moderna, limpa e corporativa.

Fundo principal branco ou cinza muito claro.

Cards com bordas suaves, sombra discreta e bom espaçamento.

Sidebar lateral com azul escuro como cor principal.

Botões principais em azul escuro.

Botões secundários em azul turquesa.

Alertas e destaques importantes em laranja.

Evitar visual infantil, colorido demais ou genérico.

Priorizar clareza, organização e facilidade de uso.

Logo:

Usar a logo da Spolaor Company na tela de login.

Usar uma versão reduzida ou símbolo na sidebar, se possível.

Não distorcer a logo.

Não alterar as cores da logo.

Manter boa margem de respiro ao redor da logo.

Caso a logo esteja em fundo branco, manter a interface compatível com fundo claro.

Tela de login:

Visual premium e institucional.

Logo em destaque.

Nome da plataforma: SC Central

Subtítulo: Central Operacional Interna da Spolaor Company

Frase de apoio: Gestão de clientes, documentos e pendências em um só lugar.

Card de login limpo, com campos de e-mail e senha.

Layout:

Sidebar lateral fixa em desktop.

Menu com ícones simples e texto.

Header superior com nome do usuário, perfil e notificações.

Dashboard com cards objetivos.

Tabelas limpas, com filtros visíveis.

Interface responsiva, funcionando bem em desktop e celular.

Priorizar uso em desktop, mas manter boa experiência mobile.

OBJETIVO PRINCIPAL

Criar uma central operacional onde administradores consigam cadastrar clientes, colaboradores, pendências, documentos obrigatórios e acompanhar tudo por dashboards, timelines e alertas.

Clientes poderão acessar sua própria área para visualizar pendências e enviar documentos.

Colaboradores poderão acompanhar clientes vinculados a eles, atualizar pendências e registrar interações.

PERFIS DE USUÁRIO

1. Administrador

O administrador possui acesso total ao sistema.

Pode:

Criar, editar, inativar e excluir clientes.

Criar, editar, inativar e excluir colaboradores.

Definir o perfil de acesso de cada usuário.

Vincular clientes a colaboradores para fins de visualização e atendimento.

Criar e editar pendências.

Definir documentos obrigatórios por cliente.

Visualizar todos os clientes.

Visualizar todos os colaboradores.

Visualizar todos os documentos.

Visualizar todas as pendências.

Visualizar todas as timelines.

Acessar o dashboard geral.

Gerenciar notificações internas.

Acessar configurações administrativas.

2. Colaborador

O colaborador possui acesso limitado.

Pode:

Visualizar apenas os clientes vinculados a ele.

Visualizar pendências dos clientes vinculados a ele.

Atualizar o status das pendências.

Registrar interações na timeline.

Visualizar documentos dos clientes vinculados a ele.

Receber notificações internas relacionadas aos seus clientes e pendências.

Não pode:

Criar clientes.

Criar colaboradores.

Editar dados cadastrais principais de clientes.

Editar dados cadastrais de colaboradores.

Excluir clientes.

Excluir colaboradores.

Acessar dados de clientes não vinculados a ele.

3. Cliente

O cliente possui acesso apenas à própria área.

Pode:

Visualizar suas próprias pendências.

Enviar documentos.

Visualizar documentos já enviados.

Visualizar histórico/timeline relacionado a ele.

Receber notificações internas.

Não pode:

Acessar dados de outros clientes.

Criar pendências.

Editar informações cadastrais principais.

Visualizar dados de colaboradores além do necessário.

Visualizar área administrativa.

MÓDULOS DA PLATAFORMA

1. Dashboard

Criar uma tela inicial diferente para cada perfil.

Dashboard do Administrador

Exibir:

Total de clientes ativos.

Total de colaboradores ativos.

Pendências abertas.

Pendências vencidas.

Pendências próximas do vencimento.

Documentos enviados recentemente.

Últimas interações registradas.

Lista de clientes com mais pendências em aberto.

Dashboard do Colaborador

Exibir apenas dados relacionados aos clientes vinculados a ele:

Clientes vinculados.

Pendências abertas.

Pendências vencidas.

Documentos recentes.

Últimas interações.

Alertas importantes.

Dashboard do Cliente

Exibir apenas dados do próprio cliente:

Pendências abertas.

Documentos já enviados.

Solicitações recentes.

Histórico de comunicação.

Alertas internos.

2. Gestão de Clientes

Tela acessível apenas para administradores.

Campos do cliente:

Nome/Razão Social.

Nome Fantasia.

CNPJ ou CPF.

E-mail principal.

Telefone/WhatsApp.

Data de entrada.

Tipo de cliente.

Observações internas.

Status: ativo ou inativo.

Não incluir campo chamado “status operacional”.

Não incluir campo chamado “responsável interno”.

O administrador poderá vincular colaboradores ao cliente apenas para fins de acesso, acompanhamento e atendimento.

Ao criar um cliente, o sistema deve gerar automaticamente:

Página individual do cliente.

Área de documentos.

Timeline do cliente.

Área de pendências.

Área de interações.

3. Gestão de Colaboradores

Tela acessível apenas para administradores.

Campos do colaborador:

Nome.

E-mail.

Telefone.

Cargo.

Departamento.

Data de admissão.

Status: ativo ou inativo.

Perfil de acesso.

O administrador deve poder definir quais clientes estão vinculados a cada colaborador.

Não incluir indicadores de desempenho nesta etapa.

As pendências abertas, concluídas e vencidas já servirão como forma de acompanhamento operacional.

4. Central de Documentos

Criar uma área para upload, organização e visualização de documentos.

Cada documento deve ter:

Cliente vinculado.

Nome do arquivo.

Tipo de documento.

Competência/mês de referência.

Data de envio.

Usuário que enviou.

Status do documento.

Observações.

Tipos de documentos iniciais:

Extrato bancário.

Comprovante.

Nota fiscal.

Folha de pagamento.

Contrato.

Outro.

Status dos documentos:

Recebido.

Em análise.

Aprovado.

Recusado.

Filtros:

Cliente.

Tipo de documento.

Competência.

Status.

Data de envio.

Documentos enviados pelo cliente devem aparecer automaticamente para administradores e colaboradores vinculados ao cliente.

5. Gestão de Pendências

Este é o núcleo principal do sistema.

Cada pendência deve ter:

Cliente vinculado.

Título.

Descrição.

Tipo de pendência.

Prazo.

Status.

Prioridade.

Colaborador vinculado, quando aplicável.

Documentos relacionados.

Data de criação.

Data de conclusão.

Status das pendências:

Aberta.

Em andamento.

Aguardando cliente.

Concluída.

Vencida.

Cancelada.

Prioridades:

Baixa.

Média.

Alta.

Urgente.

Filtros:

Cliente.

Colaborador.

Status.

Prazo.

Prioridade.

Competência.

A tela de pendências deve permitir uma visão rápida do que está em aberto, o que está vencido e o que depende do cliente.

6. Documentos Obrigatórios por Cliente

O administrador deve conseguir definir quais documentos cada cliente precisa enviar periodicamente.

Exemplo de cliente tipo comércio:

Extrato bancário mensal.

Comprovantes mensais.

Notas fiscais mensais.

Folha de pagamento mensal.

Exemplo de cliente tipo holding:

Extrato bancário mensal.

Comprovantes mensais.

Essa configuração servirá como base para controle manual no início e futuras automações depois.

Não gerar automações complexas nesta primeira etapa, apenas deixar a estrutura preparada.

7. Timeline do Cliente

Cada cliente deve ter uma timeline com histórico de movimentações.

A timeline deve registrar automaticamente:

Cliente criado.

Documento enviado.

Pendência criada.

Pendência atualizada.

Pendência concluída.

Interação registrada.

Observação adicionada.

Documento recusado.

Documento aprovado.

Cada evento da timeline deve conter:

Data e hora.

Usuário responsável pela ação.

Tipo de evento.

Descrição.

A timeline deve funcionar como histórico centralizado do relacionamento com o cliente.

8. Sistema de Alertas e Notificações

Criar uma área de alertas/notificações dentro da plataforma.

Alertas iniciais:

Pendência próxima do vencimento.

Pendência vencida.

Documento enviado pelo cliente.

Documento aguardando análise.

Nova interação registrada.

Pendência atualizada.

Nesta primeira etapa, não implementar envio externo por WhatsApp ou e-mail.

Criar apenas notificações internas dentro do sistema.

9. Comunicação e Interações

Criar uma área para registrar interações com o cliente.

Cada interação deve ter:

Cliente vinculado.

Usuário que registrou.

Tipo de interação.

Descrição.

Data e hora.

Arquivos anexos opcionais.

Tipos de interação:

Ligação.

WhatsApp.

E-mail.

Reunião.

Observação interna.

Outro.

Essas interações devem aparecer automaticamente na timeline do cliente.

10. Preparação para IA Futura

Não implementar IA funcional nesta primeira versão.

Apenas deixar a estrutura preparada para futuras funções como:

Classificação automática de documentos.

Identificação de tipo de documento.

Identificação de competência.

Geração de mensagens para clientes.

Assistente interno para consultar pendências.

Resumo automático da situação de cada cliente.

Relatórios automáticos para a administração.

Não criar botões falsos de IA.

Não simular IA.

Não criar respostas automáticas falsas.

Apenas preparar a arquitetura para receber essas funcionalidades futuramente.

11. Preparação para API do OMIE Futura

Não implementar API do OMIE agora.

A plataforma deve funcionar 100% com cadastro manual nesta primeira versão.

Criar apenas campos opcionais para integração futura:

omie_id no cadastro de clientes.

origem_do_cadastro: manual ou omie.

data_ultima_sincronizacao.

Esses campos não precisam aparecer em destaque na interface.

A ideia é deixar o banco preparado para uma futura sincronização com o OMIE sem reconstruir o sistema.

REGRAS DE PERMISSÃO

Implementar autenticação com Supabase.

Implementar controle de acesso por perfil.

Apenas administradores podem:

Criar clientes.

Editar clientes.

Inativar clientes.

Excluir clientes.

Criar colaboradores.

Editar colaboradores.

Inativar colaboradores.

Excluir colaboradores.

Definir perfis de acesso.

Vincular clientes a colaboradores.

Colaboradores só podem visualizar clientes vinculados a eles.

Clientes só podem visualizar seus próprios dados.

Proteger as rotas por perfil de acesso.

Usar boas práticas de segurança no banco de dados.

Criar Row Level Security no Supabase sempre que necessário.

BANCO DE DADOS

Criar estrutura usando Supabase com tabelas para:

profiles

clients

collaborators

client_collaborators

pending_tasks

documents

document_requirements

timeline_events

interactions

notifications

Criar relacionamentos corretos entre as tabelas.

Todas as tabelas devem ter:

id

created_at

updated_at

status quando aplicável

As tabelas devem estar preparadas para crescimento futuro.

MENU PRINCIPAL

Menu do Administrador

Dashboard

Clientes

Colaboradores

Pendências

Documentos

Timeline

Interações

Notificações

Configurações

Menu do Colaborador

Dashboard

Meus Clientes

Pendências

Documentos

Interações

Notificações

Menu do Cliente

Minha Área

Minhas Pendências

Meus Documentos

Histórico

Notificações

COMPONENTES E USABILIDADE

Usar:

Cards de resumo.

Tabelas com filtros.

Badges de status.

Modais para criação e edição.

Páginas individuais para clientes.

Barra de busca.

Filtros por status, prazo, cliente e competência.

Mensagens de confirmação para ações importantes.

Estados vazios bem desenhados, explicando o que fazer.

Cores de status:

Concluída: verde discreto.

Aberta: azul.

Em andamento: turquesa.

Aguardando cliente: laranja.

Vencida: vermelho.

Cancelada: cinza.

IMPORTANTE

Não criar funcionalidades de venda.

Não criar assinatura.

Não criar pagamentos.

Não criar planos.

Não criar marketplace.

Não criar integração real com OMIE nesta fase.

Não criar IA funcional nesta fase.

Não criar indicadores de desempenho.

Não criar score de cliente.

Não criar score operacional.

Não usar campo “status operacional”.

Não usar campo “responsável interno” no cadastro do cliente.

Não permitir que colaboradores cadastrem clientes ou funcionários.

Não permitir que clientes vejam dados de outros clientes.

Priorizar uma base sólida, segura, organizada e escalável.

ENTREGA ESPERADA

Gerar a primeira versão funcional da plataforma SC Central, com:

Autenticação.

Perfis de acesso.

Dashboard por tipo de usuário.

Cadastro administrativo de clientes.

Cadastro administrativo de colaboradores.

Vínculo entre clientes e colaboradores.

Gestão de pendências.

Central de documentos.

Documentos obrigatórios por cliente.

Timeline do cliente.

Registro de interações.

Notificações internas.

Visual alinhado à identidade da Spolaor Company usando a logo anexada.

A primeira versão deve ser simples, funcional e bem estruturada, pronta para evoluir futuramente com IA e integração com OMIE.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://spolaor-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/85c16a57-752f-40ad-b51d-ffa8e8d21508).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
