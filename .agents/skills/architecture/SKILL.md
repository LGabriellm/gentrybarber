---
name: architecture
description: Projetar ou alterar fronteiras, contratos e decisões estruturais do monorepo SaaS de barbearias.
---

# Arquitetura

Consultar [arquitetura](../../../docs/ARCHITECTURE.md) e ADRs antes de mudar fronteiras. Preservar monólito modular, Core compartilhado, apps separados e dependências explícitas entre pacotes.

Definir caso de uso, módulo proprietário, contrato e dados envolvidos. Impedir import de Prisma, providers ou secrets nos temas e bundles públicos. Não criar backend, banco ou deploy por tenant.

Para decisão estrutural, registrar contexto, alternativa descartada e consequência em ADR. Distinguir schema/contrato de funcionalidade operacional. Implementar apenas a fase autorizada no roadmap.
