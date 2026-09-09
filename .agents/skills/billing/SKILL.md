---
name: billing
description: Implementar assinaturas, taxas, provider de pagamento, webhooks e ligação entre cobrança e entitlements.
---

# Billing

Ler [BILLING.md](../../../docs/BILLING.md). Usar BillingProvider e adapter do fornecedor; valores, setup fee e custom design fee são configuráveis e representados de forma exata.

Verificar assinatura do webhook, persistir evento único por provider, processar com idempotência e considerar eventos atrasados. Resolver tenant por vínculo externo confiável, nunca por tenant_id arbitrário no payload. Redirect não confirma pagamento.

Definir regras de upgrade, downgrade, carência e suspensão antes de codificá-las. Feature depende de chave, override e plano, não nome comercial. Testar retries, falha parcial, duplicação, desordem e reconciliação; não apresentar contrato sem provider como integração real.
