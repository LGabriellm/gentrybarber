# Theme Engine

## Contrato de apresentação

O Theme Registry relaciona um identificador estável a um renderer incluído no código revisado da plataforma. Banco guarda seleção, metadados e configuração; não guarda JavaScript executável. Alterar `theme_id` não autoriza carregar um módulo externo, fazer import arbitrário ou executar consultas pelo tema.

```text
Hostname → Tenant Resolver → SiteConfiguration publicada
         → Theme Registry → tokens validados → renderer
         → componentes de apresentação → contratos do Core
```

O renderer recebe um modelo de dados público e limitado, com marca, serviços publicáveis, equipe e informações da unidade. Dados privados de sessão, clientes, billing ou credenciais não fazem parte desse contrato. A ação de agendar passa por um componente/contrato do Core e pela Booking API; nunca calcula disponibilidade no tema.

## Registry e seleção

Temas standard, premium e bespoke podem coexistir no mesmo registro. Um tema bespoke tem vínculo explícito com seu tenant, evitando que outro tenant selecione o renderer exclusivo apenas conhecendo seu ID. Um renderer indisponível deve falhar de forma controlada; uma eventual alternativa segura precisa estar documentada e não pode trocar silenciosamente uma identidade publicada.

O teste mínimo da Foundation deve comprovar que tenants distintos resolvem apresentações distintas e que personalização de um não altera o outro. O registry inicial e tokens são a fundação técnica; catálogo comercial, editor visual e distribuição de pacotes de terceiros estão fora da Fase 0.

Os contratos de código são `ThemeRegistry.register/get/list/resolve`, `ThemeDefinition`, `ThemeAccessContext` e `PublicSiteData`. A definição declara `Renderer`, tokens, capabilities, requiredFeatures e, para exclusividade, `allowedTenantIds`. O contexto com tenant, themeId, allowedThemeIds e features vem do backend confiável. IDs iniciais do catálogo são `classic`, `urban` e `bespoke-imperial`; nomes do catálogo não são nomes de planos.

## Versões e publicação

Uma `ThemeVersion` identifica uma revisão imutável e compatível do tema/configuração. A configuração do site guarda a versão publicada. Draft e preview não substituem a versão ativa. Aprovação e publicação são ações diferentes e exigem autorização própria, ownership e registro auditável.

Rollback troca a referência publicada para uma versão anterior válida do mesmo escopo. Não apaga história e não reverte automaticamente migrations do Core. `createThemeVersion`, `transitionThemeVersion`, `createThemeHistory`, `appendThemeVersion`, `publishThemeVersion` e `rollbackThemeVersion` modelam esse contrato com snapshots imutáveis. Ainda são necessários persistência transacional, endpoint, auditoria e preview autenticado para um workflow produtivo.

O estado do workflow de design (`BRIEFING`, `DESIGN`, `DEVELOPMENT`, `REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`) não deve ser persistido diretamente como `ThemeVersion.status`. No banco, a versão usa `DRAFT`, `PREVIEW`, `APPROVED`, `PUBLISHED`, `ARCHIVED`; `DesignBrief.status` guarda o workflow do projeto. A integração usa mapeamento explícito: briefing/design/desenvolvimento/alterações → draft; review → preview; aprovado e publicado → seus equivalentes. Arquivamento é ação de persistência futura, separada do briefing.

Antes de publicar: validar schema dos tokens, compatibilidade da versão com renderer, acesso ao tema, assets, mobile, navegação por teclado e isolamento. Chaves de cache incluem tenant e versão publicada; publicação e rollback invalidam a entrada correspondente.

## Dependências permitidas

`themes` depende de `theme-engine`, `design-system`, `ui` e tipos públicos. Temas não dependem de Prisma, providers de pagamento, secrets, repositórios ou implementação de autenticação. O Core não deve importar um renderer de cliente específico. Detalhes da jornada bespoke estão em [CUSTOM_DESIGN.md](CUSTOM_DESIGN.md).
