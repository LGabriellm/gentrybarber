# ADR 0008 — Confirmações WhatsApp com outbox transacional

Status: aceito para o incremento solicitado em 09/09/2026; ativação externa depende da conta Meta e template.

## Contexto

Enviar para uma fila externa durante a transação de reserva permite confirmação antes do commit e mensagens de reservas revertidas. Jobs contendo somente telefone e texto também perdem o isolamento do tenant. A implementação encontrada usava um provider de console, sem entrega externa.

## Decisão

Persistir a intenção de envio na tabela Notification junto à reserva. Vincular tenant/agendamento por FK composta e chave única tenant + agendamento + versão. O pacote notifications possui o contrato WhatsAppProvider, adapter HTTP Meta e consumidor da outbox. A API cria a intenção, o worker executa a integração e o dashboard mostra estados sem payloads pessoais. O Feature Engine e a autorização do cliente são reavaliados antes do envio.

Claims no PostgreSQL usam SKIP LOCKED. O status PROCESSING é persistido antes da chamada externa. Repetir apenas recusas explícitas recuperáveis; falhas de rede, 5xx e claims abandonados tornam-se UNKNOWN. Não reenviar UNKNOWN automaticamente. Mapear credenciais por tenant no ambiente do servidor.

## Consequências

O WhatsApp não depende da disponibilidade do Redis para preservar intenções. Um poller adicional consulta o banco a cada cinco segundos quando ocioso. HTTP 429 tem backoff limitado; falhas explícitas podem ser recolocadas na fila por funcionário autorizado, com auditoria. Uma resposta perdida pode exigir conferência manual e uma confirmação pode deixar de sair; evita-se prometer exatamente uma entrega quando o provider e o banco não compartilham transação. SENT significa aceite pela Meta, sem webhook de entrega. Não há backend ou infraestrutura duplicada por tenant.

Alternativa de publicar no BullMQ depois do commit sem outbox foi descartada porque a queda entre commit e enqueue perde a notificação. Adicionar um relay PostgreSQL → Redis não traz benefício necessário ao volume deste incremento; pode ser avaliado com métricas.
