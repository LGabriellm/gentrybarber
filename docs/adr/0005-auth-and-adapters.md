# ADR 0005 — Identidade gerenciada e integrações por adapter

Status: aceito para a Foundation.

## Contexto

Autenticação robusta exige ciclo de sessão, recuperação de senha e verificação de identidade. Mensageria, cobrança, DNS e storage têm falhas e contratos de fornecedores distintos.

## Decisão

Usar Better Auth para identidade/sessão e manter membership/RBAC de negócio explicitamente na plataforma. Não implementar senha/sessão próprias nos temas ou frontends. Integrar e-mail por contrato de notificações e adapter SMTP; usar Mailpit local. Processamento assíncrono usa Redis/BullMQ.

Mercado Pago, Cloudflare for SaaS e storage R2/S3 terão adapters. Contratos não devem fingir sucesso quando um provider está ausente. Credenciais vêm do ambiente e não atravessam o modelo público de apresentação.

## Consequências

Separar identidade de autorização evita que existência de sessão implique acesso a qualquer empresa. Adapters permitem testes locais e troca de provider, mas a integração real ainda precisa de testes de contrato, retry e observabilidade. Webhooks exigem assinatura e idempotência; jobs tenant-scoped preservam e revalidam contexto. 2FA, passkeys e OAuth ficam preparados para evolução, sem promessa de ativação na Foundation.
