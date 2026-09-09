---
name: database
description: Alterar schema Prisma, migrations PostgreSQL, índices, seed e integridade de relações da plataforma.
---

# Banco de dados

Ler [DOMAIN_MODEL.md](../../../docs/DOMAIN_MODEL.md) e o schema atual. Toda alteração persistente exige migration versionada. Não substituir entrega de migration por db push.

Usar tenant_id e location_id quando aplicável, índices de busca escopados e FKs compostas. Identidade/roles globais não tornam os dados operacionais globais. Valores monetários usam precisão exata; instantes persistem em UTC.

Validar schema, gerar client e aplicar migration em PostgreSQL real. Checks, triggers e exclusion constraints fora da DSL Prisma ficam explícitos no SQL. Testar invariantes relevantes e seed idempotente fictício. Planejar compatibilidade e recuperação antes de alteração destrutiva.
