# ADR 0001 — Monólito modular em monorepo

Status: aceito para a Foundation.

## Contexto

O produto combina agenda, cobrança e apresentação por tenant e precisa evoluir sem multiplicar infraestrutura por barbearia. A equipe ainda não tem uma necessidade demonstrada de deploy independente por domínio de negócio.

## Decisão

Usar TypeScript, pnpm e Turborepo; Next.js nos três frontends; NestJS/Fastify na API; PostgreSQL/Prisma para persistência. Módulos oferecem contratos internos. Worker BullMQ é processo separado para tarefas assíncronas, reutilizando contratos e adapters do monorepo.

## Alternativas e consequências

Microsserviços adicionariam autenticação entre serviços, observabilidade distribuída e consistência eventual antes de haver benefício comprovado. Uma aplicação inteira por tenant duplicaria manutenção e impediria upgrades uniformes. Um frontend único sem fronteiras confundiria origens públicas e administrativas.

O monólito facilita transações e desenvolvimento, mas exige disciplina de dependências. Revisar importações, evitar ciclos e não expor Prisma nos temas. Extrair serviço futuramente apenas com evidência de carga, confiabilidade ou autonomia operacional; não por quantidade de tenants isoladamente.
