# Análise geral do projeto — 26/09/2026

Base analisada: `c2bb59e4745e067b19038281d089ec79c4dd0817` (árvore inicialmente limpa).

## Escopo e limites da análise

Inventário completo dos 404 arquivos versionados, incluindo diretórios ocultos do projeto, manifests, configurações, skills, documentação, testes, SQL, scripts e assets. Leitura dirigida dos caminhos centrais de autenticação, autorização, tenancy, features, catálogo, agenda, financeiro, publicação e infraestrutura. O inventário é exaustivo em nomes; a revisão semântica do código é dirigida por risco, não uma certificação de cada linha ou de segurança de produção.

Não foram alterados código de produto, banco, dependências ou configuração operacional. Os únicos arquivos criados nesta entrega são este relatório e o inventário. Evidências históricas de testes e publicações não foram tratadas como execuções atuais. Não houve inspeção de banco vivo, CI remota, VPS, navegador em execução, auditoria externa de dependências ou histórico completo do Git.

Inventário navegável: [todos os arquivos, skills e Markdown](PROJECT_INVENTORY_2026-09-26.md).

## Dimensão e organização

| Item | Quantidade |
| --- | ---: |
| Arquivos versionados antes desta entrega | 404 |
| Aplicações | 5 |
| Pacotes compartilhados | 13 |
| Markdown | 80 |
| Skills canônicas / arquivos de encaminhamento | 19 / 18 |
| Arquivos TypeScript / TSX | 139 / 92 |
| JSON / CSS | 42 / 9 |
| Modelos Prisma | 43 |
| Migrations SQL | 8 |
| Arquivos de testes unitários / integração / E2E | 25 / 11 / 3 |
| Workflows GitHub Actions | 3 |

Há ainda nove arquivos SQL no total: oito migrations e o bootstrap PostgreSQL. O inventário anexo lista cada arquivo com tamanho, linhas e classificação. Não inclui metadados internos de `.git`, dependências instaladas nem arquivos externos das skills do ambiente.

## Arquitetura implementada

Monorepo TypeScript com pnpm e Turborepo, monólito modular NestJS/Fastify, PostgreSQL/Prisma, worker BullMQ/Redis e três frontends Next.js/React. Versões declaradas nos manifests: Node 24.20.0, pnpm 11.19.0, Next 16.3.4, React 19.2.8, Prisma 7.10.0 e Better Auth 1.7.2. São versões do repositório, não uma verificação de disponibilidade ou atualização nos registries.

| Aplicação | Responsabilidade e pontos de entrada |
| --- | --- |
| `apps/api` | REST/OpenAPI; `src/app.ts` registra controllers, filtros e proteção HTTP; `services.ts` centraliza composição, sessão e acesso; serviços de catálogo, agenda, administração, unidades, onboarding, financeiro e editor. |
| `apps/dashboard` | Operação do tenant: serviços, profissionais, clientes, agenda, horários, unidades e financeiro; proxies de mesma origem para API. |
| `apps/admin` | Administração global: usuários, planos, tenants, operações e Site Workspace. |
| `apps/web-public` | Hostname → site publicado; renderização de temas, SEO, previews e proxy de reserva pública. |
| `apps/worker` | Consumo de e-mails transacionais via adapter SMTP; não há consumidor WhatsApp ativo. |

| Pacote | Função real |
| --- | --- |
| `auth` | Configuração Better Auth e envio de verificação/reset por adapter. |
| `tenancy` | Hostnames, slugs reservados, contexto autenticado, permissões e repositório escopado. |
| `billing` | Feature Engine funcional e contrato BillingProvider; não é integração financeira produtiva. |
| `booking` | Cálculos de calendário, disponibilidade e transições, separados da persistência. |
| `database` | Schema, migrations, client Prisma, seed e testes reais de banco. |
| `notifications` | Contratos, fila de e-mail, SMTP e provider de simulação controlado. |
| `config` | Configuração validada, logging e testes operacionais. |
| `types` | Contratos de domínio/API, chaves de permissão/feature e erros. |
| `theme-engine` | Registry, contratos, versões, parser HTML, validação CSS e arquivos de site. |
| `themes` | Renderers Classic, Urban, Minimal e Imperial; componentes públicos e composição por código. |
| `design-system` | Tokens, estilos e componentes visuais. |
| `ui` | Primitivas compartilhadas. |
| `web-kit` | Auth UI, helpers de API no servidor, widget de reservas e utilidades. |

Os diretórios `domains`, `storage`, `analytics`, `validation` e `observability` aparecem na arquitetura conceitual, mas não existem como pacotes neste checkout. MinIO configurado não comprova adapter de storage completo. O esquema extenso inclui entidades preparatórias para fases futuras.

## Estado funcional observado

- **Implementado em código:** identidade/sessão, membership/RBAC, resolução tenant, features por dados, catálogo, horários/bloqueios, clientes, reservas internas e públicas, unidades, onboarding, administração global e versões de site.
- **Financeiro:** relatório de valores de atendimentos concluídos, por data inicial da agenda. Não é conciliação de recebíveis, controle de caixa ou confirmação de pagamento.
- **Site Workspace:** fragmentos HTML interpretados como nós React, tags/atributos permitidos, CSS validado, componentes `barber-*`, assets raster embutidos e fluxo salvar → aprovar → publicar/restaurar.
- **WhatsApp:** contato público/link continuam; envio automático, adapter Meta e rotas de histórico/retry foram removidos. Modelos e migrations históricos permanecem por compatibilidade.
- **Pendências de produto explícitas:** posse de telefone sem OTP, agenda própria BARBER incompleta, billing externo, Cloudflare for SaaS, analytics e operação comercial validada.
- **Bespoke Allan Cristian:** arquivos de apresentação para importar no editor, não um renderer adicional. O README descreve versões locais históricas; não confirma publicação nesta sessão.

## Achados priorizados

### 1. P1 — Reservas públicas compartilham o limite de IP do frontend

**Evidências:** `apps/web-public/app/api/booking/[resource]/route.ts:39`, `apps/api/src/rate-limit.ts:16` e `:29`, `infra/vps/Caddyfile` e `compose.production.yaml`.

O proxy público faz a chamada interna passando apenas Content-Type, sem preservar uma identidade de rede confiável do visitante. Na topologia definida no Compose, a API observa o IP do container frontend. O limitador usa `request.ip` e estabelece seis POSTs por minuto para reservas públicas. Assim, clientes distintos encaminhados pela mesma instância disputam o mesmo bucket; um visitante pode consumir a cota usada por outros tenants.

**Impacto:** recusas 429 em reservas legítimas e negação de serviço compartilhada. É uma conclusão do caminho de código e da topologia declarada; não foi reproduzida em containers nesta sessão.

**Direção de correção:** estabelecer preservação segura de IP pelo ingresso/proxy e confiança restrita, mantendo hostname validado. Não basta confiar em X-Forwarded-For arbitrário. Cobrir dois visitantes distintos, dois tenants e tentativa de spoofing pelo caminho público completo.

### 2. P2 — Financeiro ignora o entitlement finance

**Evidências:** `apps/api/src/finance-controller.ts:27`, `packages/types/src/index.ts:1`, `apps/dashboard/app/tenants/[slug]/finance/page.tsx` e revisão de 12/09.

A autorização exige `reports.read` e `booking`, embora `finance` seja uma feature registrada. Um tenant com booking habilitado, finance desabilitado e um membro com reports.read consegue obter o relatório. Desabilitar finance não revoga esse acesso.

**Direção de correção:** alinhar API e navegação ao entitlement contratado; revisar grants existentes antes de alterar para evitar desligamento acidental de clientes. Validar permissão e feature separadamente. O problema já constava da revisão anterior e segue presente.

### 3. P2 — Timezone financeiro inválido atravessa a validação

**Evidências:** `apps/api/src/finance-controller.ts:8`, `apps/api/src/finance.ts:9` e filtro em `apps/api/src/app.ts`.

`timezone` aceita qualquer string. Uma consulta autenticada com `timezone=invalid-zone` passa no Zod e chega a Intl.DateTimeFormat, que lança RangeError. O filtro de domínio trata AccessError/ZodError; a falha tende a virar erro 500 em vez de 400. Onboarding já possui validação de timezone que pode orientar a correção.

**Direção de correção:** validar IANA e tamanho na fronteira; definir se o fuso deve vir da unidade validada no servidor. Testar fuso inválido e limites de dia/mês.

### 4. P2 — Limite inicial do mês pode excluir atendimento exatamente à meia-noite

**Evidência:** `apps/api/src/finance.ts:15` até a consulta com `gte: startOfMonth`.

A busca binária termina com uma janela de até 1.000 ms e usa o limite superior como se fosse o primeiro milissegundo do mês. Reprodução matemática equivalente em Python, para agora = 26/09/2026 12:34:56.123 UTC e America/Sao_Paulo, produziu 01/09/2026 00:00:00.589 local. Um atendimento iniciado exatamente às 00:00:00 seria excluído.

**Direção de correção:** calcular o limite exato e usar intervalo mensal [início, próximo mês). Não foi executado o serviço TypeScript; a evidência dinâmica é da reprodução do algoritmo. A consulta também não tem limite superior SQL e agrega todos os registros em memória; avaliar volume antes de declarar gargalo.

### 5. P2 documental — Fontes de estado atual divergem

- `README.md` e `docs/ARCHITECTURE.md` ainda anunciam outbox/adapter Meta em uso; `docs/WHATSAPP.md` e o worker atual confirmam a retirada.
- A arquitetura ainda descreve a jornada visual pública como pendente, embora exista widget e fluxo público implementados.
- `docs/SECURITY.md` mantém CSS customizado fora do escopo, enquanto `docs/SITE_EDITOR.md` e o validador implementam CSS controlado.
- `docs/CODE_REVIEW_2026-09-12.md` afirma que o worker rejeita envio real em desenvolvimento/teste; o provider atual proíbe **console em produção**, comportamento diferente. O mesmo review presume maturidade comercial mais ampla que o gate pendente no roadmap.

**Direção de correção:** atualizar documentos vivos e acrescentar notas datadas às revisões históricas, preservando sua natureza histórica. Não usar essas afirmações antigas como evidência da versão atual.

### 6. P3 — Catálogo de temas diverge entre registry e editor

`packages/themes/src/registry.ts` registra Minimal, mas `apps/api/src/site-editor.ts` permite apenas classic, urban e bespoke-imperial em sua lista e validação. Portanto Minimal não pode ser selecionado/publicado pelo fluxo normal desse editor. Confirmar se é experimental; se for suportado, alinhar catálogo de dados, registry e editor, com teste do fluxo completo.

## Skills e instruções

As 19 skills locais estão listadas no inventário com descrição e link para seu SKILL.md. Existem 18 arquivos `.agents/skills/<nome>.md` de encaminhamento; `generate-barbershop-site` possui somente a entrada canônica. Não são 37 skills diferentes.

- Arquitetura/dados: architecture, database, multi-tenancy, tenant-isolation.
- Domínio/operação: booking-engine, billing, domains, devops.
- Apresentação: design-brief, design-system, frontend-ui, custom-design, theme-engine, create-barbershop, edit-barbershop-theme, generate-barbershop-site.
- Qualidade: code-review, security, testing.

O AGENTS.md raiz define isolamento, Core, limites comerciais e gates. Há AGENTS.md e CLAUDE.md nos três frontends; os AGENTS exigem consulta às instruções locais do Next antes de editar código. DESIGN.md e UX-CONTRACT.md são contexto de apresentação e comportamento.

Pontos de manutenção das skills: create-barbershop e edit-barbershop-theme usam exemplos de caminho `apps/frontend/src/themes`, inexistente aqui; o caminho efetivo é packages/themes ou o projeto importável do Site Workspace. A skill theme-engine ainda fala da integração persistida de publicação como pendente, embora SiteEditorService já a implemente. Esses textos devem distinguir fluxo legado, renderer e composição por arquivos.

Graphify é citado no AGENTS, mas não existe no repositório nem nos dois caminhos pessoais convencionais verificados (`~/.Codex/skills/graphify/SKILL.md` e `~/.codex/skills/graphify/SKILL.md`). Não houve busca global por instalação alternativa porque o comando /graphify não foi invocado; nenhum grafo foi gerado. Skills/plugins listados pelo ambiente fora deste checkout não fazem parte dos 404 arquivos.

## Documentação e rastreabilidade

Os 80 Markdown se dividem em 37 arquivos de skills, 31 documentos em docs (incluindo oito ADRs), quatro documentos na raiz, seis arquivos de instruções nos frontends e dois READMEs em pacotes. O inventário contém todos os caminhos e títulos.

Os ADRs possuem duas entradas com prefixo 0008 (Site Workspace e WhatsApp) e não apresentam 0006/0007. A duplicação dificulta referenciar uma decisão só pelo número. Corrigir identificação com atualização de links, preservando histórico. A ADR WhatsApp deve explicitar o estado substituído pela retirada do provider.

A checagem dos links Markdown relativos de formato simples não encontrou destinos de arquivo ausentes; não valida âncoras, URLs externas, paths em crases nem instruções semanticamente desatualizadas.

## Banco, isolamento e segurança

Há 43 modelos, cobrindo identidade, tenancy, planos/features, temas, domínio, assinatura/pagamento, catálogo, agenda, clientes, notificações e auditoria. O inventário lista todos. Os modelos de billing/domínios não representam adapters completos.

Proteções observadas: FKs compostas por tenant/unidade nas relações operacionais; exclusão GiST de horários sobrepostos; intervalos [início,fim); constraints de valores; ownership de temas e proteção contra reatribuição; idempotência por tenant; snapshots de preço/duração; locks transacionais e auditoria na agenda; contexto autenticado construído no backend; Feature Engine com negativa por padrão; consultas explícitas por tenant.

Autenticação exige e-mail verificado para o contexto operacional. Sessões, memberships, permissões e features são verificações distintas. Better Auth configura cookies seguros em produção e revogação no reset. O cadastro público não concede papel administrativo.

O parser de sites tem allowlists, limites de tamanho/profundidade e renderiza nós, sem executar JavaScript arbitrário. A validação raster verifica prefixo/MIME e assinaturas iniciais, não uma decodificação completa de imagem no servidor; manter essa distinção ao ampliar uploads. RLS não foi identificado como barreira ativa e não substitui as verificações atuais.

Não foi demonstrado vazamento de dados entre tenants nos caminhos examinados. Isso não equivale a comprovar isolamento de todas as operações sem executar os testes PostgreSQL/API.

## Testes e operação

Há 25 arquivos unitários, 11 de integração e três specs E2E. Esses números contam arquivos, não casos executados. Os testes cobrem tenancy, features, agenda, banco, catálogo, admin, onboarding, unidades, site editor, regressões, rate limit, temas, proxy e configuração. Não foram encontradas referências ao financeiro nas suítes examinadas: priorizar testes de entitlement, timezone, limite mensal e isolamento desse endpoint.

A CI declara lint, tipos, unitários, integrações PostgreSQL, migrations, backup/restore, build, smoke runtime e três suítes de navegador. Outro workflow verifica imagens standalone. Release empacota imagens/configurações com identificação/checksums; deploy seleciona artefato de CI aprovado. O fato de o workflow existir não comprova execução bem-sucedida remota.

Compose de produção usa rede compartilhada, PostgreSQL/Redis sem portas públicas, apps em loopback no host e Caddy como ingresso TLS. Worker e API são compartilhados entre tenants. Scripts de backup/restauração e release existem. CI usa Redis 8, enquanto produção declara Redis 7.4; alinhar ou testar explicitamente ambas as versões para reduzir divergência ambiental.

| Verificação nesta sessão | Resultado |
| --- | --- |
| Inventário Git e árvore inicial | Executados; 404 arquivos e sem mudanças iniciais |
| Parse dos 42 JSON | Passou |
| Sintaxe bash dos quatro scripts .sh | Passou (`bash -n`) |
| Destinos relativos dos links Markdown simples | Passou, dentro do escopo descrito |
| Reprodução matemática do limite financeiro | Demonstrou limite 589 ms após meia-noite no cenário registrado |
| `pnpm lint` | Não iniciou: pnpm ausente, exit 127 |
| `pnpm typecheck` | Não iniciou: pnpm ausente, exit 127 |
| `pnpm test` | Não iniciou: pnpm ausente, exit 127 |
| `pnpm test:integration` | Não iniciou: pnpm ausente, exit 127 |
| `pnpm build` | Não iniciou: pnpm ausente, exit 127 |
| Browser, migrations e smoke runtime | Não executados; toolchain/dependências e serviços não preparados nesta sessão |

Node também não está no PATH e o checkout não contém node_modules. Docker CLI está disponível; isso não comprova daemon, imagens ou serviços prontos. Não houve instalação ou alteração de infraestrutura apenas para produzir o inventário.

## Ordem sugerida de trabalho

1. Corrigir e testar a preservação segura de IP das reservas públicas.
2. Alinhar entitlement e validação temporal do financeiro; acrescentar regressões do limite mensal.
3. Instalar a toolchain declarada e executar os gates em ambiente isolado, preservando evidências atuais.
4. Conciliar documentação viva, estado das skills e catálogo de temas; resolver identificação duplicada de ADRs.
5. Concluir os gates explícitos do MVP: agenda própria do profissional, operação pública e exercícios operacionais, sem tratar contratos futuros como integrações prontas.
