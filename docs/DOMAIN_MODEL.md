# Modelo de domínio inicial

O [schema Prisma](../packages/database/prisma/schema.prisma) e suas migrations são a fonte executável dos nomes, tipos e constraints. O modelo inicial contém 43 entidades, incluindo tabelas de identidade/rate limit do Better Auth e associação de roles/permissões. Este documento explica o agrupamento e os invariantes. Entidades de fases futuras podem estar modeladas sem endpoints, telas ou processamento correspondente.

## Propriedade dos dados

| Grupo | Entidades | Invariante |
| --- | --- | --- |
| Identidade global | User, Session, Account, Verification | Um usuário pode participar de vários tenants; identidade não concede acesso a nenhum tenant isoladamente. |
| Empresa e acesso | Tenant, Location, Membership, Role, Permission | Membership ativa liga usuário e tenant; unidade pertence à empresa; permissão é verificada no backend. |
| Entitlements | Plan, Feature, PlanFeature, TenantFeatureOverride | Nome e preço do plano não determinam acesso. Override explícito prevalece sobre feature do plano. |
| Receita | Subscription, Payment, BillingEvent | Eventos externos são deduplicados; valores monetários têm moeda e representação exata. |
| Endereços públicos | Domain, DomainVerification | Hostname é único na plataforma e só resolve tenant quando autorizado e ativo. |
| Operação | Professional, Service, ProfessionalService, BusinessHour, ProfessionalSchedule, TimeOff, Customer | Toda relação operacional conserva tenant e, quando aplicável, location. |
| Agenda | Appointment, AppointmentService, AppointmentEvent | Intervalos não podem sobrepor um recurso; itens preservam preço e duração aplicados. |
| Apresentação | SiteConfiguration, Theme, ThemeVersion, TenantDesignConfig, SiteSection, CustomPage, DesignBrief | Registro de código é controlado; versão e configuração publicada pertencem ao tenant correto. |
| Conteúdo e comunicação | GalleryAsset, SocialLink, Notification, NotificationTemplate | Arquivos, templates e destinatários são escopados por tenant. |
| Plataforma | AuditLog, SystemSetting | Eventos administrativos são auditáveis; configurações globais não ficam editáveis por um membro comum. |

## Relações e constraints

A agenda interna adiciona `Appointment.idempotencyKey` e `requestHash`, ambos nullable para compatibilidade com reservas anteriores. A migration versionada torna a chave única por tenant e exige o par completo quando informado. A API associa o hash ao ator e conteúdo normalizado. `AppointmentService` conserva nome, duração e preço contratados, e `AppointmentEvent` registra transições/reagendamento na mesma transação da auditoria.

IDs globais opacos reduzem colisões e enumeração, mas não são autorização. Entidades tenant-scoped expõem uma chave candidata `(tenant_id, id)` para relações compostas. Uma referência como agendamento → profissional deve transportar `tenant_id` junto do ID e apontar para a chave composta correspondente. Isso impede um relacionamento que cruza empresas mesmo quando a aplicação fornece um ID incorreto.

Unicidades comerciais devem incluir `tenant_id` quando o valor é local: slug de página, código de serviço ou identidade do cliente não precisam ser globais. Hostname, slug público de tenant e identificadores externos que exigem unicidade global recebem constraints globais deliberadas.

`User.platformRole` separa USER de SUPER_ADMIN. `Membership` associa tenant, usuário, role e status; roles globais possuem vínculos explícitos de permissão. `TenantFeatureOverride` contém enabled, limite opcional, motivo e expiração opcional. Overrides expirados deixam de substituir a regra do plano.

`Theme.ownerTenantId` identifica o dono do bespoke, imutável após criação; mudança de propriedade exige novo Theme. `ThemeVersion` pertence ao tenant e tema; a FK publicada de `SiteConfiguration` usa `(tenant_id, theme_id, published_theme_version_id)`, impedindo apontar para versão de outro tenant ou tema. O banco separa status da versão de publicação e status do DesignBrief, conforme [THEME_ENGINE.md](THEME_ENGINE.md).

Datas de eventos persistem como instantes UTC; horário local recorrente pertence a uma unidade com timezone IANA. Valores monetários não usam ponto flutuante. Colunas e tabelas persistidas adotam `tenant_id`/`location_id`; os nomes TypeScript podem seguir camelCase com mapeamento Prisma.

## Evolução

Alterações exigem migration versionada. Validar chaves estrangeiras e índices no PostgreSQL real: mocks não comprovam constraints. Dados de demonstração devem ser fictícios e idempotentes. RLS pode ser adicionada como defesa complementar, mas não é uma proteção implementada por simples menção neste modelo. Regras de retenção, exclusão e anonimização de clientes serão fechadas antes da operação comercial.
