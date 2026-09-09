---
name: frontend-ui
description: Implementar fluxos Next.js de site público, dashboard ou admin com contratos do Core, estados de interface e acessibilidade.
---

# Frontend

Consultar [arquitetura](../../../docs/ARCHITECTURE.md) e [design system](../../../docs/DESIGN_SYSTEM.md). Separar site por hostname, dashboard de memberships e administração da plataforma.

Consumir projeções e APIs públicas; não importar Prisma ou secrets no client. Um menu oculto não autoriza a API. Evitar estados locais que simulem pagamento, publicação ou agendamento concluídos sem retorno do backend.

Implementar carregamento, vazio, erro e sucesso necessários ao fluxo. Manter navegação por teclado, labels, foco e mobile. Validar inputs na UI para experiência e repetir validação de confiança no backend. Identificar claramente demonstrações e etapas futuras.
