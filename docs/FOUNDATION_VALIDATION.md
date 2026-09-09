# Evidências e checklist da Foundation

Este documento preserva o histórico da Fase 0. A implementação e os resultados posteriores de catálogo e agenda estão em [MVP_VALIDATION.md](MVP_VALIDATION.md).

Execução local em **5 de setembro de 2026**, Windows, Node.js 24.19.0, pnpm 11.19.0 e PostgreSQL 18.4 temporário. O banco usa apenas fixtures e credenciais locais em `.local/`, ignorado pelo Git. A configuração Docker/CI usa PostgreSQL 17; essa variante ainda precisa ser executada na CI.

Resultado: **125 testes aprovados** — 91 unitários, 16 de banco, 12 de API e 6 de navegador. O gate `pnpm check` terminou com código 0, incluindo lint, typecheck, unit/integration e build. Testes de navegador e inicialização do artefato foram executados separadamente.

## Correção da inicialização local — 5 de setembro de 2026

O comando real `pnpm --filter @platform/web-public dev --port 3100` reproduziu o encerramento com código 9: `--env-file-if-exists= is not allowed in NODE_OPTIONS`. O Next.js 16.3.4 transferia a flag da linha de comando para `NODE_OPTIONS` do subprocesso. O Node.js 22.23.1 usado pelo pnpm global reconhecia a flag na CLI; portanto a causa desse encerramento era sua propagação pelo Next, e não a ausência da opção nessa versão do Node.

Os três frontends passaram a carregar o `.env` da raiz com `scripts/load-env.mjs`, via `--import`. O preload preserva variáveis já definidas e ignora somente arquivo ausente. O projeto também fixa Node.js 24.20.0 no Volta e em `devEngines.runtime`, com resolução e integridade no lockfile. Essa segunda configuração é necessária neste ambiente porque o pnpm global do Volta tinha seu próprio Node 22.23.1. `pnpm exec node --version`, inclusive dentro de `@platform/web-public`, confirmou `v24.20.0` após a instalação.

Validação da correção com o runtime final:

| Verificação | Resultado |
| --- | --- |
| Instalação com lockfile congelado | Passou; nenhuma atualização pendente. |
| Lint e fronteiras | Passaram. |
| Typecheck | Passou na raiz e nos 17 pacotes; 16 tarefas reutilizaram cache válido. |
| Testes unitários | 91/91 passaram. |
| Navegador com os comandos reais | 6/6 passaram em desktop e mobile. Playwright agora chama `pnpm dev` dos frontends, incluindo o preload e o Turbopack padrão. |
| Admin pelo comando raiz | `pnpm dev --filter=@platform/admin` iniciou; `/login` respondeu HTTP 200 com o formulário esperado. |
| Build | 17/17 tarefas passaram, sem reutilizar cache de build. |

Nenhuma verificação final dessa correção falhou. As 28 integrações de PostgreSQL/API e o teste da API compilada não foram repetidos nesta correção dos comandos de frontend; os resultados anteriores permanecem registrados abaixo. Os servidores temporários de validação foram encerrados. Banco, Redis e SMTP continuam sendo requisitos para os fluxos conectados; esta validação não comprova a operação conjunta desses serviços.

## Verificações de entrega

| Verificação | Resultado registrado |
| --- | --- |
| Instalação reproduzível com lockfile | `pnpm install --frozen-lockfile` passou. |
| Schema Prisma validado e client gerado | Prisma 7.10.0 validate/generate passaram; 43 modelos. |
| Migration aplicada em PostgreSQL real | Três migrations aplicadas: schema inicial, constraints/guards e identidade Better Auth por issuer. |
| Seed fictício e idempotente | Executado duas vezes, sem duplicação nem contas/senhas prontas. |
| Lint | `pnpm lint` passou, incluindo fronteiras entre apresentação e Core. |
| Typecheck | Passou para scripts/testes raiz e os 17 pacotes, incluindo testes da API. |
| Testes unitários | Vitest: 7 arquivos, 91 testes aprovados. |
| Testes de integração / constraints reais | PostgreSQL: 16 testes aprovados; API/Better Auth: 12 aprovados. Suíte conjunta: 28/28. Banco também testado em ordem aleatória. |
| Navegador | Playwright/Chromium: 6/6 em desktop e viewport móvel; navegação dos três temas, noindex, 404, responsividade e feedback de login. A resposta 401 da UI é interceptada; autenticação real é coberta separadamente pela API. |
| Build de todos os apps | `pnpm build` passou: três frontends Next.js, API/worker e pacotes compartilhados. |
| Artefato compilado | `scripts/smoke-build.mjs` passou: API compilada inicia e consulta PostgreSQL. `/health` respondeu ok; `/ready`, ready. |
| Tenant → apresentação no banco | API compilada retornou `imperial → bespoke-imperial v1` e `studio → urban v1` a partir do seed publicado. |
| Validação das 16 skills | YAML, nomes, descrições e links verificados com js-yaml. O validador Python da skill não pôde ser usado por ausência de PyYAML. |
| Docker Compose e imagem | Arquivos criados; Docker não está disponível nesta máquina, portanto não executados. |
| Worker / Redis / SMTP | Worker compilado carrega suas dependências e aguarda conexão com retries e logs limitados. Não houve Redis/SMTP ativo; consumo da fila e entrega SMTP não foram verificados. Auth usa provider de e-mail em memória nos testes. |
| CI remota | Workflow criado com PostgreSQL, Redis, instalação fixa, testes, build e smoke da API. Não houve execução em serviço remoto nem deploy. |

## Cenários críticos

- Sessão ausente, inválida, expirada ou revogada é recusada.
- Login/logout, verificação e recuperação de senha exercitam o fluxo real configurado.
- Usuário sem membership ativa não seleciona tenant por ID de entrada.
- Tenant A não lê nem modifica dados de B; a relação cruzada é recusada no banco.
- Permissão ausente é negada mesmo quando a feature está habilitada.
- Feature desconhecida/negada falha; override explícito prevalece sem depender do nome do plano.
- Host desconhecido/reservado não resolve tenant; hostname válido resolve o site correto.
- Tenant A e B renderizam temas/tokens independentes; bespoke alheio é recusado.
- Publicação/rollback de versão respeitam tenant e compatibilidade no nível efetivamente implementado.
- Jobs de autenticação pertencem à identidade global; notificações comerciais por tenant ainda precisam propagar contexto explicitamente na fase correspondente.

## Limites da declaração de conclusão

O ambiente temporário de PostgreSQL foi encerrado durante uma pausa; a suíte falhou por indisponibilidade nesse momento. O serviço foi reaberto e a suíte completa passou novamente. Os problemas encontrados de hostname/porta, identidade `Account.issuer`, versões Fastify, empacotamento ESM e dependência explícita Redis foram corrigidos antes do gate final. Não há testes ignorados na execução final.

Agenda transacional completa, Mercado Pago, Cloudflare, builder visual, upload produtivo e workflow persistido de aprovação de design permanecem futuros, conforme [ROADMAP.md](ROADMAP.md). A Foundation está implementada e os gates locais de código passaram; validação de Compose, operação da fila, SMTP, imagem Docker e CI remota permanecem pendentes antes do uso comercial. Não foi publicado ambiente de produção.
