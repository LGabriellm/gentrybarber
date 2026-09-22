# Administração global

O aplicativo `apps/admin`, em `http://localhost:3002` no desenvolvimento, atende operadores com papel de plataforma `SUPER_ADMIN`. Esse papel é verificado no backend; memberships de proprietário ou gerente não concedem acesso global.

## Fluxos implementados

- Cadastro de usuários encaminha a origem da requisição e exige autoridade global. A conta nasce não verificada. O usuário define a senha por recuperação e, no primeiro login com senha válida, recebe o link de verificação. Apenas depois de verificar o endereço consegue acessar; não são enviados convites automaticamente no cadastro.
- Cadastro de planos aceita `basePlanId` opcional. Com uma origem ativa e funcionalidades habilitadas, copia `PlanFeature` (incluindo limites e vínculos desabilitados) na mesma transação e disponibiliza o plano. A cópia é independente. Sem composição, cria o plano inativo; origem ausente/inativa/sem recursos é rejeitada. Valores são inteiros não negativos dentro do limite do banco. Não há migração nem ativação automática de planos antigos.

- Visão geral com contagens persistidas de barbearias, ambientes ativos/suspensos, usuários, contas verificadas e assinaturas ativas. Assinatura ativa não equivale a recebimento confirmado.
- Barbearias com busca por nome/identificador, filtro de situação e paginação de 25 registros. Exibe plano e um responsável com membership OWNER ativa.
- Usuários com busca por nome/e-mail e filtros de verificação ou administrador global. O detalhe permite editar identidade e autoridade, definir senha, enviar redefinição, revogar sessões e administrar vínculos por barbearia. Senhas, hashes e tokens nunca são expostos.
- Planos em cartões com mensalidade, implantação e design personalizado formatados em reais a partir dos centavos cadastrados. Esta tela é de consulta; não administra cobrança.
- Cadastro de barbearia com nome, identificador, plano ativo, fuso horário e e-mail de uma conta já verificada. Cria ambiente ativo, vínculo OWNER, unidade principal e auditoria na mesma transação. Não cria senha temporária nem envia convite. Em caso de erro, o formulário conserva os dados para correção.
- Navegação responsiva, foco visível, link para pular a navegação, labels acessíveis, estados vazios, carregamento e erros.
- Página de gestão em `/tenants/:id`, acessível pelo nome na lista: configuração, unidades, serviços, profissionais, expediente semanal e consulta das pessoas com acesso. O expediente pode ser aplicado à unidade e à equipe inteira ou ajustado para um profissional; conflitos de versão oferecem recarga explícita. Permite editar nome, e-mail, telefone, WhatsApp de contato, fuso para novas unidades, plano e situação. O identificador e os fusos das unidades existentes são preservados.
- Cadastro e edição de unidades com endereço, telefone e situação. Unidades inativas podem ser preparadas antes da ativação; ativação respeita o Feature Engine. Desativação de unidade com atendimentos futuros é recusada. Edições concorrentes exigem recarregar os dados.

## Contratos

Todas as rotas `/v1/admin/*` exigem sessão verificada e SUPER_ADMIN. Escritas exigem Origin confiável e JSON com campos estritamente validados. O frontend encaminha a sessão ao Core; não acessa o banco.

| Rota | Contrato |
| --- | --- |
| GET `/v1/admin/stats` | Indicadores atuais, sem estimativas de receita. |
| GET `/v1/admin/tenants` | `q`, `status` e `page`; resposta `{ items, total, page, pageSize }`. Situações: TRIAL, ACTIVE, SUSPENDED, CANCELED. |
| GET `/v1/admin/users` | Mesmo envelope; filtro `status`: verified, pending ou admin. |
| GET `/v1/admin/users/:id` | Identidade, presença de senha, contagem de sessões, vínculos e opções de barbearia/função; não retorna hashes ou tokens. |
| PATCH `/v1/admin/users/:id` | Atualiza identidade/autoridade, define senha e revoga sessões, ou adiciona/remove membership por ação estritamente validada. |
| POST `/v1/admin/users/:id/password-reset` | Dispara o fluxo oficial de redefinição por e-mail e registra auditoria. |
| GET `/v1/admin/plans` | Projeção comercial dos planos cadastrados. |
| POST `/v1/admin/tenants` | `{ name, slug, planId, ownerEmail, timezone }`; retorna 201 com `{ id, slug }`. Identificador duplicado retorna 409; responsável inexistente/não verificado retorna 404. |
| GET `/v1/admin/tenants/:id` | Dados editáveis, plano, unidades, pessoas vinculadas e contagens de serviços/profissionais. |
| PATCH `/v1/admin/tenants/:id` | `{ status, planId, expectedUpdatedAt }` e campos opcionais `name`, `email`, `phone`, `whatsapp`, `timezone`; controle de concorrência e auditoria. Contatos aceitam null para remoção. |
| POST `/v1/admin/tenants/:id/locations` | `{ name, phone, address, active }`, com slug opcional; retorna unidade criada. |
| PATCH `/v1/admin/tenants/:id/locations/:locationId` | Mesmos campos editáveis da unidade, sem slug, mais `expectedVersion`; vínculo obrigatoriamente no tenant selecionado. |
| GET/POST/PATCH `/v1/admin/tenants/:id/services` | Lista, cria e atualiza serviços usando as mesmas operações escopadas do catálogo. |
| GET/POST/PATCH `/v1/admin/tenants/:id/professionals` | Lista, cria e atualiza profissionais e seus serviços, sempre dentro da mesma unidade e tenant. |
| GET/PUT `/v1/admin/tenants/:id/schedule` | Consulta e atualiza expediente e escalas com versão, fuso e proteção a atendimentos futuros. |
| POST/DELETE `/v1/admin/tenants/:id/time-offs` | Cria ou remove bloqueios de agenda usando o mesmo motor tenant-scoped. |

Buscas têm até 120 caracteres; páginas vão de 1 a 10.000. Contagem e itens compartilham snapshot de leitura e ordenação estável. O cadastro serializa disputas pelo mesmo identificador, usando a mesma trava do onboarding. Nomes, valores e composição dos planos vêm do banco.

As operações de unidades são compartilhadas por `LocationOperations`. A entrada do painel operacional continua exigindo Tenant Context e `team.manage` em `LocationService`; a entrada global exige SUPER_ADMIN e resolve o tenant no servidor, sem criar membership fictícia. Ambas usam as mesmas consultas escopadas, travas, limites, versões e auditoria. Não houve alteração de schema neste incremento. Troca de plano não cria cobrança; manter um plano atual inativo é permitido, mas uma troca exige plano ativo.

## Validação e limites

O [editor de site](SITE_EDITOR.md) está disponível na página da barbearia, com identidade visual, capa, seções, prévia, rascunhos, aprovação, publicação e restauração. Publicar exige ação explícita sobre uma versão aprovada.

`apps/api/test/admin.integration.test.ts` verifica autorização, origem, inputs, responsável verificado, concorrência, persistência, filtros, paginação e auditoria. `pnpm test:e2e:admin` percorre login real, consultas e cadastro no Chromium em computador e celular, com contas fictícias e PostgreSQL isolado. Não envia e-mails externos.

O cadastro não publica site automaticamente. Convites, edição visual de planos, reconciliação de pagamentos e operações comerciais de cobrança permanecem fora deste incremento. Para tornar uma conta local administradora, usar o procedimento documentado no README; o cadastro público nunca concede esse papel.

A seção da barbearia mantém a consulta de pessoas; vínculos são administrados no detalhe do usuário. Transferência guiada de propriedade e convites continuam para outro incremento. Serviços, profissionais e expediente semanal também podem ser administrados pelo operador global, sem criar membership fictícia; o painel operacional conserva seus próprios controles de permissão. O WhatsApp de contato é um dado da barbearia; ele não configura as credenciais do adapter de mensagens.

Melhorias futuras e riscos restantes estão priorizados em [SYSTEM_IMPROVEMENTS.md](SYSTEM_IMPROVEMENTS.md).

O editor do site possui modos Visual e Código HTML/CSS, prévia responsiva, organização automática das seções, três apresentações de preços e agenda pública integrada. A publicação continua pelo ciclo de rascunho, aprovação e publicação. Consulte [Editor do site](SITE_EDITOR.md) para os componentes e limites.

## Site Workspace

A lista de barbearias oferece **Gerenciar site**. O antigo editor visual foi substituído por um workspace HTML/CSS com conteúdo JSON, assets limitados, importação/exportação e versões. A criação de operadores globais continua em Usuários e exige SUPER_ADMIN no backend. Consulte [contrato do workspace](SITE_EDITOR.md).
