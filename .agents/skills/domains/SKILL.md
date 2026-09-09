---
name: domains
description: Implementar subdomínios, custom hostnames, verificação DNS/SSL, resolução segura e canonical por tenant.
---

# Domínios

Ler [DOMAINS.md](../../../docs/DOMAINS.md). Normalizar e validar hostname, rejeitar slugs reservados e garantir unicidade global. Não escolher tenant padrão para host desconhecido.

Usar adapter Cloudflare for SaaS na integração futura. Distinguir ownership, DNS, certificado e ativação. Apenas domínio ativo do tenant resolve site; configurar exige feature e permissão.

Jobs de verificação são tenant-scoped, com retry limitado e erro rastreável. Conferir revogação e reuso após remoção. Canonical usa domínio primário validado; cookies administrativos não alcançam custom domains públicos. Preview usa noindex e acesso limitado.
