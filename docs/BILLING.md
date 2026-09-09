# Billing e entitlements — Fase 2

A Foundation modela planos, features, assinaturas, pagamentos e eventos. Cobrança real e Mercado Pago pertencem à Fase 2. Nenhum redirect, tela demonstrativa ou adapter incompleto deve ser apresentado como confirmação de pagamento.

## Contrato do provider

`BillingProvider` encapsulará `createCustomer`, `createSetupPayment`, `createSubscription`, `changeSubscription`, `cancelSubscription` e `processWebhook`. A implementação inicial prevista é `MercadoPagoBillingProvider`; casos de uso dependem da interface, não do SDK do fornecedor.

Plano, mensalidade, moeda, `setup_fee` e `custom_design_fee` serão editáveis no Admin. Armazenar valores em representação exata e preservar valores negociados nos registros da cobrança. Exibir START/PRO/PREMIUM/NETWORK é decisão de produto; liberar módulo consulta uma chave de feature.

## Webhooks e consistência

1. Validar assinatura com o material e a regra oficiais do provider, preservando o corpo bruto quando necessário.
2. Persistir o evento recebido com identificador externo único por provider.
3. Responder de forma compatível com os retries do fornecedor e processar com idempotência.
4. Conferir o recurso no provider quando exigido, relacionar à assinatura correta e atualizar estado numa transação.
5. Produzir auditoria e efeitos assíncronos deduplicados.

Evento repetido não cria pagamento, crédito ou notificação novamente. Evento atrasado não pode reativar uma assinatura cancelada sem a regra comercial correspondente. Reconciliar periodicamente discrepâncias entre estado local e remoto. Não aceitar `tenant_id` arbitrário no webhook; resolver a partir do vínculo externo já registrado.

## Política comercial pendente

Fechar antes de implementar: upgrade imediato ou no próximo ciclo, pró-rata, downgrade com recursos acima do limite, carência por inadimplência, suspensão, cancelamento, reembolso e retenção de dados. Bloqueio de feature não deve apagar designs, clientes ou histórico.

Acesso efetivo combina estado do tenant/assinatura, override explícito e vínculo de feature ao plano, conforme [MULTI_TENANCY.md](MULTI_TENANCY.md). Override administrativo deve registrar motivo e autor. Não vincular liberação a um texto como `plan.name === 'Premium'`.

Gates da Fase 2: assinatura válida, assinatura inválida rejeitada, duplicação e desordem de webhooks, retry após falha parcial, pagamento vinculando tenant correto e liberação/revogação de feature com audit log. Testes com provider sandbox e reconciliação são necessários antes de cobrar clientes.
