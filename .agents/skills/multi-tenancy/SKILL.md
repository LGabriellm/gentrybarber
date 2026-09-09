---
name: multi-tenancy
description: Implementar resolução pública por hostname, Tenant Context autenticado e propagação do tenant entre módulos e jobs.
---

# Multi-tenancy

Seguir [MULTI_TENANCY.md](../../../docs/MULTI_TENANCY.md). Hostname resolve somente dados públicos; sessão e membership ativa autorizam ações privadas. IDs de tenant do cliente são candidatos, nunca autoridade.

Construir contexto no backend antes do caso de uso. Conferir tenant ativo, permissão e feature separadamente. Preservar contexto em jobs, cache, storage, logs e operações em lote.

Rejeitar hostname desconhecido/reservado e headers encaminhados sem proxy confiável. Cobrir dois tenants na validação. Para grants, usar override explícito válido e depois feature do plano; desconhecido nega, sem condicionais por nome comercial.
