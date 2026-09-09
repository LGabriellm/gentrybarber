# Roadmap técnico e riscos

## Fases e gates

| Fase | Entrega | Gate para avançar |
| --- | --- | --- |
| 0 — Foundation | Monorepo, schema/migrations, auth, Tenant Context, RBAC, features, temas iniciais, ambiente, CI e documentação. | Evidência de isolamento A/B, resolução tenant → tema e lint/typecheck/tests/build; bloqueios explicitados. |
| 1 — MVP | Onboarding, unidades, profissionais, serviços, horários, clientes, agendamento, site e dashboard operacionais. | Jornada completa, concorrência de agenda protegida pelo banco, timezone e testes de acesso. |
| 2 — Billing | Planos administráveis, implantação, recorrência, Mercado Pago, webhooks, upgrades/downgrades e suspensão. | Sandbox, assinatura/idempotência, reconciliação e políticas comerciais aprovadas. |
| 3 — Site builder | Seções, layouts, variantes, tokens e composição controlada. | Validação de configuração, acessibilidade, preview e ausência de impacto em outros tenants. |
| 4 — Premium custom | Briefing, projetos bespoke, preview, revisão, aprovação, publicação/rollback, custom domain e white-label. | Duas identidades exclusivas no mesmo Core; isolamento de versões, DNS/SSL e rollback persistido. |
| 5 — Operação | CRM avançado, comissões, fidelidade, WhatsApp, analytics e relatórios. | Regras próprias, autorização, métricas e adapters testados por módulo. |
| 6 — Network | Várias unidades, gestão central, relatórios consolidados e permissões avançadas. | Acesso por unidade e consolidação sem vazamento entre redes. |

Não ampliar a Foundation para construir todos os módulos comerciais. A meta comercial posterior é a primeira barbearia pagando por uma operação confiável. Microsserviços, Kubernetes, app nativo, ERP, folha, marketplace, chatbot, IA e editor HTML livre ficam fora do MVP.

## Riscos priorizados

Estado atual: Foundation concluída com limites operacionais registrados; Fase 1 em andamento. Catálogo, agenda interna, onboarding e gestão de unidades estão implementados. A reserva pública possui API; faltam a jornada no site, verificação de telefone e proteção contra abuso para operação comercial. O incremento solicitado de [WhatsApp](WHATSAPP.md) antecipa confirmações da agenda interna, com autorização do cliente, fila persistida e histórico; não representa toda a Fase 5. Ver [MVP_VALIDATION.md](MVP_VALIDATION.md). Os próximos incrementos são concluir a jornada pública e o vínculo de acesso do profissional à própria agenda. Isso ainda não encerra o gate do MVP nem libera billing produtivo.

| Risco | Impacto | Mitigação / evidência necessária |
| --- | --- | --- |
| Contexto tenant perdido em query, cache ou job | Vazamento entre empresas | Contexto obrigatório, escopo explícito, FK composta e testes negativos. |
| Schema extenso parecer produto pronto | Expectativa comercial incorreta | Distinguir modelagem, contrato e fluxo operacional em docs e interfaces. |
| Agendamento concorrente | Dupla reserva | Constraint PostgreSQL e teste concorrente antes da Fase 1. |
| Auth com origins/cookies incorretos | Bloqueio de sessão ou acesso indevido | Testar origens reais, HTTPS, reset/verificação e revogação. |
| Tema bespoke contaminar Core/outro tenant | Regressão e manutenção cara | Registro de código, ownership, tokens imutáveis e versões. |
| Webhook repetido ou fora de ordem | Receita/entitlement incorretos | Ledger de eventos, idempotência e reconciliação. |
| DNS/SSL ou ownership incompletos | Site indisponível ou domínio indevido | Ativação por estado verificado, adapter, retries e revogação. |
| CSS/uploads livres | XSS, exfiltração e quebra visual | Recursos fechados até validação, sanitização e escopo comprovados. |
| Dependências/toolchain/serviços locais indisponíveis | Build não reproduzido | Versões e lockfile, CI com banco real, registrar bloqueios de ambiente. |
| Migração incompatível ou backup inútil | Indisponibilidade e perda de dados | Expansão/contração, restauração ensaiada e plano de rollback. |
| Custo operacional de bespoke | Margem e prazo imprevisíveis | Briefing delimitado, revisão por versão e taxa configurável própria. |

## Decisões antes da produção

Fechar política de retenção/exclusão, termos de uso de assets, observabilidade, objetivos de disponibilidade, alertas, rate limits distribuídos, recursos por plano e tratamento de inadimplência. Evoluir para infraestrutura mais complexa apenas quando métricas de volume, falha ou autonomia de equipe justificarem.

A escala de 1 a 10.000 empresas é uma direção arquitetural. A capacidade efetiva precisa de teste de carga, medição de banco e custos; a Foundation não certifica esse volume.
