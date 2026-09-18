# Segurança e modelo de ameaças

O principal risco é um usuário ou requisição operar sobre dados de outro tenant. A Foundation precisa provar as fronteiras de contexto, membership, permissão, feature e repositório. A existência deste documento não comprova que todas as proteções de produção estejam ativas; consultar [FOUNDATION_VALIDATION.md](FOUNDATION_VALIDATION.md).

## Identidade e autorização

Better Auth gerencia login, logout, sessão, verificação de e-mail e recuperação de senha. E-mails transitam pelo adapter de notificações/SMTP. Sessões devem usar secrets externos ao Git, expiração, cookies HttpOnly, SameSite apropriado e Secure em HTTPS. Separar origens permitidas de desenvolvimento e produção; não aceitar wildcard de origem com credenciais.

Memberships da aplicação determinam acesso ao tenant. Roles previstas são OWNER, MANAGER, RECEPTIONIST e BARBER, com permissões explícitas como `website.manage`, `team.manage` e `billing.read`. SUPER_ADMIN é uma autoridade de plataforma separada; não transformar um role nomeado pelo tenant em acesso global. Ações privilegiadas precisam de auditoria e escopo explícito.

2FA, passkeys e OAuth são preparação futura; não anunciar esses mecanismos como habilitados. Antes de produção, validar os fluxos de reset/verificação de e-mail, expiração, revogação e proteção contra enumeração com o provider configurado. A reserva pública não verifica a posse do telefone; limitar e acompanhar abuso por IP e destino antes de ampliar a operação.

A versão instalada de Better Auth vincula contas externas pela chave composta `(issuer, accountId)`. A migration incremental preserva contas de senha com issuer `local:credential` e exige mapeamento explícito de provedores legados externos. Não inferir equivalência de identidade apenas pelo nome de provider ou e-mail.

O cadastro público não grava `platformRole` nem cria memberships. O comando `pnpm access:grant` serve a operadores com acesso ao banco, exige conta verificada e registra auditoria. Para criar o primeiro SUPER_ADMIN, o operador deve verificar a conta, promover explicitamente o `User.platformRole` e registrar `AuditLog` com recurso, usuário alvo e motivo, em transação administrativa. Nenhuma conta privilegiada é distribuída no seed.

## Fronteiras de entrada

| Ameaça | Decisão / verificação |
| --- | --- |
| IDOR e acesso cruzado | Contexto no servidor, consulta com tenant e FK composta; testes A/B. |
| Mass assignment | Schemas Zod e listas explícitas de campos graváveis; campos de autoridade ficam no servidor. |
| CSRF e CORS | Usar proteção de origem do auth, política de cookies e validar operações com credenciais. |
| Host spoofing | Normalização, registro de domínio e proxy confiável; não confiar em headers encaminhados arbitrários. |
| XSS em conteúdo/tema | Sem HTML/JS livre, escapes de renderização, URLs validadas e CSP compatível. |
| Brute force/abuso | Rate limiting atômico no Redis compartilhado entre réplicas, com TTL e falha fechada; autenticação também usa PostgreSQL. Proxy e namespace conforme DEPLOYMENT.md. |
| Secrets/dados pessoais | Secrets por ambiente; logs estruturados com redação, sem senha, token ou payload de cliente. |
| Arquivos maliciosos | Antes de uploads produtivos: MIME real, tamanho, extensão, dimensões, URLs assinadas e escopo do objeto. |
| Webhook forjado/repetido | Adapter, assinatura, vínculo externo, idempotência e audit log; fluxo futuro de billing. |

Headers de segurança e CSP precisam ser verificados em respostas reais dos frontends; tema registrado não autoriza importar scripts de origem desconhecida. CSS customizado permanece fora do escopo liberado até existir sanitização e isolamento.

Autenticação usa o IP calculado por Fastify, transmitido a Better Auth por um header interno sobrescrito pelo servidor. O cliente não controla esse valor. Para produção atrás de ingress, seguir a configuração restrita de proxies em [DEPLOYMENT.md](DEPLOYMENT.md); o proxy local Next.js não deve agrupar todos os clientes no mesmo bucket de autenticação em uma instalação pública.

## Dados e operação

Catálogo e agenda exigem sessão verificada, membership/tenant ativos, permissão de ação e entitlement `booking`. Agenda geral exige também `appointments.manage_all`; BARBER não tem esse acesso enquanto não houver vínculo seguro com Professional. Cadastro/busca de clientes e criação de reserva exigem `customers`. Ocultar navegação não substitui esses controles na API.

Proxies do painel restringem caminhos, métodos e parâmetros e limitam corpos JSON a 32 KiB, inclusive por streaming. Escritas exigem Origin de mesma origem no painel e Origin da allowlist na API, incluindo PUT e DELETE. Cookies são encaminhados somente para a API configurada, sem seguir redirects. IDs apenas selecionam candidatos escopados. Reservas usam chave de idempotência por tenant com hash do ator e conteúdo; alterações exigem revisão atual. Auditoria, snapshots e eventos participam da mesma transação. Os testes com PostgreSQL cobrem concorrência e rollback quando a auditoria falha.

Consultas, cache, jobs, storage, exports e busca precisam conservar tenant. RLS é uma defesa complementar possível, não uma proteção implicitamente ativa. Restaurar backups em ambiente isolado e revisar retenção/exclusão antes do uso comercial. Dados demonstrativos devem ser fictícios.

Revisão de release deve cobrir dependências, secrets, observabilidade, comportamento em falhas e rollback. Não tratar testes verdes como certificação geral de segurança: registrar o cenário efetivamente coberto e os limites restantes.
