# Confirmações por WhatsApp

Incremento de 09/09/2026, antecipado da Fase 5 por solicitação do produto. O adapter implementa a API oficial da Meta; as verificações locais usam um provider fictício. Não há conta real conectada nem envio externo comprovado.

## Fluxo disponível

Na agenda interna, o atendente registra a autorização explícita do cliente no cadastro ou no cliente selecionado. Criar ou reagendar um atendimento CONFIRMED gera uma confirmação na mesma transação, quando o tenant possui `whatsapp_automation`. O worker consulta a fila persistida no PostgreSQL e envia um template. A agenda oferece acesso ao histórico das últimas 50 confirmações. A revogação fica no cadastro do cliente; alterar o telefone revoga a autorização e exige novo registro para o novo número.

O envio exige tenant ativo, features `booking` e `whatsapp_automation`, cliente autorizado com telefone inalterado, unidade ativa e reserva futura CONFIRMED na versão que originou a mensagem. Cancelamento, reagendamento ou retirada da autorização tornam mensagens antigas dispensáveis. Uma solicitação já encaminhada à Meta não pode ser recolhida por alterações posteriores.

## Configuração de operação

1. Aplicar as sete migrations versionadas e iniciar API e worker compatíveis. O email permanece em BullMQ/Redis; WhatsApp usa a tabela `notifications` como outbox durável.
2. Habilitar `whatsapp_automation` nos dados do plano ou no override do tenant. A permissão de funcionário não substitui este recurso.
3. Preparar uma conta WhatsApp Business, número remetente e template aprovado com quatro parâmetros de corpo nesta ordem: nome do cliente, nome da barbearia, data local, hora local com offset. Exemplo de texto a submeter: `Olá {{1}}, seu agendamento na {{2}} está confirmado para {{3}} às {{4}}.`
4. Configurar `WHATSAPP_GRAPH_VERSION` com uma versão vigente suportada pela sua conta e `WHATSAPP_ACCOUNTS_JSON` apenas no servidor do worker. O objeto associa **ID do tenant** à conta correspondente. Exemplo estrutural, com valores fictícios:

```json
{
  "tenant-exemplo": {
    "phoneNumberId": "1234567890",
    "accessToken": "SUBSTITUIR_NO_GERENCIADOR_DE_SEGREDOS",
    "template": "confirmacao_agendamento",
    "language": "pt_BR"
  }
}
```

Não existe conta de fallback para outro tenant. Configuração incompleta é recusada sem expor tokens. Reiniciar o worker após alterar o ambiente. Contas ausentes geram `FAILED / NOT_CONFIGURED`; depois de configurar, um funcionário autorizado pode solicitar nova tentativa no histórico. Não colocar tokens no Git, no browser, em temas ou no campo de configuração pública do tenant.

## Estados e recuperação

| Estado | Significado |
| --- | --- |
| PENDING | Aguardando processamento ou nova tentativa após HTTP 429. |
| PROCESSING | Um worker reivindicou a mensagem. |
| SENT | A Meta devolveu um identificador de mensagem. Não comprova entrega ou leitura. |
| FAILED | Conta ausente, dados inválidos, recusa explícita ou limite de tentativas atingido. Permite tentativa manual auditada. |
| UNKNOWN | Resposta perdida, timeout, erro 5xx ou worker interrompido. Não repetir automaticamente nem pela tela; conferir o provider. |
| SKIPPED | Reserva, autorização ou recurso não é mais elegível. |

Workers concorrentes usam `FOR UPDATE SKIP LOCKED`. HTTP 429 permite até quatro tentativas, com espera progressiva de 60, 120 e 240 segundos. `PROCESSING` abandonado por mais de 120 segundos passa a UNKNOWN. Timeout de rede de 15 segundos. Não se promete exactly-once entre PostgreSQL e Meta: a estratégia evita repetição de envios ambíguos e torna a incerteza visível.

GET `/v1/tenants/:slug/whatsapp` exige sessão/membership ativa, `appointments.manage_all`, `appointments.read`, `booking` e `whatsapp_automation`. POST `/whatsapp/:id/retry` exige também `appointments.update`, origem confiável e corpo `{}`. Só FAILED volta à fila; worker revalida elegibilidade. O histórico não expõe telefone, corpo, token ou erro bruto do provider.

## Compatibilidade e limites

Migration `20260909000700_whatsapp_confirmations` é aditiva: consentimento nullable, vínculo composto tenant/agendamento, revisão e estados da fila. Cadastros antigos começam sem autorização. Não converter jobs antigos da fila Redis, que não possuem tenant nem prova de consentimento. A versão anterior imprimia conteúdo no console; o novo worker não consome essa fila nem registra dados pessoais das mensagens. Ao atualizar, parar o worker antigo antes de iniciar o novo. Reverter o código do envio requer pausar consumidores; manter as colunas e estados adicionados até uma migração de contração revisada.

Reservas públicas ainda não geram WhatsApp: informar um telefone anonimamente não comprova posse nem autoriza contato. Faltam verificação do telefone, jornada pública no site e proteção contra abuso apropriada para operação comercial. O endpoint público retorna apenas comprovante da reserva e não sobrescreve dados de cliente existente. Webhooks de entrega/leitura e opt-out por mensagem recebida não fazem parte desta entrega; a equipe deve respeitar pedidos de revogação pelo cadastro.

Referências oficiais: [política do WhatsApp Business](https://business.whatsapp.com/policy), [estrutura de templates](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/). A segunda referência documenta o payload; não utilizamos o SDK arquivado.
