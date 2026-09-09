# Multi-tenancy e Feature Engine

## Fronteiras de confiança

O tenant identifica a empresa, não uma sessão do navegador. Um `tenant_id` enviado por header, query ou JSON nunca concede acesso. IDs fornecidos pela UI servem apenas para selecionar um tenant candidato e são conferidos com identidade e memberships do servidor.

### Site público

1. Normalizar o hostname: caixa, porta e formato aceito.
2. Rejeitar hostname inválido, reservado ou fora da política de endereços.
3. Resolver o subdomínio registrado ou um custom domain verificado e ativo.
4. Carregar um contexto público com somente dados publicáveis.
5. Resolver a configuração publicada e o renderer permitido.

`Host` e headers encaminhados não são identidade autenticada. Um proxy confiável deve substituir headers encaminhados; a API não deve confiar cegamente em `x-forwarded-host` vindo da internet. Slugs reservados incluem `www`, `api`, `admin`, `app`, `dashboard`, `status`, `support`, `cdn`, `assets`, `mail` e `preview`. Host desconhecido não escolhe tenant padrão.

### Operação autenticada

```text
Sessão válida → usuário → membership ativa → tenant ativo
             → permissão da ação → feature disponível → caso de uso
```

O contexto autenticado é criado no backend após essa verificação. Toda consulta por ID inclui o tenant do contexto. Listas, contagens, buscas, exports e operações em lote precisam da mesma proteção. Erros de acesso a recurso alheio não devem confirmar sua existência.

## Persistência, cache e jobs

Repositórios tenant-scoped recebem contexto obrigatório e adicionam o filtro explicitamente. Evitar middleware implícito que não cobre nested writes, raw SQL ou relações. Chaves estrangeiras compostas garantem coerência entre as entidades relacionadas. Qualquer SQL direto exige escopo e revisão equivalentes.

Cache deve incluir tenant, recurso e versão relevante; nunca compartilhar resposta autenticada por pathname. Caminhos de objetos e jobs incluem tenant. O worker reconstrói um contexto válido e verifica que o recurso do payload pertence à empresa; não confia apenas no tenant serializado. Logs não devem vazar payloads ou dados de outras empresas.

## Feature Engine

A avaliação de `hasFeature(tenantId, feature)` é decidida no backend: tenant elegível, override explícito válido e, na ausência dele, vínculo `PlanFeature` do plano aplicável. Uma negação explícita prevalece mesmo quando o plano permite. Feature desconhecida ou ausência de vínculo resulta em negação. A política de suspensão e grace period deverá ser formalizada com billing antes do uso comercial.

Chaves estáveis incluem `website`, `booking`, `customers`, `advanced_site_builder`, `custom_domain`, `custom_design`, `custom_pages`, `custom_css`, `premium_animations`, `white_label`, `finance`, `commissions`, `inventory`, `loyalty`, `coupons`, `reviews`, `analytics`, `whatsapp_automation` e `multi_location`. O nome comercial do plano nunca entra no predicado.

Feature, role e permissão são dimensões distintas: ter o módulo de billing não concede a todo membro `billing.read`. Um menu escondido é conveniência da interface; a API continua obrigada a negar a operação.

## Evidência exigida

Cobrir A lendo/escrevendo B, membership removida, sessão ausente, permissão ausente, feature negada, relação cruzada recusada pelo banco, hostname desconhecido e seleção correta de tema. RLS não foi escolhida como a barreira primária da Foundation; sua adoção futura exige transações e contexto seguros para pool de conexões.
