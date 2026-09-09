# Booking Engine — Fase 1

A agenda interna está implementada na Fase 1. O [contrato operacional](BOOKING_API.md) descreve endpoints, permissões, transições e limites efetivos; a [validação](MVP_VALIDATION.md) registra as evidências. O pacote `@platform/booking` contém cálculo puro de calendário/disponibilidade e transições; os casos de uso transacionais ficam na API. Reserva pública e notificações automáticas continuam futuras.

## Caso de uso

Unidade → serviço → profissional → data → horário → cliente → confirmação. O backend calcula disponibilidade combinando duração dos serviços, funcionamento da unidade, agenda profissional, intervalos, time off, férias e agendamentos existentes. A UI e temas exibem possibilidades retornadas pelo Core.

Guardar instantes UTC e timezone IANA por unidade. Regras recorrentes de expediente pertencem ao horário local. Converter limites considerando mudanças de horário e intervalos ambíguos; não usar offset fixo como timezone. O intervalo ocupado usa início inclusivo e fim exclusivo, permitindo um atendimento começar quando outro termina.

## Concorrência

Consultar disponibilidade antes de inserir não impede duas requisições simultâneas. A implementação deve combinar transação e constraint PostgreSQL de exclusão por tenant/profissional e intervalo para os status que reservam horário. A estratégia SQL precisa ser versionada em migration e testada com escritas concorrentes reais; um teste unitário de comparação de datas não comprova a proteção do banco.

Novas reservas nascem CONFIRMED. PENDING legado ocupa horário e pode ser cancelado; holds temporários novos não estão habilitados. Cancelamento e NO_SHOW liberam o intervalo e preservam histórico. Reagendamento revalida disponibilidade mantendo o profissional e o contrato original. A chave de idempotência é única por tenant e associada ao hash do ator e pedido normalizado.

## Estado e histórico

Estados previstos: `PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`, `NO_SHOW`. Definir transições autorizadas por ação, sem aceitar mudança arbitrária de status. `AppointmentEvent` registra ator, instante, motivo e transição, com tenant consistente.

`AppointmentService` preserva preço e duração contratados para que alteração posterior no catálogo não reescreva o passado. Customer, Service, Professional e Location precisam pertencer ao mesmo tenant. Permissão de BARBER deverá ser delimitada à própria agenda quando exigido pelo produto, além da verificação da role.

Notificações são efeitos assíncronos via contrato de notificações e worker. Sucesso de agendamento não depende da disponibilidade do SMTP/WhatsApp. Antes da Fase 1 estar pronta, testar conflito concorrente, cancelamento, reagendamento, timezone, bloqueio e acesso cruzado entre tenants.
