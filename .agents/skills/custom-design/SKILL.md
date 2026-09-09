---
name: custom-design
description: Criar ou evoluir apresentações bespoke por cliente, preservando Core compartilhado, preview, versão e reversibilidade.
---

# Custom design

Seguir [CUSTOM_DESIGN.md](../../../docs/CUSTOM_DESIGN.md). Builder é configuração pelo cliente; bespoke é implementação visual pela equipe.

1. Nunca criar novo backend para site customizado.
2. Nunca duplicar regras de negócio.
3. Concentrar customização na apresentação.
4. Reutilizar componentes Core quando adequados.
5. Criar componente bespoke somente quando necessário.
6. Todo design precisa ser responsivo.
7. Todo design precisa possuir preview.
8. Todo design precisa possuir versão.
9. Toda alteração precisa ser reversível.

Vincular renderer exclusivo ao tenant. Não permitir JS arbitrário, banco ou secrets em tema. Preview usa acesso limitado e noindex; aprovação identifica uma versão. Publicação só ocorre dentro do escopo autorizado e após a validação da entrega.
