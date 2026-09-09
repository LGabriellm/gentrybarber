---
name: devops
description: Configurar ambiente local, CI, artefatos, migrations e operação de API, worker e frontends compartilhados.
---

# DevOps

Ler [DEPLOYMENT.md](../../../docs/DEPLOYMENT.md). Preservar instalação reproduzível com lockfile e toolchain declarada. Compose local inclui PostgreSQL, Redis, MinIO e Mailpit; secrets reais ficam fora do Git.

CI valida schema/migrations, lint, tipos, testes e build. Distinguir workflow criado de execução remota observada. Separar liveness de readiness e não afirmar dependência saudável sem verificá-la.

Release usa artefatos imutáveis, migrations compatíveis, health checks e rollback previsto. Rollback de app não desfaz banco; rollback de tema é separado. Respeitar ambiente e autorização existentes antes de publicar. Não criar infraestrutura/deploy por tenant ou complexidade sem necessidade demonstrada.
