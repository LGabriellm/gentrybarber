# Hostnames e domínios próprios

Um site público é resolvido por hostname. O dashboard e a administração usam origens próprias; hostname não substitui sessão ou membership para ações privadas. A base de domínio da plataforma é configurável, sem depender do nome comercial provisório.

## Subdomínio

Wildcard direciona os subdomínios à mesma infraestrutura. Um slug de tenant precisa ser único, normalizado e validado. Reservar `www`, `api`, `admin`, `app`, `dashboard`, `status`, `support`, `cdn`, `assets`, `mail` e `preview`. Slug reservado ou host desconhecido deve resultar em recusa, nunca fallback para um tenant real.

O resolver deve retirar porta apenas de formato válido, tratar caixa e validar rótulos. A aplicação recebe o hostname de um proxy com política explícita; qualquer header encaminhado pelo cliente precisa ser removido/substituído no ingresso.

### Hostnames reservados da plataforma

Produção separa as superfícies por hostname, todos apontando para o mesmo ingresso da VPS:

| Registro DNS | Destino | Uso |
| --- | --- | --- |
| `@` e `www` | IP público da VPS | Estado/entrada da plataforma; não escolhe tenant |
| `api` | IP público da VPS | API HTTPS; readiness e OpenAPI permanecem privados |
| `dashboard` | IP público da VPS | Operação autenticada da barbearia |
| `admin` | IP público da VPS | Back-office global |
| `app` | IP público da VPS | Redirecionamento canônico para `dashboard` |
| `*` | IP público da VPS | Sites publicados por slug de tenant |

Usar registros `A` para IPv4 e criar `AAAA` apenas quando a VPS realmente atender o IPv6 informado. Um `AAAA` antigo ou apontando para outro servidor pode fazer dispositivos com IPv6 falharem enquanto clientes IPv4 funcionam. Os registros exatos prevalecem sobre o wildcard e devem existir antes de ativar o Caddyfile.

API, dashboard, admin e app usam HTTPS por certificados exatos. Subdomínios da plataforma usam TLS on-demand: Caddy consulta a API em loopback e só emite certificado para tenant ativo cujo site e versão estejam publicados e cujo entitlement `website` esteja habilitado. O endpoint de autorização rejeita nomes reservados, desconhecidos e domínios customizados; estes continuam no fluxo da Fase 4. Não habilitar HSTS com `includeSubDomains` no apex.

## Custom domain — Fase 4

Usar adapter de Cloudflare for SaaS / Custom Hostnames. O fluxo planejado é adicionar hostname → instruções DNS → comprovar controle → verificar DNS → provisionar SSL → ativar. Estados: `PENDING`, `WAITING_DNS`, `VERIFYING`, `ACTIVE`, `FAILED`, `SUSPENDED`.

Somente hostname ativo e pertencente ao tenant pode resolver conteúdo. Verificação de ownership é distinta de DNS apontado, emissão de certificado e ativação. Proibir duplicidade entre tenants e reutilização indevida de domínio removido. Jobs de verificação precisam de retry limitado, motivo de falha observável e contexto tenant.

O `Domain`/`DomainVerification` inicial e o resolver não equivalem a provisionamento Cloudflare concluído. Exigir feature `custom_domain` no backend para configurar e ativar domínio; políticas de downgrade precisam ser claras antes da operação comercial.

## SEO e segurança

O canonical aponta para o domínio público primário ativo do tenant; os endereços secundários terão redirecionamento coerente para evitar duplicidade. Sitemap, OpenGraph e metadados de negócio local são gerados a partir dos dados publicáveis e do hostname validado. Nunca construir redirect absoluto confiando em host não verificado.

Cookies de sessão permanecem restritos às origens autenticadas apropriadas; custom domain público não recebe cookies administrativos. Preview deve usar acesso limitado e `noindex`; certificado válido não significa autorização de acesso a conteúdo privado.

Antes da ativação produtiva: conferir DNS, certificado, ownership, tenant correto, canonical, redirecionamentos, revogação, observabilidade e isolamento com dois tenants.
