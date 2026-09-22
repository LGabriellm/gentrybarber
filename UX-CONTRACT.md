# Contrato de UX

## Contexto do produto

- Público: operadores globais e equipes de barbearias brasileiras, com prioridade para uso móvel.
- Tarefas principais: administrar contas, acessos, barbearias, catálogo, horários, agenda e publicação do site.
- Localidade ativa: `pt-BR`. Instantes persistem em UTC; horários recorrentes usam o fuso IANA da unidade.
- Acessibilidade: WCAG 2.2 AA.

## Fontes de negócio

| Escopo | Fonte autoritativa | Tipo |
|---|---|---|
| Identidade e permissões | `docs/SECURITY.md`, `docs/adr/0005-auth-and-adapters.md` | Política / ADR |
| Isolamento e ciclo dos dados | `docs/DOMAIN_MODEL.md`, `docs/adr/0002-tenant-isolation.md` | Modelo / ADR |
| Catálogo e agenda | `docs/CATALOG.md`, `docs/BOOKING.md` | Contrato de domínio |
| Administração global | `docs/ADMIN.md` | Contrato de API e produto |
| Cobrança | `docs/BILLING.md` | Especificação |

## Contrato visual

`DESIGN.md` registra a intenção visual. `docs/DESIGN_SYSTEM.md`, `packages/design-system` e `packages/ui` são as fontes de tokens e primitivas. Telas administrativas preservam o shell verde, superfícies claras, foco visível e densidade existentes; mudanças de uma feature não redefinem tokens globais.

## Mapa canônico

| Capacidade | Dono | Variantes | Verificação |
|---|---|---|---|
| Select | controle nativo estilizado do formulário compartilhado | create / edit | teclado e mobile |
| Formulário | schema Zod no backend + formulário React | create / edit | integração + E2E |
| Tabela | `admin-data.tsx` e `admin.css` | desktop / cartões no mobile | E2E responsivo |
| Feedback | alerta/status inline da seção | sucesso / erro / conflito | live region |
| CRUD | serviços de domínio do Core e server actions do frontend | permanecer na página | integração + E2E |
| Scrollbar | stylesheet global do aplicativo | geometria por superfície | inspeção no navegador |

## Comportamento compartilhado

- Formulários usam `noValidate`, labels explícitos, campos preservados em falhas corrigíveis e botão desabilitado durante envio.
- Mutações são pessimistas. O sucesso permanece na tela, atualiza os dados e anuncia uma mensagem; erro fica junto à ação e oferece recarga quando o estado pode estar obsoleto.
- Conflito de versão nunca sobrescreve silenciosamente: exige recarregar os dados antes de tentar novamente.
- Listas globais usam paginação no servidor com busca, filtros e página na URL. O tamanho padrão é 25.
- Ações de autoridade, senha, sessões, vínculos, catálogo e horários são auditadas no backend.
- Remoções irreversíveis ou de acesso precisam nomear a consequência. O último proprietário ativo de uma barbearia não pode ser removido.
- Senhas permanecem mascaradas, aceitam colagem/gerenciadores, nunca são devolvidas e não aparecem em logs ou mensagens.
- Controles ausentes por permissão não substituem autorização. Navegação direta sem autoridade recebe 403 do backend.

## Navegação e responsividade

- Criação bem-sucedida volta à lista proprietária; edição permanece na tela de detalhe.
- O shell administrativo vira navegação horizontal no celular. Tabelas viram cartões sem perder status ou ações.
- Links de seção preservam uma página única para a barbearia; cada seção possui `scroll-margin` e título próprio.
- Foco visível é obrigatório e não pode ficar coberto por navegação fixa.

## Resiliência e validação

- Frontend usa timeout de 15–20 segundos; em conclusão incerta, orienta recarregar para confirmar o estado.
- Sessão expirada direciona para novo login sem afirmar que a gravação ocorreu.
- Inputs são validados novamente na fronteira da API com schemas estritos; IDs apenas selecionam candidatos já escopados.
- Atualizações concorrentes usam `updatedAt` ou `version`. Envios duplicados são bloqueados pelo estado ocupado.
- Campos sensíveis ou de autoridade não são aceitos por mass assignment.

## Verificação

- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` e `pnpm build`.
- Fluxos administrativos críticos: `apps/api/test/admin.integration.test.ts` e `tests/e2e-admin/admin.spec.ts`.
- Matriz manual: desktop e celular, teclado, carregamento, vazio, erro, conflito, sessão expirada e sucesso em `pt-BR`.

