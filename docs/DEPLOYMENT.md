# Ambiente e operação

## Ambiente local

O monorepo usa Node.js 24, pnpm 11.19.0, Turborepo e Prisma 7.10.0. A configuração raiz e o lockfile registram a versão aplicável. Copiar `.env.example` para o arquivo local previsto no README e preencher valores de desenvolvimento. Não reutilizar credenciais locais em produção e não versionar `.env` real.

O `package.json` fixa Node.js 24.20.0 para Volta e para o [runtime de desenvolvimento do pnpm](https://pnpm.io/package_json#devenginesruntime). O lockfile registra o runtime e sua integridade; `pnpm install --frozen-lockfile` o prepara para os scripts, sem alterar o Node global. Ao atualizar essa versão, manter os dois campos alinhados e atualizar o lockfile. Os frontends usam um preload para ler o `.env` da raiz sem transmitir flags de env-file ao subprocesso do Next.js. Os testes Playwright executam `pnpm dev` dos frontends para cobrir a mesma inicialização utilizada localmente.

Docker Compose fornece PostgreSQL, Redis, MinIO e Mailpit. PostgreSQL guarda o estado; Redis suporta BullMQ; MinIO representa storage S3 compatible; Mailpit captura mensagens SMTP sem envio a destinatários reais. A instalação local precisa gerar Prisma Client, aplicar migrations e carregar dados fictícios antes de abrir os fluxos dependentes do banco.

Comandos executáveis e portas estão no README e scripts raiz. Executar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` e `pnpm test:e2e` para as verificações do workspace. Testes de integração requerem PostgreSQL real e `DATABASE_TEST_URL` apontando para banco exclusivo de testes, com migrations aplicadas; se a dependência estiver indisponível, registrar bloqueio em vez de relatar sucesso. Não usar `prisma db push` como substituto da migration versionada de entrega.

## CI de pull request

Instalar a partir do lockfile → preparar dependências → validar schema e gerar client → aplicar migration em banco descartável → lint → typecheck → unit/integration → build. Jobs devem falhar quando uma etapa exigida falha. Cache inclui lockfile e configuração relevante; secrets não entram nos artefatos.

A [CI](../.github/workflows/ci.yml) usa Node.js 24, pnpm 11.19.0, PostgreSQL 17 em banco `platform_test` e Redis. Aplica migration antes da integração, usa Vitest 5 para testes e instala Chromium para as verificações Playwright. Credenciais fixas do workflow são exclusivamente para os serviços efêmeros da CI.

A CI da Foundation é um gate de qualidade. Não configura deploy automático produtivo. Infraestrutura, domínio, secrets e ambiente de destino ainda precisam ser definidos. Arquivo de workflow criado não significa execução remota observada.

## Imagem de referência para API e worker

O [Dockerfile](../Dockerfile) tem etapas de build/runtime, executa como usuário sem privilégios e aceita somente `APP=api` ou `APP=worker`:

```sh
docker build --build-arg APP=api -t platform-api:foundation .
docker build --build-arg APP=worker -t platform-worker:foundation .
```

Prisma Client é gerado no build. `tsup` inclui os pacotes internos no `dist/main.js` de cada backend; dependências externas continuam resolvidas no workspace instalado. A imagem preserva o workspace para manter os links do pnpm, incluindo dependências de desenvolvimento. Reduzir o tamanho por pruning validado é uma otimização posterior, sem fingir que esta imagem já é mínima.

Injetar secrets apenas ao executar o container. Usar endpoints de rede dos serviços, pois `localhost` dentro do container é o próprio container. API usa `BIND_HOST=0.0.0.0`; worker não oferece servidor HTTP. A porta 4000 da imagem se aplica à API. Migrations são uma etapa controlada de release, não executadas automaticamente por cada réplica ao iniciar.

Este Dockerfile não empacota os três frontends Next.js 16. Para cada frontend, executar seu build no monorepo e publicar o runtime Next.js em ambiente Node.js 24, preservando as dependências do workspace. Definir variáveis públicas antes do build e validar origens/cookies no endereço final. Um empacotamento `standalone` dedicado deve ser adicionado e testado antes de usar containers de frontend em produção.

## Release de produção planejado

### Proxy, cookies e IP de autenticação

Em desenvolvimento os frontends encaminham `/api/auth/*` para a API por um proxy de mesma origem. Cookies ficam no host do painel/admin, sem compartilhamento com subdomínios de barbearias. Esse encaminhamento local agrupa conexões no IP do servidor Next.js.

Em produção, rotear `/api/auth/*` diretamente do ingress de cada painel para a API, mantendo a mesma origem do navegador. O ingress deve sobrescrever `X-Forwarded-For` com o IP observado na conexão e remover headers de identidade enviados pelo cliente. Configurar `TRUST_PROXY_CIDRS` na API com **somente** os IPs/CIDRs desse ingress; o padrão é não confiar em proxies. Nunca usar todas as redes ou encaminhar a cadeia recebida sem validação.

A API calcula `request.ip`, remove qualquer `x-platform-client-ip` de entrada e define esse header internamente para Better Auth. O limiter de autenticação persiste contadores no PostgreSQL. O limite HTTP geral Fastify é local ao processo; um limite global no ingress ou Redis continua necessário ao aumentar réplicas. Verificar IP real, origens, callback URLs e cookies nos hosts finais antes do uso comercial.

Os frontends geram CSP com nonce por requisição. Scripts externos e execução arbitrária não são permitidos; estilos inline continuam necessários aos tokens e componentes controlados. Previews fictícios locais nunca são liberados no modo de produção.

1. Gerar artefatos imutáveis e registrar revisão e migration.
2. Conferir backup/restauração e compatibilidade entre versão anterior e nova.
3. Aplicar migrations compatíveis de expansão antes do código dependente; executar alterações destrutivas em etapa posterior planejada.
4. Publicar API, worker e frontends com health checks e configuração validada.
5. Validar autenticação, tenant A/B, hostnames e tarefas assíncronas.
6. Acompanhar erros, fila e latência; interromper avanço e usar rollback previsto se gates falharem.

Rollback de aplicação não reverte automaticamente banco. Preferir migrations forward e compatibilidade temporária; uma migration destrutiva exige plano específico. Rollback de tema muda a versão publicada e tem ciclo separado do deploy do Core.

## Observabilidade e limites

O incremento de 09/09 adiciona migrations 5/6 para `version` e 7 para consentimento/outbox WhatsApp. Coordenar atualização da API e dos frontends para o contrato `expectedVersion`, sem clientes antigos que enviem timestamps. Para WhatsApp, parar o worker antigo de console, aplicar as migrations e subir o novo consumidor. Preservar a fila legada sem conversão automática de dados sem tenant/consentimento. Configuração, retries e compatibilidade em [WHATSAPP.md](WHATSAPP.md). Onboarding usa o plano configurado em `SystemSetting[onboarding.defaults]`; configurar administrativamente em produção, sem executar seed demonstrativo.

A agenda requer a migration aditiva `20260905000400_booking_idempotency`: duas colunas nullable, índice único tenant/chave e constraint de consistência. Aplicar antes da nova API; registros antigos permanecem válidos com ambos os campos null. Rollback do código pode manter essas colunas. Não remover dados de idempotência nem desfazer a migration automaticamente.

Provisionar as permissões `appointments.manage_all` e `schedules.manage` e seus vínculos conforme [BOOKING_API.md](BOOKING_API.md). Em desenvolvimento, o seed atualizado adiciona os vínculos sem substituir dados já configurados. Nunca executar o seed demonstrativo em produção. Em um ambiente operado, essa concessão exige procedimento administrativo auditado, preservando roles personalizados.

Fastify fornece identificação da requisição e redação de cookies/autorização nos logs de produção; os logs do worker não incluem payloads ou tokens. Enriquecimento de logs por operação/tenant e exportação de métricas são próximos passos. Métricas previstas: erros/latência HTTP, conexões, falhas/retries de jobs e duração de operações. `/health` verifica o processo e `/ready` consulta PostgreSQL; esse endpoint não comprova disponibilidade de Redis, SMTP ou storage.

Antes do primeiro cliente, testar restauração, HTTPS, trusted proxies, SMTP real, limits, persistência de volumes e falhas de dependências. Cloudflare, R2 e Mercado Pago só entram por adapters com secrets do ambiente e validação própria.
