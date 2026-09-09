---
name: tenant-isolation
description: Implementar ou revisar proteção contra acesso e relacionamentos cruzados entre tenants em persistência, APIs, filas e cache.
---

# Isolamento

Usar [contrato de tenancy](../../../docs/MULTI_TENANCY.md) e [modelo](../../../docs/DOMAIN_MODEL.md). Exigir contexto servidor e escopo explícito em leitura, escrita, contagem, busca, export e lote; UUID/cuid não prova acesso.

Preservar FKs compostas que incluem tenant e unidade quando aplicável. Revisar nested writes e SQL direto; não depender apenas de middleware ORM. Chaves de cache e caminhos de objetos carregam tenant.

Demonstrar A tentando ler, alterar e relacionar recursos de B. Testar constraints no PostgreSQL real. Não revelar existência de recurso alheio na resposta. Não anunciar RLS como ativa sem implementação verificável.
