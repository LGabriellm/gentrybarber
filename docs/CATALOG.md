# Catálogo operacional — primeiro incremento da Fase 1

Serviços e profissionais são gerenciados no painel de uma barbearia existente, por unidade. O backend exige sessão verificada, membership ativa, tenant ativo, entitlement `booking` e a permissão correspondente (`services.manage` ou `professionals.manage`). O nome do plano não participa da decisão.

## Contrato

Base: `/v1/tenants/:slug`. Todas as respostas são JSON sem cache. Os contratos públicos estão em `packages/types/src/catalog.ts`.

| Recurso | GET | POST | PATCH /:id |
| --- | --- | --- | --- |
| `/services` | `ServiceCatalog`, com itens e unidades | `CreateServiceInput` → item criado, HTTP 201 | `UpdateServiceInput` → item atualizado |
| `/professionals` | `ProfessionalCatalog`, com itens, unidades e opções de serviços | `CreateProfessionalInput` → item criado, HTTP 201 | `UpdateProfessionalInput` → item atualizado |

O PATCH recebe todos os campos editáveis e `expectedVersion`, obtido da última leitura. Edição concorrente retorna HTTP 409 (`CONFLICT`) e exige recarregar os dados. Unidade é escolhida na criação e não pode ser alterada posteriormente, preservando vínculos e histórico. Não existe exclusão física pela interface: o campo `active` permite desativar e reativar.

Nomes têm 1–120 caracteres após trim; descrição e bio admitem até 2.000 caracteres ou null; duração vai de 1 a 1.440 minutos; preço é inteiro em centavos entre 0 e 100.000.000. Cada profissional pode ter até 100 serviços distintos da mesma unidade e tenant. Serviços inativos podem manter seu vínculo para preservar a configuração, mas não ficam disponíveis no site público. Criação exige uma unidade ativa. Listas administrativas incluem registros inativos.

Campos de identidade e autoridade (`tenantId`, papel, membership, timestamps de criação e URLs de imagem) não são graváveis. Payloads com campos desconhecidos são rejeitados. Recursos ou relações alheias retornam 404. Escritas exigem `Content-Type: application/json` e `Origin` explicitamente permitido; origem ausente ou não confiável é recusada. O proxy do painel aceita apenas os recursos e métodos acima e valida a própria origem antes de encaminhar cookies.

Dados e auditoria são gravados na mesma transação. A auditoria registra ator, tenant, ação e recurso, sem copiar descrição, bio ou dados de sessão. O schema existente e suas FKs compostas já comportam este incremento; não há alteração persistente de schema.

## Experiência e limites

O painel apresenta formulários com feedback de salvamento, erro, estado vazio, filtro por unidade e edição de registros ativos ou inativos. Preço é exibido em reais e convertido para centavos antes do envio. O site público lê os serviços e profissionais ativos de unidades ativas, pelo mesmo Core.

O catálogo alimenta a [agenda interna](BOOKING_API.md), que oferece horários, clientes, disponibilidade e agendamentos no mesmo Core. Onboarding e criação/edição de unidades estão disponíveis; contas vinculadas aos profissionais continuam pendentes na Fase 1. A cobrança permanece na Fase 2. Mudanças no catálogo não alteram preço, duração ou nome já contratados em reservas.
