# Site Workspace — administração global

Acesse **Barbearias → Gerenciar site**. Apenas contas `SUPER_ADMIN` criadas/promovidas por um operador autorizado acessam a administração. O cadastro em **Usuários → Novo usuário** permite criar outra conta global; ela define a senha e verifica o e-mail pelo fluxo de autenticação existente. Proprietários de barbearias não recebem autoridade global.

## Edição por arquivos

O editor visual antigo foi removido. O novo workspace oferece HTML, CSS, conteúdo JSON, arquivos de imagem, catálogo de componentes, prévia de computador/celular e histórico. A prévia é atualizada explicitamente após validação; o agendamento na prévia é demonstrativo.

- `index.html`: fragmento HTML semântico, até 30.000 caracteres, 500 tokens e profundidade 24. Sem doctype, html/head/body, scripts ou eventos. O interpretador cria nós React; não executa HTML recebido.
- `styles.css`: até 20.000 caracteres. CSS de apresentação, variáveis, grid/flex, media queries e keyframes. Sem imports, carregamento de URLs ou scripts. Regras ficam isoladas no iframe.
- `content.json`: objeto com apenas `tokens` e `content`, conforme `siteEditorConfigSchema`. Guarda textos, SEO, fotos de marca e conteúdo editorial dos componentes. Não aceita IDs de tenant, preços ou autoridades.
- `assets/`: até 10 imagens PNG, JPEG ou WebP, cada uma até 58 KiB. Nomes alfanuméricos com hífen/underscore, até 64 caracteres antes da extensão minúscula. Validação de extensão, tipo declarado, assinatura binária e tamanho no contrato compartilhado e no backend. Não equivale a varredura antivírus ou transcodificação.
- `*.site.json`: pacote portátil `{ format: "barber-site", version: 1, config }`, até 950 KB para importação. Exporta apresentação e imagens, sem identidade de tenant nem estado de publicação.

Importação aceita arquivos individuais juntos (nomes fixos acima) ou um único projeto. Importar altera o rascunho local; salvar persiste. Arquivos com mesmo nome substituem o asset local. Remover imagem ainda referenciada bloqueia a validação até corrigir o HTML. Não se aceitam ZIP, JavaScript/TypeScript, executáveis, SVG, fontes ou vídeos.

Imagens usam `<img src="assets/foto.webp" alt="Descrição real" loading="lazy" />`. Os bytes são incorporados à versão, não gravados em caminhos escolhidos pelo cliente. O limite total da configuração é 900.000 bytes; a rota aceita até 1 MiB. As imagens de uma versão são resolvidas apenas dentro dela.

## Estilização e componentes

A biblioteca local **Studio Utilities** está incluída em todas as apresentações por código. Não é o compilador Tailwind: oferece classes como `container`, `flex`, `grid`, `items-center`, `justify-between`, `gap-4`, `p-8`, `py-16`, `text-center`, `font-bold`, `rounded`, `grid-cols-2` e `grid-cols-3`. As grades passam a uma coluna até 640 px. O CSS autoral entra depois, permitindo sobrescrever todas as regras.

O catálogo do workspace insere componentes registrados: `barber-hero`, `barber-logo`, `barber-cover`, `barber-prices`, `barber-team`, `barber-booking`, `barber-contact`, `barber-map`, `barber-gallery`, `barber-hours`, `barber-faq`, `barber-testimonials`, `barber-stats`, `barber-cta`, `barber-social` e `barber-whatsapp`. Todos aceitam `class`, ID e atributos textuais permitidos; os seletores internos podem ser estilizados. `barber-prices` aceita `layout="table|cards|list"`. `barber-whatsapp` abre o WhatsApp cadastrado nos dados da barbearia em outra aba e não aparece sem número válido; o destino não é definido pelo HTML. Componentes não aceitam filhos; use HTML autoral ao redor para uma composição exclusiva. Novos comportamentos exigem componentes revisados no repositório.

Serviços, preços, profissionais e reserva continuam vindo do Core. Depoimentos, perguntas, horários editoriais e destaques vêm de `content.sections`. Personalizar a apresentação não modifica regras comerciais, disponibilidade ou autorização.

## Versões, compatibilidade e publicação

1. Salvar cria snapshot DRAFT com controle de concorrência.
2. Aprovar identifica exatamente a versão salva.
3. Publicar exige APPROVED e referência publicada atualizada.
4. Restaurar seleciona uma versão anteriormente publicada do mesmo tenant.

Operações mantêm sessão, autoridade global, Origin, Feature Engine, ownership do tema, auditoria e transação. Rotas: GET `/v1/admin/tenants/:id/website`, POST `.../drafts`, POST `.../transitions`. O projeto usa o tema compatível já selecionado para o tenant; a importação não transfere tema exclusivo de outro cliente.

Não há migration: `code.assets` é opcional no JSON versionado existente. Publicações anteriores continuam renderizando pelos caminhos de compatibilidade. Ao abrir um site visual antigo, a interface cria uma proposta inicial por código e avisa; não há conversão automática fiel do layout antigo nem mudança pública antes da publicação. Reverter o aplicativo exige primeiro restaurar uma versão compatível.

O corpo por código ainda é montado após hidratação em iframe; metadados SEO permanecem na página principal. Não há múltiplas páginas, JavaScript arbitrário, compilação Tailwind nem deploy externo por cliente.

## Geração assistida

A skill do projeto `generate-barbershop-site` orienta criar os arquivos e integrá-los ao workspace. `pnpm site:pack <pasta> <destino.site.json>` valida os mesmos contratos antes de produzir um pacote novo; recusa sobrescrever arquivo existente. Importar e salvar pelo admin preserva o contexto autenticado. Um servidor MCP separado não é necessário: o contrato de projeto e as APIs existentes já cobrem esta função.

## Validação da entrega — 15/09/2026

- `pnpm lint`: passou (inclui fronteiras de apresentação).
- `pnpm typecheck`: passou nos 18 pacotes.
- `pnpm test`: 242 testes passaram, em 21 arquivos.
- `pnpm test:integration`: 135 testes passaram no banco isolado, em 11 arquivos.
- `pnpm test:e2e:admin`: 10 jornadas passaram em Chromium desktop e celular, incluindo importação, persistência, publicação, exportação e reserva idempotente.
- `pnpm build`: passou nos 18 pacotes.
- `pnpm site:pack`: pacote de teste gerado e validado. Validador oficial da skill: passou.

As tentativas iniciais encontraram dependências locais bloqueadas/ausentes e expectativas antigas no teste de navegador. Os testes foram corrigidos para aguardar a nova versão publicada e respeitar o contrato atual de unidade fixa da página pública. A execução final dos gates acima passou. Não houve deploy produtivo. Capturas e relatório E2E ficam em `test-results/admin` e `playwright-report/admin` (artefatos locais ignorados pelo Git).

O dashboard da barbearia não apresenta editor nem atalho de edição. A rota antiga `/tenants/:slug/website` retorna ao início preservando o tenant. Alterações de HTML, CSS, conteúdo editorial e publicação são responsabilidade exclusiva da agência por conta SUPER_ADMIN; o backend revalida essa autoridade em cada operação do workspace.
