# ADR 0002 — Banco compartilhado e isolamento explícito

Status: aceito para a Foundation.

## Contexto

Empresas compartilham infraestrutura e usuários podem ter memberships em várias empresas. Um ID opaco ou filtro feito no frontend não é uma barreira de acesso. Relações incorretas precisam ser recusadas também pelo banco.

## Decisão

Usar um PostgreSQL compartilhado, `tenant_id` nas entidades da empresa e `location_id` quando a unidade for parte do domínio. Construir contexto autenticado a partir de sessão e membership ativa. Usar repositórios com escopo explícito e chaves estrangeiras compostas para relações entre entidades tenant-scoped.

Resolver hostname somente para contexto público; operações autenticadas verificam usuário, membership, permissão e feature. Contexto acompanha jobs, cache e storage.

## Alternativas e consequências

Banco por tenant aumenta provisionamento e migrations; fica fora do MVP. Middleware ORM genérico pode esconder lacunas de nested writes e raw SQL; não será a única defesa. RLS pode reforçar isolamento futuramente, mas requer contexto transacional seguro em conexão compartilhada.

O custo da abordagem é repetir escopo deliberadamente nos pontos de acesso e testar esse contrato. A vantagem é uma autorização auditável, com integridade de relações no PostgreSQL. Testes precisam cobrir leitura, escrita e relação A/B no banco real.
