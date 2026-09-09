---
name: theme-engine
description: Alterar Theme Registry, resolução de renderer, tokens e modelos de versão ou rollback da apresentação por tenant.
---

# Theme Engine

Consultar [THEME_ENGINE.md](../../../docs/THEME_ENGINE.md). Registrar renderers como código revisado; banco armazena dados validados. Não fazer import arbitrário a partir de ID ou URL do tenant.

Resolver renderer com contexto confiável e ownership explícito para bespoke. Entregar ao tema somente a projeção pública do Core. Validar tokens e impedir mutação de defaults compartilhados.

Publicação exige versão aprovada, compatível e do tenant; rollback preserva histórico e escolhe versão publicada anterior válida. Distinguir funções puras da integração persistida ainda necessária. Testar dois tenants, renderer incorreto, isolamento de tokens e rollback.
