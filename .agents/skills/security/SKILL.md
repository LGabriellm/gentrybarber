---
name: security
description: Revisar ou implementar controles concretos de sessão, autorização, validação e isolamento nas fronteiras da plataforma.
---

# Segurança

Ler [SECURITY.md](../../../docs/SECURITY.md). Priorizar risco de acesso cruzado: sessão válida, membership ativa, tenant, permissão e feature são verificações distintas. SUPER_ADMIN é autoridade global controlada, não role criada pelo tenant.

Validar inputs e campos graváveis; evitar mass assignment. Conferir cookies, origens, CSRF, CSP, headers e limites nas respostas/rotas efetivas. Não imprimir ou versionar secrets nem dados reais de clientes.

Temas não acessam banco, secrets ou JS arbitrário do tenant. Webhook exige assinatura/idempotência; uploads produtivos exigem MIME real, limites e escopo. Relatar vulnerabilidade com cenário reproduzível e impacto; distinguir proteção planejada de implementada e testada.
