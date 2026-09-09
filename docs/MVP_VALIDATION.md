# Validação da Fase 1 — catálogo e agenda interna

Execução local de 08/09/2026, em Windows, Node.js 24.20.0 e pnpm 11.19.0. Incremento sobre a [Foundation](FOUNDATION_VALIDATION.md), com contratos em [CATALOG.md](CATALOG.md) e [BOOKING_API.md](BOOKING_API.md). O MVP completo ainda depende dos próximos itens do roadmap.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `pnpm lint` | Passou, incluindo fronteiras entre apresentação e Core. |
| `pnpm typecheck` | Passou na raiz e nos 18 pacotes/aplicações. |
| `pnpm test` | 153 testes passaram em 11 arquivos. |
| Integração PostgreSQL/API | 84 testes passaram em 4 arquivos: 28 de Foundation/banco, 23 de catálogo e 33 de agenda. PostgreSQL 18.4 isolado, nome terminado em `_test`. |
| `pnpm build` | Passou nos 18 pacotes/aplicações, incluindo os três frontends e backends compilados. |
| API compilada | `scripts/smoke-build.mjs` passou com PostgreSQL: inicialização, health e readiness. |
| Navegador operacional | 6 testes passaram: catálogo, conflito de edição e jornada de agenda em Chromium desktop e celular. |
| Navegador Foundation | 6 testes passaram: previews, tema desconhecido e telas de acesso em desktop/celular. |
| Schema e seed | Prisma validate passou. Duas execuções consecutivas do seed no banco isolado passaram. Vínculos usam os IDs de permissões retornados pelo banco. |
| Ambiente local do projeto | Migration `20260905000400_booking_idempotency` e seed aplicados em localhost:5432. Quatro migrations aplicadas; OWNER/MANAGER com agenda e horários, RECEPTIONIST com agenda, BARBER sem agenda geral. |
| Verificação após atualização local | API `http://localhost:4000/ready` e painel `http://localhost:3001/login` responderam HTTP 200. |
| CI remota | Workflow inclui a nova suíte de navegador após a suíte Foundation. Não executado remotamente nesta entrega. |

Para repetir a integração, definir `DATABASE_TEST_URL`, executar `pnpm db:migrate:test` e `pnpm test:integration`. Para navegador, instalar Chromium e executar `pnpm test:e2e` seguido de `pnpm test:e2e:catalog`. Nesta máquina, PostgreSQL de testes e Chromium foram disponibilizados em diretórios locais ignorados pelo Git. Credenciais não fazem parte da evidência.

## Comportamentos comprovados

- Contexto de tenant pelo servidor, sessão verificada, membership/tenant ativos, permissão de ação, `appointments.manage_all` e entitlements independentes. IDs de outro tenant/unidade não autorizam leitura ou escrita.
- Catálogo persistido, desativação/reativação, vínculo profissional/serviço, centavos exatos e edição concorrente recusada com preservação dos dados.
- Expediente intersectado com escala profissional, pausas, bloqueios da unidade/profissional e atendimentos ocupados. Datas locais IANA, instantes UTC, mudanças de DST, horas inexistentes/repetidas e fronteiras de calendário distintas do UTC.
- Duas reservas sobrepostas concorrentes resultam em um sucesso e um conflito. A constraint PostgreSQL permanece como proteção independente. Corridas de reserva contra bloqueio ou fechamento do expediente também conservam apenas uma operação compatível.
- Repetição idêntica da chave de idempotência devolve o mesmo recurso; alteração do ator/conteúdo é recusada. O navegador deixa a API salvar, descarta a primeira resposta e repete a confirmação, comprovando apenas uma reserva persistida.
- Reagendamento conserva snapshots de nomes, valores e durações. Estados seguem transições explícitas, NO_SHOW exige início já ocorrido, cancelamento libera horário e versões antigas recebem conflito.
- Auditoria, eventos, snapshots e alterações operacionais são transacionais. Triggers de teste restritas ao tenant fictício simulam falha da auditoria e comprovam rollback de reservas, horários, bloqueios e clientes.
- Proxies validam caminhos, métodos, query e Origin; recusam corpo não JSON ou acima de 32 KiB, não seguem redirects e não encaminham headers de autoridade enviados pelo navegador.
- O navegador percorre o atalho de horários, cria expediente e escala, cadastra cliente, confirma, recupera resposta perdida, recarrega a data correta, reagenda, cancela e cria/remove bloqueio. Persistência conferida no banco. Capturas desktop/mobile inspecionadas; agenda sem rolagem horizontal e sem erros JavaScript no fluxo final.

## Correções durante a validação

Foram corrigidos os códigos HTTP das alterações de atendimento, dados de teste incompatíveis com relações compostas, permissões ausentes no seed e navegação que ainda anunciava a agenda como futura. O teste de recarregamento identificou seleção de data antes da hidratação: os controles da agenda agora aguardam a inicialização do cliente antes de permitir interação.

Execuções intermediárias falharam por seletores exatos em labels de selects e por preparação do seed simultânea ao navegador. A preparação do banco foi separada; as execuções finais registradas acima passaram. Não executar seed enquanto uma suíte manipula fixtures globais de roles/permissões. Artefatos das suítes usam subpastas separadas em `test-results` para preservar evidências de ambas na CI.

## Limites

Reserva pública, onboarding/gestão de unidades, vínculo membership → profissional e agenda própria do BARBER continuam pendentes. Clientes possuem API de criação/edição/busca e seleção/cadastro no fluxo de reserva; não há tela independente de CRM. Não existem novos holds PENDING com expiração, pagamento nem notificações automáticas de agendamento.

Os testes de navegador provisionam contas fictícias verificadas e usam login real. Verificação/reset por email são exercitados nas integrações com adapter em memória; isso não comprova entrega SMTP externa. Docker/Compose, fila real/Redis, SMTP, Mercado Pago, Cloudflare, carga, CI remota e deploy de produção não foram validados neste incremento. O banco local de desenvolvimento recebeu a migration aditiva e o seed de desenvolvimento; o PostgreSQL de testes permanece separado.
