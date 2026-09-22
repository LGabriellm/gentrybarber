# ADR 0009 — Ingresso produtivo e hostnames de serviço

Status: aceito para o MVP.

## Contexto

O primeiro deploy expunha API e frontends diretamente nas interfaces públicas da VPS nas portas 3000, 3001, 3002 e 4000. O Caddy atendia somente HTTP e encaminhava qualquer subdomínio, inclusive nomes reservados, ao site público. Isso permitia contornar headers e políticas do ingresso, tornava a origem de autenticação dependente de IP/porta e agregava ou falsificava identidade de cliente quando a confiança no proxy era configurada de forma ampla.

## Decisão

Caddy é o único ingresso público, nas portas 80 e 443. Os containers continuam usando suas portas internas estáveis, mas as publicações no host ficam restritas a `127.0.0.1` e são configuradas separadamente:

| Componente | Porta no container | Porta padrão no host | Hostname público |
| --- | ---: | ---: | --- |
| Site público | 3000 | 3000 | `<tenant>.<PLATFORM_DOMAIN>` |
| Dashboard | 3000 | 3001 | `dashboard.<PLATFORM_DOMAIN>` |
| Admin | 3000 | 3002 | `admin.<PLATFORM_DOMAIN>` |
| API | 4000 | 4000 | `api.<PLATFORM_DOMAIN>` |

`app.<PLATFORM_DOMAIN>` redireciona para o dashboard. O apex e `www` não selecionam tenant. Hostnames reservados recebem rotas exatas antes do wildcard de tenants.

API, dashboard, admin, app, apex e www usam certificados automáticos para hostnames exatos. Sites de tenants usam TLS on-demand por hostname individual: antes de emitir um certificado, Caddy consulta um endpoint interno que aceita somente subdomínio da plataforma pertencente a tenant ativo, com entitlement `website`, tema ativo e versão publicada. Requisições HTTP de tenants redirecionam para HTTPS. HSTS não usa `includeSubDomains` para não antecipar a ativação de domínios customizados.

O ingresso substitui os headers `X-Forwarded-*`, e a API confia somente no endereço `/32` do gateway Docker descoberto pelo deploy. `/ready` e `/openapi.json` não são publicados no hostname da API. Autenticação de dashboard e admin é roteada diretamente à API somente para a allowlist de endpoints já suportada pelo produto.

## Alternativas descartadas

- Publicar portas altas e depender apenas de UFW: regras geradas pelo Docker podem contornar expectativas do firewall, e clientes podem evitar o proxy.
- Confiar em todas as redes privadas como proxy: outro processo ou container poderia fornecer IP de cliente arbitrário.
- Ativar HSTS com `includeSubDomains`: anteciparia uma garantia que ainda não cobre domínios customizados e reduziria a reversibilidade da migração.
- Emitir certificados wildcard manualmente: renovação manual é um risco operacional. A evolução deve usar DNS-01 automatizado ou on-demand TLS com endpoint de autorização.

## Consequências

DNS precisa declarar registros exatos para `api`, `dashboard`, `admin` e `app`, além de apex, `www` e wildcard. O primeiro acesso HTTPS de cada tenant pode aguardar a emissão inicial do certificado. O deploy falha se URLs de autenticação não corresponderem aos hostnames HTTPS ou se a confiança de proxy estiver ampla. A porta direta da API deixa de ser um health check externo; CI valida o ingresso HTTPS e confirma que a porta 4000 está fechada publicamente.
