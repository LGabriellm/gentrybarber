# Code review — 10/09/2026

**Atualização após autorização de correção:** os nove achados abaixo foram tratados. A descrição original foi preservada como histórico. Cadastros encaminham Origin; clientes usam a rota operacional e busca paginada; âncoras do HTML/CSS permanecem no documento; consentimento de cliente existente é preservado; simuladores exigem configuração explícita fora de produção; login inicia verificação de e-mail pendente; planos copiam recursos de uma origem configurada ou ficam inativos; o editor legado foi desativado em favor do editor global versionado. Evidência atual em [MVP_VALIDATION.md](MVP_VALIDATION.md).

Revisão do estado atual do workspace, incluindo alterações ainda não commitadas. Foram examinados os fluxos de administração global, clientes, autenticação, edição/publicação do site, agendamento público, notificações e suas fronteiras de autorização e isolamento. Nenhuma correção de implementação foi aplicada nesta revisão.

Foram encontrados **9 problemas acionáveis: 5 de prioridade alta (P1) e 4 de prioridade média (P2)**. As prioridades consideram impacto funcional e as condições descritas abaixo; não significam que todas as falhas estejam acontecendo em produção.

## 1. P1 — Cadastro de usuários e planos perde o Origin exigido pela API

- **Local:** `packages/web-kit/src/server.ts:14`, chamado pelas actions de `apps/admin/app/users/new` e `apps/admin/app/plans/new`.
- **Cenário:** um administrador autenticado envia qualquer um dos novos formulários. `apiPost` encaminha o cookie, mas omite `Origin`; `FoundationServices.adminWrite` exige uma origem confiável.
- **Consequência:** os dois cadastros são rejeitados com HTTP 403 mesmo com dados válidos e sessão autorizada.
- **Evidência:** reprodução pela API com sessão de superadmin: ambas as requisições sem Origin retornaram 403; as correspondentes com origem autorizada retornaram 201.
- **Correção recomendada:** encaminhar a origem da requisição recebida, seguindo o padrão das outras actions administrativas, e manter a validação de origem no backend. Cobrir o envio real dos dois formulários em teste de navegador.

## 2. P1 — A interface de clientes usa uma rota que rejeita esse recurso

- **Local:** `apps/dashboard/components/customer-manager.tsx:28`.
- **Cenário:** criar, editar ou recarregar clientes usa `/api/tenants/{slug}/customers`. Esse caminho chega ao proxy de catálogo, cuja lista de recursos permite apenas serviços, profissionais e unidades.
- **Consequência:** a lista inicial pode aparecer por ser carregada no servidor, mas as operações da interface retornam 404.
- **Evidência:** GET, POST e PATCH reproduzidos contra o proxy retornaram 404. O proxy operacional existente atende clientes em `/api/operations/{slug}/customers`.
- **Correção recomendada:** apontar a interface para a rota operacional e testar criação, edição e recarga pelo navegador.

## 3. P1 — Links internos podem apagar o site no modo HTML/CSS

- **Local:** `packages/themes/src/code-site.tsx:27` e `:31`.
- **Cenário:** clicar em um link como `<a href="#agenda">Agendar</a>` dentro do documento `srcDoc`. O endereço é resolvido a partir da página que contém o iframe, provocando uma navegação dentro dele em vez de apenas rolar o conteúdo personalizado.
- **Consequência:** a política `frame-ancestors` do site bloqueia a página carregada; o conteúdo e a agenda deixam de ficar acessíveis. O modelo inicial do editor contém links desse tipo.
- **Evidência:** reprodução em Chromium a partir do teste de publicação HTML/CSS, acrescentando o clique em “Reservar horário”. O trace registra uma navegação de iframe para a raiz do site e o erro de Content Security Policy; em seguida, o campo Unidade desaparece.
- **Correção recomendada:** tratar a navegação por fragmentos dentro do próprio documento personalizado, preservando as proteções do iframe e do site. Incluir o clique nos links do modelo no teste de publicação.

## 4. P1 — Reserva anônima altera consentimento de um cliente existente

- **Local:** `apps/api/src/booking.ts:468–469`.
- **Cenário:** uma pessoa envia uma reserva pública usando o telefone de um cliente existente e `whatsappOptIn: true`. Quando o cadastro está sem consentimento, o backend grava `whatsappOptInAt` sem comprovar que o visitante controla o telefone.
- **Consequência:** um consentimento revogado pode ser reativado e uma confirmação de WhatsApp enfileirada. A alteração também não incrementa a versão do cliente nem gera o evento de auditoria de opt-in usado pelo fluxo administrativo.
- **Evidência:** reserva anônima retornou 201, alterou o consentimento de um cliente existente, manteve sua versão e criou uma notificação; nenhum evento `customer.whatsapp_opted_in` foi registrado. Nenhuma mensagem real foi enviada no teste.
- **Correção recomendada:** separar a preferência informada na reserva da alteração persistente do cadastro existente; exigir comprovação de identidade para reativar esse consentimento e registrar versão/auditoria na transição autorizada.

## 5. P1 — Worker pode simular entregas em produção sem sinalizar erro

- **Local:** `apps/worker/src/main.ts:9–10`.
- **Cenário:** o worker inicia sem contas WhatsApp configuradas ou sem SMTP completo. A seleção de providers cai automaticamente nos adapters de console, sem verificar o ambiente de execução.
- **Consequência:** o WhatsApp pode ser marcado como `SENT` com identificador fictício, e jobs de e-mail podem terminar com sucesso sem entrega. O adapter de e-mail imprime o texto completo, incluindo links de recuperação/verificação; o de WhatsApp imprime destinatário e dados do atendimento.
- **Evidência:** fluxo confirmado por inspeção da seleção dos providers, dos adapters de console e da finalização no outbox. A validação de configuração usada pela API não protege essa inicialização independente do worker. Não foi executado um worker de produção.
- **Correção recomendada:** permitir providers de simulação somente por configuração explícita de desenvolvimento/teste; em produção, recusar a inicialização ou registrar configuração ausente sem declarar entrega bem-sucedida. Não registrar links de autenticação nem conteúdo pessoal integral.

## 6. P2 — Usuário criado pelo administrador continua sem conseguir entrar após recuperar a senha

- **Local:** `apps/api/src/admin.ts:66`.
- **Cenário:** a criação grava o usuário com `emailVerified: false`, sem iniciar convite/verificação. A tela orienta usar “Esqueci minha senha”, mas esse fluxo cria a credencial sem verificar o e-mail. O login exige verificação e a configuração atual não envia verificação no sign-in.
- **Consequência:** mesmo após definir a senha pelo caminho indicado, a nova conta recebe `EMAIL_NOT_VERIFIED` e não consegue acessar. Este problema persiste depois da correção do Origin descrita no item 1.
- **Evidência:** criação autorizada com 201, recuperação de senha concluída e login posterior com 403/`EMAIL_NOT_VERIFIED`. O adapter de teste recebeu somente o e-mail de recuperação.
- **Correção recomendada:** implementar um convite/verificação compatível com a biblioteca de autenticação e ajustar a orientação da tela. Não marcar o e-mail como verificado apenas porque um administrador digitou o endereço.

## 7. P2 — Novo plano é disponibilizado sem nenhuma funcionalidade habilitada

- **Local:** `apps/api/src/admin.ts:76`.
- **Cenário:** criar um plano grava apenas o registro comercial com `active: true`; não há configuração de `PlanFeature` na operação. A tela informa que ele estará imediatamente disponível para novas barbearias.
- **Consequência:** o plano pode ser selecionado, mas o Feature Engine nega os recursos sem entitlements. Uma barbearia atribuída a ele perde acesso às funcionalidades dependentes desses vínculos, salvo overrides individuais já existentes.
- **Evidência:** criação autorizada retornou 201 e o plano resultante tinha zero vínculos de funcionalidades.
- **Correção recomendada:** configurar a composição do plano antes de disponibilizá-lo, ou mantê-lo inativo/em preparação até concluir essa configuração, sem hardcode de planos ou preços.

## 8. P2 — “Meu Site” salva aparência que o site público não utiliza

- **Local:** `apps/api/src/services.ts:91–100`; consumo público em `:190`.
- **Cenário:** o editor do painel da barbearia salva em `TenantDesignConfig`, enquanto o renderer público lê a configuração da versão publicada. A tela continua prometendo aplicação imediata.
- **Consequência:** o formulário informa sucesso, porém o site não muda, deixando dois fluxos de edição com resultados inconsistentes.
- **Evidência:** salvar `#abcdef` persistiu a preferência; a resposta pública continuou fornecendo `#123456` da versão publicada.
- **Correção recomendada:** integrar esse editor ao fluxo de rascunho/preview/publicação já existente, ou desativar o fluxo legado com orientação clara. Preservar a imutabilidade das versões publicadas.

## 9. P2 — Busca de clientes ignora cadastros além dos primeiros 50

- **Local:** `apps/dashboard/components/customer-manager.tsx:31`; limite da API em `apps/api/src/booking.ts:253`.
- **Cenário:** a tela recebe no máximo 50 clientes e filtra somente esse array localmente. O campo de busca não utiliza o parâmetro `q` já oferecido pela API.
- **Consequência:** clientes existentes fora dessa primeira página aparecem como inexistentes na busca; recarregar a lista não resolve. É independente da rota incorreta do item 2.
- **Evidência:** com 51 clientes, o último não veio na listagem inicial; a consulta da API com `q` retornou corretamente o mesmo cadastro.
- **Correção recomendada:** fazer a pesquisa no servidor e oferecer navegação da lista ou carregamento progressivo, mantendo o escopo do tenant.

## Validação e limites

- **Passaram:** lint, typecheck, testes unitários e build do workspace.
- **Passaram:** 128 testes de integração existentes em PostgreSQL isolado, mais 7 reproduções adicionais desta revisão — 135 testes, 11 arquivos, na execução conjunta.
- **Falhou, confirmando o item 3:** o cenário adicional de navegador com clique na âncora do site HTML/CSS. O trace foi inspecionado para distinguir navegação bloqueada de mero timeout do teste.
- **Passaram:** os 4 cenários originais do admin/site em Chromium, incluindo publicação HTML/CSS e reserva com repetição idempotente. Esses cenários não clicam na âncora que reproduz o item 3.
- **Apontou problemas de formatação:** `git diff --check` encontrou espaços ao final de linhas e linhas vazias extras em alterações existentes. Não foram classificados como defeitos funcionais nem corrigidos nesta revisão.
- **Não executados:** entregas reais por SMTP/Meta, testes de carga, homologação em produção e varredura externa de segurança. A conclusão sobre o fallback do worker é baseada no código, não em entrega real.

Os testes adicionais usam dados próprios em banco isolado e adapters sem envio externo. Os arquivos de reprodução e traces estão em `.local/review/`, ignorados pelo Git; podem conter dados e sessões sintéticos, por isso não foram incorporados à documentação. Testes verdes comprovam os cenários cobertos; não eliminam os defeitos acima nem certificam segurança de produção.
