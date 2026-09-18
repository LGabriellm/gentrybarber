# Validação da Fase 1 — catálogo e agenda interna

Execuções locais em Windows, Node.js 24.20.0 e pnpm 11.19.0. Incremento sobre a [Foundation](FOUNDATION_VALIDATION.md), com contratos em [CATALOG.md](CATALOG.md), [BOOKING_API.md](BOOKING_API.md), [WHATSAPP.md](WHATSAPP.md) e [ADMIN.md](ADMIN.md). O MVP completo ainda depende dos próximos itens do roadmap.

## Agenda individual e organização do dashboard — 10/09/2026

O site e a agenda interna dispensam escolhas redundantes de unidade/profissional, conservam seleção explícita em equipes e invalidam escolhas incompatíveis após troca de serviço. A configuração semanal individual pode atualizar expediente e escala numa operação; diferenças existentes exigem optar pela unificação. O dashboard separa rotina de atendimento e configuração da barbearia.

Passaram lint, typecheck e build (18 pacotes), 199 testes unitários em 17 arquivos, 135 testes de integração com PostgreSQL, 10 cenários de admin/site e 12 cenários do dashboard em desktop e celular. A execução inicial encontrou HTTP 429 no login de teste; a repetição completa passou. O cenário de cancelamento foi atualizado para os botões diretos de atendimento adicionados em paralelo, preservando essa implementação. Capturas desktop e mobile do painel e a configuração móvel de horários foram inspecionadas, sem rolagem horizontal.

Não houve migration, alteração de dados reais de barbearias ou envio de mensagens externas. A autorização do papel BARBER permanece com os limites do Core atual.

## Correções do code review — execução anterior de 10/09/2026

Foram tratados os nove achados de [CODE_REVIEW_2026-09-10.md](CODE_REVIEW_2026-09-10.md), incluindo regressões automatizadas incorporadas ao repositório. Não houve alteração de schema, migração de dados de clientes ou envio externo real. Planos sem composição ficam inativos; o editor legado do dashboard orienta para o fluxo versionado no admin global.

| Verificação | Resultado |
| --- | --- |
| Lint e fronteiras de apresentação | Passaram |
| Typecheck | 18 pacotes passaram |
| Testes unitários | 197 testes, 16 arquivos, passaram |
| Integração PostgreSQL isolado | 135 testes, 11 arquivos, passaram |
| Build | 18 pacotes passaram |
| Navegador desktop/celular — admin e site | 10 cenários passaram, incluindo criação de usuário/planos e clique na âncora HTML/CSS seguido de reserva |
| Navegador desktop/celular — dashboard | 10 cenários passaram, incluindo busca além dos primeiros 50 clientes, paginação, cadastro, edição e agenda |

As regressões verificam recuperação e verificação real pelo fluxo da biblioteca de autenticação com captura de e-mail em memória; origem das escritas; plano inativo versus cópia de entitlements; consentimento revogado; busca e paginação; aposentadoria da escrita legada e imutabilidade da versão publicada; providers sem fallback silencioso e sem conteúdo pessoal nos logs. Entregas SMTP/Meta reais e homologação produtiva não foram executadas.

## HTML/CSS, composição visual e agenda pública — execução anterior de 10/09/2026

O editor agora integra composição visual, HTML/CSS validado, três apresentações de preços e agenda pública com os mesmos contratos do Core. Não houve nova migration nem publicação de cliente real.

| Verificação | Resultado |
| --- | --- |
| Lint e fronteiras | Passaram. |
| Typecheck | Passou na raiz e nos 18 pacotes/aplicações. |
| Unitários | 190 testes passaram em 14 arquivos. Inclui rejeição de scripts, eventos, imports, URLs CSS e limites de complexidade. |
| PostgreSQL/API | 128 testes passaram em 10 arquivos, incluindo publicação/rollback do código, documento acima de 32 KiB, opções públicas ativas, entitlement e publicação obrigatórios. |
| Build | Passou nos 18 pacotes/aplicações. Site público recompilado após o ajuste de validação de Origin. |
| API compilada | Inicialização e readiness com o banco isolado passaram. |
| Regressão Foundation | 6 testes de temas e acesso passaram em computador/celular. |
| Navegador admin | Os 6 cenários existentes passaram. Os 2 novos cenários de código e reserva passaram em execução focada após as correções, em computador/celular. |
| Serviços externos, CI remota e deploy | Não executados. |

O navegador salva e publica HTML/CSS com componentes reais de preços e agenda, confirma horários no fuso da unidade e simula uma resposta perdida após a API criar a reserva. A repetição conserva o corpo e a chave e resulta em apenas um agendamento no banco. Também recusa hostname enviado na query, caminho desconhecido e Origin de outro site. Capturas de computador e celular inspecionadas, sem rolagem horizontal no conteúdo público.

As verificações identificaram nomes acessíveis de campos, a necessidade de usar Host público na checagem de Origin e uma exportação incompatível da página de clientes, que foram corrigidos. O simulador de rede recebeu resolução loopback explícita porque Node não resolve os subdomínios `.localhost` como o Chromium. O formulário atualizado de Convidado/Já sou cliente foi preservado; isso não representa autenticação ou verificação de telefone.

Limites: HTML/CSS pertence ao contrato fechado descrito em [SITE_EDITOR.md](SITE_EDITOR.md), sem JavaScript livre, uploads ou múltiplas páginas. Conteúdo do modo código depende de hidratação em iframe. Verificação de posse do telefone e proteção distribuída contra abuso continuam pendentes para operação comercial.

## Editor do site — 09/09/2026

Implementado o [editor de site](SITE_EDITOR.md) com prévia autenticada, temas compatíveis, tokens, textos, seções estruturadas e versões persistidas. Rascunho, aprovação, publicação e restauração usam auditoria e validação no Core; nenhum site real foi publicado durante os testes.

| Verificação | Resultado |
| --- | --- |
| Lint e fronteiras | Passaram. |
| Typecheck | Passou na raiz e nos 18 pacotes/aplicações. |
| Unitários | 164 testes passaram em 13 arquivos, incluindo escape de conteúdo e ordem/visibilidade de seções. |
| Integração PostgreSQL/API | 126 testes passaram em 10 arquivos. O editor cobre isolamento, entitlement, inputs, concorrência, publicação e rollback. |
| Build | Passou nos 18 pacotes/aplicações. |
| API compilada | Inicialização e readiness com PostgreSQL passaram. |
| Navegador do admin | 6 testes passaram em computador/celular, incluindo edição, prévia, nova seção, reordenação, rascunho, aprovação e publicação fictícia. |
| Regressão Foundation no navegador | 6 testes passaram: temas anteriores, recusa de tema desconhecido e acesso, em computador/celular. |
| CI remota, deploy e publicação de cliente real | Não executados. |

Capturas do editor em computador/celular foram inspecionadas. Uma falha intermediária de lint foi corrigida; o teste de navegador identificou carregamento do iframe antes da hidratação, corrigido com inicialização tanto pela referência do iframe como pelo evento de carregamento. As execuções finais acima passaram. O editor anterior de preferências não modifica mais snapshots publicados. Uploads, páginas extras, composição bespoke e reserva online na composição editável permanecem fora deste incremento.

## Edição da barbearia — 09/09/2026

Página global `/tenants/:id` implementada com configuração geral, contatos, plano/situação, cadastro/edição de unidades e consulta das pessoas vinculadas. Sem nova migration. `LocationOperations` conserva as regras compartilhadas do painel operacional, incluindo limite de unidades, versões e bloqueio de desativação com atendimentos futuros.

- Lint e typecheck passaram; build dos 18 pacotes/aplicativos passou.
- 163 testes unitários passaram. A integração completa passou com 122 testes em 9 arquivos; a suíte focada de admin/unidades passou com 15 testes.
- Os quatro testes do admin passaram em computador/celular, agora incluindo abrir pela lista, editar contatos, editar unidade, cadastrar unidade inativa, recarregar e conferir persistência. Capturas inspecionadas e ausência de rolagem horizontal verificada.
- Novos cenários negativos comprovam SUPER_ADMIN nas rotas de edição, rejeição de Origem ausente/campos desconhecidos, timezone inválido, escrita concorrente, unidade alheia e limite de recursos.
- Não executados neste incremento: CI remota, deploy ou serviços externos. Pessoas com acesso são apenas consultadas; convites, troca de proprietário e gestão de funções ainda não fazem parte do editor.

## Incremento anterior de 09/09/2026

| Verificação | Resultado |
| --- | --- |
| Lint | Passou, incluindo verificação de fronteiras. |
| Typecheck | Passou na raiz e nos 18 pacotes/aplicações. |
| Testes unitários | 163 testes passaram em 12 arquivos. |
| Integração PostgreSQL/API | 120 testes passaram em 9 arquivos no PostgreSQL 18.4 isolado. |
| Build | Passou nos 18 pacotes/aplicações. |
| API compilada | Inicialização, health e readiness com PostgreSQL passaram. |
| Navegador do admin global | 4 testes passaram: consultas e cadastro em computador/celular, incluindo recuperação do formulário após erro e persistência no banco. Capturas inspecionadas. |
| Regressão de navegador operacional | 8 testes passaram: unidades, catálogo, concorrência de edição e jornada de agenda, em computador/celular. |
| Regressão de navegador Foundation | 6 testes passaram: previews, tema desconhecido e telas de acesso, em computador/celular. |
| Banco de desenvolvimento | Conferência confirmou oito migrations aplicadas e permissões de OWNER, MANAGER, RECEPTIONIST e BARBER compatíveis com a agenda geral. |
| CI remota e integrações externas | Não executadas nesta entrega. |

Além do catálogo e agenda, a integração cobre onboarding concorrente, limites de unidades, API pública, administração global e WhatsApp. A fila WhatsApp é criada na transação da reserva; os testes verificam isolamento, consentimento/revogação, versões obsoletas, concorrência de workers, falhas e novas tentativas. O adapter externo usa respostas simuladas; não houve envio real pela Meta.

O admin tem autorização negativa, paginação e cadastro concorrente testados. O vínculo de profissional recusa contas sem membership ativa no mesmo tenant, tanto em criação como em edição. A suíte de navegador verificou que erro de proprietário não apaga os dados digitados. Falhas intermediárias de seletores acessíveis e de enum no novo teste foram corrigidas antes das execuções finais acima.

## Resultados anteriores — 08/09/2026

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

Onboarding, gestão de unidades e confirmações WhatsApp da agenda interna foram adicionados no incremento de 09/09. Clientes possuem API de criação/edição/busca e seleção/cadastro no fluxo de reserva; não há tela independente de CRM. Não existem novos holds PENDING com expiração nem pagamento. A API de reserva pública foi testada, mas o widget público e o editor de site recebidos nas atualizações ainda não têm jornada completa certificada. A agenda própria do BARBER continua bloqueada até a autorização de todos os endpoints estar concluída.

Os testes de navegador provisionam contas fictícias verificadas e usam login real. Verificação/reset por email são exercitados nas integrações com adapter em memória; isso não comprova entrega SMTP externa. Docker/Compose, fila real/Redis, SMTP, Mercado Pago, Cloudflare, carga, CI remota e deploy de produção não foram validados neste incremento. O banco local de desenvolvimento recebeu a migration aditiva e o seed de desenvolvimento; o PostgreSQL de testes permanece separado.

## Painel mobile — 15/09/2026

Implementados início compacto com busca de atalhos, navegação inferior tenant-scoped, navegação de datas na agenda, filtros por situação e busca local por cliente/telefone/profissional. Corrigida conversão de telefone com DDD no cadastro de clientes. Sem alteração de schema ou de autorização do Core.

- Lint e verificação de fronteiras: passaram.
- Typecheck: passou nos 18 pacotes; compilação final do dashboard também verifica TypeScript.
- Testes unitários: 234/234 passaram.
- Build do monorepo: 18/18 tarefas passaram; dashboard recompilado após ajustes finais.
- Testes de navegador: início, busca de atalhos, navegação entre datas, filtros, cadastro/edição de clientes e jornada de agendamento passaram em desktop e mobile. A rodada completa teve 11/12 aprovações, com uma interrupção `ERR_NETWORK_IO_SUSPENDED` ao recarregar unidades e timeout da limpeza das fixtures; não foi uma falha de assertiva da interface.
- Preparação local: navegador instalado em `.local/playwright` (ignorado pelo Git); duas migrations existentes aplicadas exclusivamente em `platform_test`. As primeiras tentativas foram bloqueadas por navegador ausente e banco de testes desatualizado, ambos corrigidos.
- A suíte de integração dedicada não foi repetida; os testes de navegador usaram API e PostgreSQL reais com fixtures isoladas.

Os limites já documentados do papel BARBER e da agenda própria continuam vigentes. Este incremento melhora a experiência de acessos já autorizados e não libera novas permissões.

Reexecução direcionada final: 4/4 testes de início e unidades passaram em desktop/mobile, incluindo o caso antes interrompido. Build final do dashboard passou. Capturas revisadas em `test-results/dashboard-final/` (início, agenda e horários); cenários com agendamento e clientes permanecem em `test-results/catalog/`. Nenhuma falha remanescente foi observada na reexecução direcionada; a rodada completa não foi repetida após essa confirmação.
# Proteção distribuída e frontends — 15/09/2026

Registro histórico da validação daquela data. A integração por QR foi removida em 18/09/2026; os números abaixo não representam a suíte atual.

## Retirada do provider por QR — 18/09/2026

Removidos adapter de envio, conexão por QR, configuração, Compose opcional, interface e testes exclusivos desse provider. O worker de confirmações continua usando a API oficial da Meta. Envio e conferência do código da reserva pública retornam 503 `VERIFICATION_UNAVAILABLE`; a criação de reserva continua exigindo um token válido. O teste unitário cobre a falha segura; o teste de integração foi acrescentado, mas não pôde ser executado porque PostgreSQL e Redis de teste não estavam acessíveis.

Verificações desta mudança: lint passou; typecheck passou em 18 pacotes; 249 testes unitários passaram; build passou em 18 tarefas. A suíte de integração falhou na preparação por indisponibilidade dos serviços locais, antes de executar os casos de API.

Validação local deste incremento, preservando as alterações anteriores do workspace:

| Verificação | Resultado |
| --- | --- |
| Lint e fronteiras | Passaram. |
| Typecheck | Raiz e 18 pacotes passaram. |
| Unitários | 255 passaram na revisão original, incluindo o contrato do provider posteriormente removido. |
| Integração | 139 passaram, PostgreSQL e Redis reais; inclui concorrência entre duas APIs, expiração, spoofing de IP não confiável, Redis desconectado e reserva concorrente de tentativas de envio. |
| Navegador | 2 passaram, desktop e celular, geração/expiração/erro/recuperação/conexão com provider fictício. |
| Build | 18 tarefas passaram, inclusive os três frontends com `NEXT_STANDALONE=1`. |
| Runtime | API compilada e três servidores standalone passaram; HTTP e assets estáticos disponíveis. |
| Docker/CI remoto | Não executados localmente: Docker ausente. Workflow de construção e smoke test das imagens adicionado. |
| Envio externo | Não foi realizado na revisão original. |

A primeira execução encontrou três fixtures de reserva pública sem o token de telefone exigido pelo contrato existente. Foram corrigidas com verificação fictícia explícita, conservando o teste de rejeição de token inválido. Não houve flexibilização do controle de identidade. Publicação não realizada; operação e variáveis em [DEPLOYMENT.md](DEPLOYMENT.md) e [WHATSAPP.md](WHATSAPP.md).

## Correções do dashboard — 15/09/2026

Removido acesso visual ao editor de site; navegação de gestão compartilhada e página Dados da barbearia integrada ao shell do catálogo. Edição de cidade/estado preserva demais campos do endereço. Lint, typecheck, 255 testes unitários e build passaram. Quatro testes Playwright passaram em desktop/mobile cobrindo navegação, ausência do editor, redirecionamento da URL antiga, overflow e persistência do endereço. Auditoria estática estrita do dashboard: zero findings, em premium-dashboard-audit.json. Autoridade SUPER_ADMIN do workspace confirmada em FoundationServices.adminSiteEditor.
# Alteração de 18/09/2026 — reserva pública sem OTP

Por decisão de produto, a reserva pública aceita número de telefone sem verificação. O widget confirma a reserva diretamente e preserva a chave de idempotência em tentativas cuja resposta se perdeu. Os endpoints de OTP foram removidos; campo `verificationToken` é rejeitado. O envio automático via API oficial da Meta, o processamento da fila WhatsApp, o histórico/reenvio e as telas correspondentes foram removidos. Tabelas e consentimentos históricos permanecem no banco para compatibilidade; nenhuma nova mensagem é enfileirada. O risco de reservas com telefone de terceiros e abuso permanece aberto. Esta seção substitui as descrições históricas abaixo sobre o comportamento atual.
