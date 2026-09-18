# Plataforma SaaS para barbearias

Fase 1 — MVP em implementação, sobre a Foundation validada. Um monólito modular multi-tenant, com Core compartilhado e apresentações distintas. O nome comercial é configurável por `PLATFORM_NAME`.

## O que está implementado

- Monorepo TypeScript com pnpm/Turborepo, três aplicações Next.js, API NestJS/Fastify e worker BullMQ.
- PostgreSQL/Prisma com migrations, entidades iniciais, chaves compostas por tenant/unidade e exclusão de horários conflitantes.
- Better Auth: cadastro, verificação de e-mail, login, logout, recuperação de senha e sessões. Cadastro não concede membership nem papel administrativo.
- Resolução pública pelo hostname e autenticação por sessão → membership → tenant → permissão → feature.
- Feature Engine baseado em dados, overrides com expiração e negativa por padrão.
- Theme Registry, tokens validados, Classic, Urban e um exemplo bespoke Imperial. Modelos puros de workflow/versionamento/rollback.
- Site público com projeção segura da API; painel com os ambientes da conta; [admin global](docs/ADMIN.md) protegido por SUPER_ADMIN, com indicadores, buscas, filtros, planos e cadastro de barbearias com responsável verificado. [Editor do site](docs/SITE_EDITOR.md) com prévia, conteúdo, seções e publicação por versão.
- Catálogo por unidade: criar, editar, desativar e reativar serviços e profissionais, incluindo os vínculos entre eles.
- Agenda interna: expediente, escalas, pausas, bloqueios, busca/cadastro de clientes, disponibilidade, confirmação, reagendamento e estados do atendimento.
- Reservas com preços/durações preservados, recuperação de confirmação após falha de conexão, auditoria e proteção contra sobreposição concorrente.
- Onboarding com plano inicial configurável e gestão de unidades com limite por recurso e concorrência protegida.
- API de reserva pública com comprovante mínimo, sem sobrescrever cadastros por telefone informado anonimamente.
- [Confirmações WhatsApp](docs/WHATSAPP.md) na agenda interna: autorização/revogação, fila transacional, adapter Meta, histórico e nova tentativa de falhas explícitas. Ativação externa depende de credenciais e template aprovado.
- Documentação, skills, CI e testes unitários, PostgreSQL/API e browser.

Jornada de reserva pelo site público com verificação de telefone, agenda própria do profissional, cobrança Mercado Pago, Cloudflare for SaaS, editor visual, uploads e analytics são etapas posteriores. Contratos ou modelos desses módulos não representam integrações concluídas.

## Executar localmente

Requisitos: Node.js 24, pnpm 11.19.0 e Docker com Compose.

O projeto fixa Node.js 24.20.0 no Volta e em `devEngines.runtime`. O pnpm instala o runtime local e o usa nos comandos do workspace, inclusive quando o pnpm global foi instalado com outra versão do Node. Confira com `pnpm exec node --version` após a instalação; o resultado deve ser `v24.20.0`.

1. Copie `.env.example` para `.env`. Gere `BETTER_AUTH_SECRET` com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e preencha o valor. As demais credenciais do exemplo são exclusivamente locais.
2. Execute `pnpm install --frozen-lockfile`.
3. Execute `docker compose up -d postgres redis minio mailpit`.
4. Execute `pnpm db:generate`, `pnpm db:migrate` e `pnpm db:seed`.
5. Execute `pnpm dev`.

### Executar todos os serviços no Docker

Com Docker Compose e o `.env` preparado no passo 1, execute:

```sh
docker compose up -d --build
docker compose run --rm migrate pnpm db:seed
docker compose ps -a
```

O Compose sobe PostgreSQL, Redis, MinIO, Mailpit, API, worker, site público, painel e admin. O serviço temporário `migrate` aplica as migrations antes da API e do worker; os frontends aguardam a API pronta. O seed é uma ação manual para carregar dados demonstrativos locais. Os endereços são os mesmos da tabela abaixo. Não execute `pnpm dev` simultaneamente nas mesmas portas.

Os frontends usam builds standalone; após alterar código, repita `docker compose up -d --build`. A API usa modo de desenvolvimento para permitir autenticação HTTP local. Esse Compose é exclusivo do ambiente local; publicação exige HTTPS e configuração de produção descrita em [DEPLOYMENT.md](docs/DEPLOYMENT.md).

Para consultar logs: `docker compose logs -f api worker`. Para parar e preservar os volumes: `docker compose down`. Para executar a concessão de acesso sem Node no host: `docker compose exec -w /workspace api pnpm access:grant seu-email@example.com imperial OWNER`.

| Aplicação | Endereço local |
| --- | --- |
| Índice de desenvolvimento | http://localhost:3000 |
| Site Imperial | http://imperial.localhost:3000 |
| Site Studio | http://studio.localhost:3000 |
| Painel | http://localhost:3001 |
| Admin | http://localhost:3002 |
| API / OpenAPI | http://localhost:4000/openapi.json |
| E-mails no Mailpit | http://localhost:8025 |
| Console MinIO | http://localhost:9001 |

O navegador precisa resolver os subdomínios `.localhost`; se não resolver, mapeie `imperial.localhost` e `studio.localhost` para `127.0.0.1` no ambiente de desenvolvimento. O seed cria dois tenants e dados de demonstração, sem contas ou senhas prontas. Serviços e valores do seed são dados editáveis, não regras de plano.

Crie uma conta no painel, confirme o e-mail no Mailpit e vincule-a pelo comando administrativo local:

```text
pnpm access:grant seu-email@example.com imperial OWNER
```

Esse comando exige acesso de operador ao banco e registra auditoria. Não é um endpoint disponível ao cliente. `SUPER_ADMIN` não pode ser concedido no cadastro nem por esse comando; seu provisionamento deve ser feito por um operador autorizado, conforme `docs/SECURITY.md`.

Em uma instalação local existente, execute `pnpm db:migrate` e `pnpm db:seed` para aplicar a migration aditiva da agenda e incluir as novas permissões. O seed de demonstração é exclusivo de desenvolvimento. No painel, abra **Serviços**, **Profissionais**, **Horários e bloqueios** e **Agenda**. Configure o expediente da unidade e a escala do profissional antes de consultar horários. OWNER e MANAGER podem administrar horários; RECEPTIONIST administra atendimentos. BARBER ainda não recebe acesso à agenda geral. A criação de reserva exige os recursos `booking` e `customers` habilitados.

Para comparar apresentações sem banco, defina `DEMO_MODE=true` e use `/preview/classic`, `/preview/urban` ou `/preview/imperial` no site público em modo de desenvolvimento. Esses previews usam conteúdo fictício, possuem `noindex` e retornam 404 em produção. Não substituem o futuro preview privado de designs de clientes.

Os três frontends carregam o `.env` da raiz pelo preload `scripts/load-env.mjs`. Evite acrescentar `--env-file` ou `--env-file-if-exists` ao comando Next.js: nesta versão, o servidor de desenvolvimento repassa essas flags para `NODE_OPTIONS` de seus subprocessos, causando encerramento com código 9. Variáveis já definidas no terminal têm precedência; a ausência do arquivo local é permitida.

## Verificar

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm db:migrate:test
pnpm test:integration
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:catalog
pnpm test:runtime
```

As integrações e `test:e2e:catalog` exigem `DATABASE_TEST_URL` apontando para um banco cujo nome termine em `_test`. `db:migrate:test` aplica as migrations somente nesse banco e não altera a configuração do banco de operação. `test:runtime` verifica a API compilada contra o banco configurado em `DATABASE_URL`. Nunca aponte testes para um banco de operação. As evidências estão em [MVP_VALIDATION.md](docs/MVP_VALIDATION.md) e no histórico [FOUNDATION_VALIDATION.md](docs/FOUNDATION_VALIDATION.md).

Execute as duas suítes de navegador em sequência: os previews usam portas 3100/3101; catálogo e agenda reais usam API 4200 e painel 3201. Os frontends de teste usam `.next-e2e`, separado do servidor de desenvolvimento. A suíte operacional percorre desktop e celular, inclusive confirmação cuja primeira resposta é perdida, e verifica a persistência no PostgreSQL.

## Arquitetura e evolução

- [Arquitetura](docs/ARCHITECTURE.md), [modelo de dados](docs/DOMAIN_MODEL.md) e [isolamento](docs/MULTI_TENANCY.md).
- [Theme Engine](docs/THEME_ENGINE.md), [design personalizado](docs/CUSTOM_DESIGN.md) e [segurança](docs/SECURITY.md).
- [Catálogo](docs/CATALOG.md) e [agenda operacional](docs/BOOKING_API.md).
- [Operação e deploy](docs/DEPLOYMENT.md), [roadmap](docs/ROADMAP.md) e [decisões registradas](docs/adr/0001-modular-monolith.md).

Antes de produção: configurar HTTPS, origens, proxy confiável e serviços externos; exercitar entrega de e-mail/filas, backups e restauração; realizar revisão de segurança do ambiente; e executar a CI no repositório remoto. Não há deploy de produção realizado por esta entrega.
