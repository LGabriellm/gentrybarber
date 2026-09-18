# Agenda operacional — contrato da Fase 1

Este incremento oferece agenda interna para membros autorizados, incluindo horários semanais, bloqueios, clientes, disponibilidade, confirmação, reagendamento e estados do atendimento. As confirmações automáticas possuem contrato e ativação em [WHATSAPP.md](WHATSAPP.md). Pagamento continua pendente.

## Agenda adaptada ao tamanho da operação

- No site público e na criação interna, um único profissional elegível é selecionado automaticamente. Elegibilidade considera unidade, situação ativa e os serviços escolhidos. Havendo várias opções, a escolha permanece explícita; nenhuma opção produz orientação e impede consultar/reservar sem profissional.
- Trocar serviço ou unidade limpa horários anteriores. Uma seleção de profissional que deixou de ser elegível não é reutilizada. O profissional continua identificado no resumo e seu ID é enviado ao Core para validação.
- Uma única unidade dispensa o seletor no site, na agenda e nos horários. O nome continua visível. A agenda administrativa conserva unidades inativas no catálogo para consulta de histórico; mais de uma unidade disponível para consulta mantém o seletor.
- Com um único profissional ativo cadastrado na unidade, o editor semanal permite aplicar os mesmos intervalos à barbearia e ao profissional em uma única operação já existente. Esse modo começa ativo quando as escalas coincidem ou o profissional ainda não tem escala. Escalas diferentes continuam separadas até uma escolha explícita de unificação; o usuário pode voltar à edição separada.
- Nesse cenário individual, novos bloqueios indicam o profissional diretamente, sem pedir uma escolha redundante. O bloqueio é escopado a esse profissional, não a profissionais que possam ser contratados depois.
- O painel separa ações de atendimento das configurações; a agenda mostra contagens de agendados, em atendimento e concluídos para a data carregada. Seletores e filtros de unidade também são simplificados no catálogo quando há apenas uma opção.

As simplificações são de apresentação. Nenhuma permissão, entitlement, regra de concorrência ou campo obrigatório do contrato da API foi removido. Não há alteração de schema nem ativação automática da agenda própria do papel BARBER.

Toda rota exige contexto tenant construído no servidor. O módulo agenda exige entitlement `booking` e a permissão `appointments.manage_all` além da permissão de ação. O seed concede gestão geral a OWNER, MANAGER e RECEPTIONIST; BARBER aguarda o vínculo entre membership e profissional antes de ter uma agenda própria. Não liberar uma agenda inteira apenas por `appointments.read`.

## Endpoints

Base `/v1/tenants/:slug`; contratos de resposta em `packages/types/src/booking.ts`. Escritas usam JSON, origem confiável, schemas strict, auditoria transacional e no-store, como no catálogo.

| Endpoint | Contrato | Permissão adicional |
| --- | --- | --- |
| GET `/booking/options` | `BookingOptions` | appointments.read |
| GET `/schedule?locationId=` | `ScheduleView` | appointments.read |
| PUT `/schedule` | `UpdateScheduleInput` → `ScheduleView` | schedules.manage |
| POST `/time-offs` | `{locationId, professionalId: string ou null, startsAt, endsAt, reason: string ou null}` → `TimeOffView` | schedules.manage |
| DELETE `/time-offs/:id` | corpo `{}` → `{deleted:true}` | schedules.manage |
| GET `/customers?q=&page=1` | `{items:CustomerView[],page,hasMore}`; busca até 80 caracteres, 50 resultados por página; page inteiro de 1 a 100000 | customers.read + feature customers |
| POST `/customers` | `CustomerFields` → `CustomerView` | customers.update + feature customers |
| PATCH `/customers/:id` | `CustomerFields & {expectedVersion}` → `CustomerView` | customers.update + feature customers |
| GET `/availability` | `AvailabilityQuery` → `AvailabilityView` | appointments.read |
| GET `/appointments?locationId=&date=` | `AppointmentDay` | appointments.read |
| POST `/appointments` | `CreateAppointmentInput` → `AppointmentView`, 201 | appointments.create + feature customers |
| POST `/appointments/:id/reschedule` | `{startsAt,expectedVersion}` → `AppointmentView`, 200 | appointments.update |
| POST `/appointments/:id/status` | `{status,expectedVersion,reason: string ou null}` → `AppointmentView`, 200 | appointments.update |

Customers continua tenant-scoped e exige `customers` além de `booking`. Telefone canônico E.164 (`+` e 8–15 dígitos, primeiro não zero), nome 1–120 após trim, email válido ou null até 254 caracteres, notas até 2.000 ou null. Telefone duplicado no mesmo tenant retorna 409. Não se altera cliente a partir dos dados de um pedido de agendamento: criar/selecionar explicitamente o cliente primeiro.

CustomerFields aceita `whatsappOptIn?: boolean`. O servidor grava/devolve `whatsappOptInAt` nullable, registra mudanças na auditoria e revoga consentimento quando o telefone muda. Omitted preserva consentimento quando o telefone não mudou; false revoga. As operações de edição usam `expectedVersion` inteiro positivo; as migrations 5 e 6 preservam updatedAt para metadados e adicionam version para concorrência.

A tela independente de clientes usa o proxy `/api/operations/:slug/customers`, pesquisa no servidor pelo botão Buscar e oferece Anterior/Próxima. A resposta adiciona metadados de paginação sem alterar `items`, preservando os consumidores existentes. A reserva pública nunca altera o consentimento de um cliente já cadastrado, mesmo que envie `whatsappOptIn: true`; um telefone anônimo não autoriza reativar consentimento revogado.

## Onboarding, unidades e reserva pública

POST `/v1/onboarding` exige sessão verificada, origem confiável, JSON e ausência de membership ativa. Campos: tenantName, tenantSlug, locationName, timezone IANA opcional, address estrito e phone E.164 opcional. O plano inicial vem de `SystemSetting[onboarding.defaults].value.planId`, deve estar ativo; configuração ausente desabilita onboarding. O seed local cria essa configuração sem sobrescrever escolhas existentes. Tenant, membership OWNER, primeira unidade e auditoria são atômicos; locks por usuário e slug protegem concorrência. Não publica automaticamente um site.

GET/POST `/v1/tenants/:slug/locations` e PATCH `/locations/:id` exigem `team.manage`, sessão e membership ativa. Alterações usam expectedVersion. A ativação de unidades adicionais exige `multi_location` e respeita seu limite configurado dentro do lock do tenant. Novas unidades herdam o fuso do tenant. Desativação é recusada se houver atendimentos futuros/em andamento, com lock compartilhado com a agenda. O dashboard possui proxy e formulário de unidades.

GET `/v1/public/booking/availability` recebe hostname, locationId, professionalId, serviceIds e date. Não aceita appointmentId. POST `/v1/public/booking/appointments` recebe hostname, locationId, professionalId, serviceIds, startsAt, idempotencyKey, notes opcional e customer `{name,phone,email,notes}`. Ambas exigem hostname resolvido, tenant ativo, website, booking e site publicado; hostname próprio exige custom_domain. Criação devolve apenas `{id,status,startsAt,endsAt,totalCents}`. Dados do cliente existente nunca são sobrescritos por informações anônimas. A idempotência inclui todo o conteúdo de cliente enviado. Não há OTP, token de telefone ou envio automático de confirmação; os antigos endpoints `verification-send` e `verification-check` foram removidos. O telefone informado pelo visitante não prova posse nem identidade. A jornada visual está integrada ao editor e ao site público, conforme [SITE_EDITOR.md](SITE_EDITOR.md).

## Tempo, disponibilidade e bloqueios

Unidade possui timezone IANA. Instantes de reserva e bloqueio são UTC (ISO com offset); date é YYYY-MM-DD da unidade. Grade local de 15 minutos, duração real em minutos, intervalos semiabertos. Combinar expediente da unidade e escala do profissional, subtrair bloqueios da unidade/profissional e reservas que ocupam horário. Não usar o fuso do navegador ou offset fixo para interpretar o expediente. Horários inexistentes não são oferecidos; na repetição de horário por DST, instantes distintos mantêm seus offsets na interface. Conversão de um campo local ambíguo/inexistente para bloqueio deve rejeitar, nunca escolher silenciosamente.

Cada semana tem até 28 intervalos por configuração, dia 0 (domingo) a 6, minuto 0–1440, fim maior que início; rejeitar sobreposição no mesmo dia e IDs repetidos. Pausas são lacunas entre intervalos. Alteração do expediente ou escala não pode invalidar reservas futuras existentes: retornar 409 e preservar os dados. Horários de outros profissionais não enviados ao PUT são preservados; `expectedVersion` refere-se à unidade e muda em toda alteração de horários ou bloqueios. Bloqueios futuros, com até 366 dias e motivo até 500 caracteres, também recusam sobreposição com reservas existentes.

Disponibilidade aceita 1–10 serviços distintos, ativos, da mesma unidade, todos vinculados ao profissional ativo. Somar valores e durações no servidor; duração total até 1.440 minutos e total até o limite Int do banco. Datas consultáveis para disponibilidade vão de hoje até 366 dias à frente no fuso da unidade; excluir instantes passados. `appointmentId` opcional permite consultar reagendamento com os snapshots da reserva, excluindo o próprio intervalo; deve pertencer ao mesmo tenant, unidade, profissional e conjunto de serviços.

## Transações e estados

No reagendamento, unidade e profissional devem continuar ativos. Serviços já contratados mantêm seus snapshots mesmo após desativação ou mudança de vínculo no catálogo; essas mudanças impedem novas reservas, mas não apagam o contrato existente.

Nova reserva nasce CONFIRMED. PENDING permanece compatível com registros legados, sem criar holds temporários novos. Capturar preço, duração e nome em AppointmentService; catálogo posterior não altera o contratado. `idempotencyKey` de 1–128 caracteres é escopada pelo tenant, com hash SHA-256 do ator e payload normalizado. Repetição idêntica retorna o mesmo recurso; chave reutilizada com conteúdo diferente retorna 409. A migration é aditiva e mantém reservas anteriores com ambos os campos null.

Usar lock transacional por unidade para coordenar alteração de horários/bloqueios e reservas. Manter a constraint de exclusão PostgreSQL como proteção de conflitos, inclusive em inserts concorrentes. Revalidar disponibilidade dentro da transação. Reagendamento preserva unidade, profissional, cliente, serviços e valores e só aceita CONFIRMED futuro; duração vem do snapshot. Cancelamento libera o intervalo. Erros de unicidade/exclusão concorrente retornam 409; recursos/relacionamentos alheios retornam 404.

Transições: PENDING legado → CANCELED; CONFIRMED → CHECKED_IN, CANCELED ou NO_SHOW; CHECKED_IN → IN_PROGRESS, CANCELED ou NO_SHOW; IN_PROGRESS → COMPLETED ou CANCELED. Estados terminais não mudam. NO_SHOW só após o início. Status e reagendamento exigem expectedVersion e gravam AppointmentEvent + AuditLog na mesma transação; reagendamento registra evento com o mesmo estado e motivo de reagendamento. Falha de auditoria desfaz toda a operação. Nenhuma integração externa participa da transação.


GET `/v1/public/booking/options?hostname=...` fornece unidades ativas (ID, nome, fuso), serviços ativos (ID, unidade, nome, centavos, duração) e profissionais ativos (ID, unidade, nome, serviços vinculados). Exige os mesmos entitlements e publicação da disponibilidade. Não retorna cadastro de clientes ou informações de sessão. O intermediário `/api/booking/*` do site determina o hostname no servidor e não aceita o tenant selecionado no corpo ou na query.
