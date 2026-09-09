# Instruções do projeto

O Core é compartilhado. A experiência pode ser única. Construímos uma plataforma SaaS multi-tenant, modular e white-label; o nome comercial provisório não é uma regra de domínio.

## graphify

- **graphify** (`~/.Codex/skills/graphify/SKILL.md`) transforma entradas em um grafo de conhecimento. Gatilho: `/graphify`.
- Quando o usuário digitar `/graphify`, usar a skill graphify instalada ou suas instruções antes de fazer qualquer outra coisa. Se o caminho histórico não existir, localizar a instalação disponível, sem inventar resultados de um grafo.

## Regras obrigatórias

1. Isolamento entre tenants é obrigatório em leitura, escrita, relações, cache, arquivos e jobs.
2. O backend é a fonte de verdade para identidade, autorização e regras comerciais.
3. Não hardcode planos; nomes comerciais e composição vêm de dados configuráveis.
4. Não hardcode preços, mensalidade, implantação ou taxa de design.
5. Usar o Feature Engine; uma permissão de usuário não substitui o entitlement do tenant.
6. Custom design nunca pode quebrar o Core.
7. Não criar aplicação, backend, banco ou deploy duplicado por tenant no MVP.
8. Não adicionar regras de negócio, acesso ao banco ou secrets em temas.
9. Mudança persistente de schema exige migration versionada e estratégia de compatibilidade.
10. Toda feature crítica exige teste do comportamento e de suas falhas relevantes.
11. Toda integração externa deve possuir adapter com contrato explícito.
12. Nenhuma secret, token real ou dado pessoal de produção no Git.
13. Validar inputs na fronteira; rejeitar campos e formatos não previstos.
14. Verificar permissões no backend, após sessão e membership ativa no tenant.
15. Executar lint, typecheck, tests e build antes de concluir; registrar separadamente o que passou, falhou ou não pôde ser executado.

## Escopo e contratos

- A etapa atual é Fase 1 — MVP, iniciada pelo catálogo de serviços e profissionais. Consultar [roadmap](docs/ROADMAP.md) e [contrato do catálogo](docs/CATALOG.md) antes de ampliar o escopo comercial; os limites operacionais da Foundation continuam registrados.
- Arquitetura e decisões estão em [ARCHITECTURE.md](docs/ARCHITECTURE.md) e [docs/adr](docs/adr/0001-modular-monolith.md).
- Toda operação tenant-scoped recebe contexto construído no servidor. IDs recebidos do cliente apenas selecionam candidatos e nunca provam acesso.
- Temas são código registrado e revisado; configuração do tenant é dado validado. Não executar HTML/JavaScript arbitrário enviado pelo tenant.
- Não relatar protótipos, modelos de banco ou contratos de adapter como integrações de produção concluídas.

## Papéis conceituais

| Papel | Responsabilidade e entrega |
| --- | --- |
| PRODUCT | Problema, público, escopo, regras e critérios de aceitação. |
| ARCHITECT | Fronteiras dos módulos, contratos, ADRs e simplicidade operacional. |
| DATABASE | Modelo, constraints, migrations, índices e integridade entre tenants. |
| BACKEND | Casos de uso, APIs, autorização, validação e adapters. |
| FRONTEND | Fluxos acessíveis e responsivos consumindo contratos do Core. |
| DESIGN / DESIGN_AGENT | Briefing, referências, direção visual, tokens, tipografia, hierarquia, mobile e acessibilidade. |
| THEME ENGINE / THEME_ENGINE_AGENT | Registry, renderer, tenant → design, versões e limites seguros da apresentação. |
| BILLING | Assinaturas, pagamentos, idempotência e reconciliação com provider. |
| DOMAIN | DNS, ownership de hostname, Cloudflare, SSL e canonical. |
| SECURITY | Ameaças concretas, isolamento, sessões, inputs e revisão das fronteiras. |
| QA | Evidências dos critérios de aceitação e regressões críticas. |
| DEVOPS | Ambiente, CI, releases, observabilidade, backups e recuperação. |

Esses papéis descrevem responsabilidades, não exigem processos ou agentes separados. Ao delegar, definir arquivos, contrato e resultado esperado; respeitar alterações simultâneas.

## Fluxos de trabalho

- Feature visual: PRODUCT → DESIGN → ARCHITECT → THEME ENGINE → FRONTEND → SECURITY → QA.
- Feature de negócio: PRODUCT → ARCHITECT → DATABASE → BACKEND → FRONTEND → SECURITY → QA.
- Antes de editar, ler apenas as skills relevantes em `.agents/skills/<nome>/SKILL.md`. Os arquivos `.agents/skills/<nome>.md` preservam os nomes solicitados no briefing e apontam para essas entradas descobríveis.
- Terminar com mudanças observáveis, verificações executadas, limitações materiais e atualização da documentação afetada.
