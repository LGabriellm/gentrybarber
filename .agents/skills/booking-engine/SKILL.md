---
name: booking-engine
description: Implementar disponibilidade, criação, reagendamento e transições de atendimento com concorrência e timezone corretos.
---

# Booking Engine

Ler [BOOKING.md](../../../docs/BOOKING.md). Disponibilidade e transições pertencem ao Core, nunca ao tema. Considerar duração, unidade, profissional, expediente, pausas, time off e reservas existentes.

Persistir instantes UTC e timezone IANA; usar intervalos início inclusivo/fim exclusivo. Preservar preço e duração no item contratado. Validar tenant/unidade em todas as relações.

Consulta anterior à inserção não impede concorrência. Usar transação e constraint de exclusão PostgreSQL nos estados que ocupam horário; testar duas escritas concorrentes reais. Registrar AppointmentEvent e idempotência. Notificações assíncronas não devem impedir sucesso da reserva.
