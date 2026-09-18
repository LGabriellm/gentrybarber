# WhatsApp — estado atual

O envio automático de confirmações está desativado. A integração com a API oficial da Meta, a fila de envio no worker, os endpoints de histórico e repetição e as telas correspondentes foram removidos. O número de WhatsApp cadastrado para a barbearia continua sendo apenas um contato público no site.

Dados e migrations históricos de notificações e consentimento foram preservados para compatibilidade com bancos existentes. Eles não ativam mensagens. Nenhuma configuração `WHATSAPP_GRAPH_VERSION` ou `WHATSAPP_ACCOUNTS_JSON` é necessária ou consumida.

A reserva pública aceita telefone sem OTP por decisão temporária de produto. Isso permite reservas com número incorreto ou de terceiros e requer acompanhamento de abuso antes da operação comercial. Um canal futuro de mensagens precisará de adapter explícito, autorização adequada, isolamento por tenant e testes antes de ser ativado.
