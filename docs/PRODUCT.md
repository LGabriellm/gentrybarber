# Produto e limites da Foundation

A plataforma transforma a presença digital, a operação e o relacionamento de barbearias em uma experiência profissional e personalizada. O nome provisório **BarberHub** é uma identidade comercial configurável; não determina IDs de features, regras ou contratos.

Cada tenant representa uma empresa. Cada unidade pertence a um tenant. Usuários podem participar de mais de uma empresa por memberships explícitas. A infraestrutura, a autenticação e as regras permanecem compartilhadas. O site público pode expressar uma identidade inteiramente diferente em cada tenant.

## Três camadas de personalização

| Camada | Quem configura | Limite |
| --- | --- | --- |
| Template | Cliente | Tema registrado, marca, textos, imagens e opções permitidas. |
| Advanced customization | Cliente | Builder de componentes controlados, variantes, tokens e composição validada. |
| Bespoke / Custom design | Equipe da plataforma | Implementação visual própria, revisada e versionada; consome o mesmo Core. |

Builder e bespoke têm jornadas comerciais e operacionais diferentes. Um tenant não recebe código executável livre, backend exclusivo ou fork. Páginas personalizadas também obedecem às fronteiras de segurança da apresentação.

## Escopo da Fase 0

A Foundation estabelece monorepo, schema e migration inicial, autenticação, contexto tenant, RBAC, features, registry de temas, renderização mínima, ambiente local, CI, testes críticos e documentação. A comprovação central é: dois tenants compartilham a infraestrutura, mantêm acesso separado e resolvem suas apresentações independentemente.

Não há promessa de operação comercial completa nesta fase. Cadastro operacional, agenda, cobrança real, builder visual, custom domain provisionado, aprovação de design em produção e painel comercial completo pertencem às próximas fases. Uma entidade no schema ou um contrato de adapter não significa que seu fluxo de produto já funciona.

## Modelo comercial

Planos, valores, setup fee e custom design fee serão administráveis no banco. START, PRO, PREMIUM e NETWORK são exemplos de posicionamento, não condições em código. O backend decide o acesso por chaves como `booking`, `custom_domain` e `custom_design`.

Os resultados esperados do MVP são onboarding de uma barbearia, site público confiável e agendamento sem conflito. A operação com cliente pagante depende também da etapa de cobrança. A evolução completa e seus gates estão em [ROADMAP.md](ROADMAP.md); as evidências atuais em [FOUNDATION_VALIDATION.md](FOUNDATION_VALIDATION.md).
