---
name: code-review
description: Revisar mudanças do projeto procurando regressões demonstráveis em isolamento, regras do Core, contratos e validação.
---

# Code review

Ler o diff e os contratos afetados antes de concluir. Aplicar [AGENTS.md](../../../AGENTS.md), distinguindo bug acionável de preferência estilística.

Verificar contexto tenant em queries/jobs/cache, permissão no backend, feature sem nome de plano, FKs/migrations, adapter externo e ausência de regra de negócio em tema. Conferir ownership/versionamento de bespoke e projeção de dados públicos.

Relatar problema com cenário, consequência e localização precisa. Pedir teste adicional quando há uma hipótese material, não para cobrir mudança trivial. Conferir lint/typecheck/tests/build e reconhecer limites da evidência. Não inventar vulnerabilidades ou declarar produção segura a partir de build verde.
