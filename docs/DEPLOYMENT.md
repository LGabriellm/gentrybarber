# Ambiente e operação

## Ambiente local

O monorepo usa Node.js 24, pnpm 11.19.0, Turborepo e Prisma 7.10.0. A configuração raiz e o lockfile registram a versão aplicável. Copiar `.env.example` para o arquivo local previsto no README e preencher valores de desenvolvimento. Não reutilizar credenciais locais em produção e não versionar `.env` real.

O `package.json` fixa Node.js 24.20.0 para Volta e para o [runtime de desenvolvimento do pnpm](https://pnpm.io/package_json#devenginesruntime). O lockfile registra o runtime e sua integridade; `pnpm install --frozen-lockfile` o prepara para os scripts, sem alterar o Node global. Ao atualizar essa versão, manter os dois campos alinhados e atualizar o lockfile. Os frontends usam um preload para ler o `.env` da raiz sem transmitir flags de env-file ao subprocesso do Next.js. Os testes Playwright executam `pnpm dev` dos frontends para cobrir a mesma inicialização utilizada localmente.

Docker Compose fornece PostgreSQL, Redis, MinIO e Mailpit. PostgreSQL guarda o estado; Redis suporta BullMQ; MinIO representa storage S3 compatible; Mailpit captura mensagens SMTP sem envio a destinatários reais. A instalação local precisa gerar Prisma Client, aplicar migrations e carregar dados fictícios antes de abrir os fluxos dependentes do banco.

Comandos executáveis e portas estão no README e scripts raiz. Executar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build` e `pnpm test:e2e` para as verificações do workspace. Testes de integração requerem PostgreSQL real e `DATABASE_TEST_URL` apontando para banco exclusivo de testes, com migrations aplicadas; se a dependência estiver indisponível, registrar bloqueio em vez de relatar sucesso. Não usar `prisma db push` como substituto da migration versionada de entrega.

## Stack local completa em containers

`docker compose up -d --build` constrói API, worker e os três frontends usando o Dockerfile compartilhado, além de iniciar PostgreSQL, Redis, MinIO e Mailpit. Preparar `.env` a partir de `.env.example`, com segredo de autenticação aleatório de pelo menos 32 caracteres. As imagens Node seguem a versão 24.20.0 declarada no workspace.

O job `migrate` executa `prisma migrate deploy` uma vez por inicialização da stack e deve terminar com código zero antes da API e do worker. PostgreSQL e Redis possuem checks próprios; `/ready` da API verifica ambos e libera o início dos frontends. O worker não expõe HTTP nem possui prova de consumo de fila por health check. Mailpit é aguardado apenas como processo iniciado. MinIO mantém o volume de storage; bucket e integração S3 não são provisionados por esta configuração.

As variáveis de conexão do backend apontam para `postgres`, `redis`, `mailpit` e `minio` dentro da rede Compose, substituindo os endereços de host do `.env`. `DOCKER_DATABASE_URL` permite uma URL explícita com senha codificada para URI; `POSTGRES_PASSWORD` continua sendo a senha original do PostgreSQL. Alterar essa variável não troca a senha de um volume já inicializado. Credenciais de integrações externas continuam opcionais no `.env` dos backends. Frontends recebem apenas URL interna da API, nome e domínio da plataforma.

O Compose fixa `NODE_ENV=development` nos backends para HTTP local; os frontends standalone usam produção e não habilitam previews fictícios. SMTP aponta para Mailpit sem autenticação. Não usar essa stack como deploy de produção. `compose.frontends.yaml` continua sendo um exemplo de release independente, usado com `-f`, não um override da stack local.

Após subir, carregar dados locais com `docker compose run --rm migrate pnpm db:seed`. Inspecionar `docker compose ps -a` (migrate deve aparecer como `Exited (0)`) e `docker compose logs api worker`. `docker compose down` preserva os volumes. Para desenvolvimento com processos no host, subir somente `docker compose up -d postgres redis minio mailpit`.

Validação desta configuração em 15/09/2026: sintaxe YAML e aliases validados, dez serviços identificados e dependências de inicialização conferidas; `git diff --check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (255 testes) e `pnpm build` passaram. As primeiras tentativas encontraram restrições de acesso às dependências locais; a execução com acesso autorizado passou. Docker não está instalado neste ambiente: `docker compose config`, construção das imagens e execução da stack não foram verificadas. Testes de integração e de navegador não foram executados nesta alteração de infraestrutura.

## CI e gate de publicação

Instalar a partir do lockfile → preparar dependências → validar schema e gerar client → aplicar migration em banco descartável → lint → typecheck → unit/integration → build. Jobs devem falhar quando uma etapa exigida falha. Cache inclui lockfile e configuração relevante; secrets não entram nos artefatos.

A [CI](../.github/workflows/ci.yml) usa Node.js 24, pnpm 11.19.0, PostgreSQL 17 em banco `platform_test` e Redis. Aplica migration antes da integração, usa Vitest 5 para testes e instala Chromium e WebKit para as verificações Playwright. Credenciais fixas do workflow são exclusivamente para os serviços efêmeros da CI.

A CI da Foundation valida pull requests e commits enviados para `main`. O job `package-release` só roda após `verify` passar em um evento `push` para `main`: constrói as imagens de API, worker, site público, dashboard e admin e publica o artefato `production-release-<sha>-<run_id>-<attempt>`. O pacote contém `REVISION`, `RELEASE_ID`, `IMAGE_IDS`, `images.tar.gz`, `config.tar.gz` e `SHA256SUMS`. Um pull request ou uma execução manual da CI não produz release. A existência desses workflows não comprova uma execução remota nem substitui a configuração de infraestrutura, domínio e secrets.

## Imagem de referência para API e worker

O [Dockerfile](../Dockerfile) tem etapas de build/runtime, executa como usuário sem privilégios e aceita somente `APP=api` ou `APP=worker`:

```sh
docker build --build-arg APP=api -t platform-api:foundation .
docker build --build-arg APP=worker -t platform-worker:foundation .
```

Prisma Client é gerado no build. `tsup` inclui os pacotes internos no `dist/main.js` de cada backend; dependências externas continuam resolvidas no workspace instalado. A imagem preserva o workspace para manter os links do pnpm, incluindo dependências de desenvolvimento. Reduzir o tamanho por pruning validado é uma otimização posterior, sem fingir que esta imagem já é mínima.

Injetar secrets apenas ao executar o container. Usar endpoints de rede dos serviços, pois `localhost` dentro do container é o próprio container. API usa `BIND_HOST=0.0.0.0`; worker não oferece servidor HTTP. A porta 4000 da imagem se aplica à API. Migrations são uma etapa controlada de release, não executadas automaticamente por cada réplica ao iniciar.

O target `frontend` empacota os três frontends Next.js 16 em standalone, incluindo assets estáticos e `public`, com usuário sem privilégios e health check em `/api/health`:

```sh
docker build --target frontend --build-arg APP=web-public -t platform/web-public:REVISION .
docker build --target frontend --build-arg APP=dashboard -t platform/dashboard:REVISION .
docker build --target frontend --build-arg APP=admin -t platform/admin:REVISION .
```

O build ativa `NEXT_STANDALONE=1` e rastreia dependências a partir da raiz do monorepo. O runtime usa porta 3000 em todos os containers. Injetar `API_URL` com endereço interno alcançável da API; para o site público, também `PLATFORM_DOMAIN`. Nenhum segredo de banco, Redis ou WhatsApp pertence aos frontends. `compose.frontends.yaml` fornece um exemplo com portas locais 3000/3001/3002, `RELEASE_TAG`, `IMAGE_REGISTRY` e `API_INTERNAL_URL`; exige um ingress HTTPS separado. Executar `docker compose -f compose.frontends.yaml config` e `build` antes da publicação. `/api/health` verifica o processo Next, não a API.

A workflow `frontend-images.yml` constrói cada imagem e verifica HTTP, assets e usuário em Linux. Sua criação não comprova execução remota. Neste ambiente Windows, os builds standalone e `pnpm test:frontends` passaram para os três frontends, verificando inicialização HTTP e assets; containers não foram executados porque Docker não está instalado. Para repetir: `NEXT_STANDALONE=1 pnpm build` e `pnpm test:frontends` (no PowerShell, definir `$env:NEXT_STANDALONE='1'` antes do build). Validar as imagens em CI antes do primeiro release, além de login, cookies, CSP, hostname de tenant e domínio customizado no endereço final. Reverter usando a tag imutável anterior; não reverter migrations automaticamente.

## Release de produção

O ingresso da VPS segue [ADR 0009](adr/0009-production-ingress-and-service-hostnames.md). Caddy é o único processo exposto em 80/443. API, site público, dashboard e admin publicam portas apenas em `127.0.0.1`; acessos por IP nas portas 3000–4000 devem falhar externamente.

Configuração pública padrão:

| URL | Destino interno |
| --- | --- |
| `https://api.<PLATFORM_DOMAIN>` | API em `API_HOST_PORT` |
| `https://dashboard.<PLATFORM_DOMAIN>` | Dashboard em `DASHBOARD_HOST_PORT` |
| `https://admin.<PLATFORM_DOMAIN>` | Admin em `ADMIN_HOST_PORT` |
| `https://app.<PLATFORM_DOMAIN>` | Redireciona para dashboard |
| `https://<slug>.<PLATFORM_DOMAIN>` | Site público em `WEB_PUBLIC_HOST_PORT`, após autorização TLS |

Os quatro host ports são configuráveis no `.env.production`, precisam ser únicos e nunca devem ser liberados no firewall. As portas internas dos containers permanecem 3000 para frontends e 4000 para API. O deploy descobre o gateway Docker depois da migration e grava somente seu `/32` em `TRUST_PROXY_CIDRS`; valores amplos conhecidos são recusados.

Os hostnames exatos obtêm HTTPS automático pelo Caddy e exigem registros DNS válidos antes do deploy. Para tenants, a primeira conexão TLS aciona uma consulta a `/internal/tls/authorize?domain=...`; a API autoriza somente subdomínios da plataforma realmente publicados e Caddy emite um certificado individual. HTTP redireciona para HTTPS. DNS-01 wildcard continua uma otimização futura, não um requisito para o MVP. Não habilitar HSTS com `includeSubDomains`; custom domains permanecem no fluxo verificado da Fase 4.

`BETTER_AUTH_URL` deve ser exatamente `https://api.<PLATFORM_DOMAIN>` e `TRUSTED_ORIGINS` deve conter somente dashboard e admin HTTPS. Não existe bypass produtivo para origens HTTP.

No GitHub, configurar a variável `PLATFORM_DOMAIN` e os secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` e `VPS_SSH_PASSPHRASE`. A chave pública correspondente precisa estar em `authorized_keys` do operador da VPS antes de remover o secret legado de senha. O fingerprint SHA256 público da chave de host ECDSA fica fixado e revisável no workflow; ao recriar a VPS ou rotacionar as chaves SSH, confirmá-lo diretamente no servidor e atualizar o arquivo. O workflow força IPv4, valida API, dashboard e admin por HTTPS e falha se a porta 4000 continuar acessível externamente.

### Revisão aprovada e artefato

O deploy automático parte somente da execução concluída com sucesso da `Foundation CI` para um `push` em `main` deste repositório. O SHA publicado é o `head_sha` dessa execução, mesmo que `main` avance durante o deploy. O workflow identifica o artefato pelo ID da execução, SHA e tentativa; não escolhe o estado corrente da branch. Para repetir ou restaurar uma release pela interface do GitHub, iniciar `Deploy to VPS` manualmente com `ci_run_id` de uma execução de CI que tenha passado nesse mesmo repositório e no mesmo tipo de evento. O disparo manual consulta a execução antes de obter o pacote e não dispensa a CI.

O runner confere `SHA256SUMS` e a revisão declarada no pacote antes de transferi-lo. A VPS repete a verificação de hash, confere o SHA e os IDs das cinco imagens após `docker load`, e só então executa migrations e sobe a stack. `compose.production.yaml` usa as imagens do `RELEASE_ID` com `pull_policy: never`: publicação não faz `git fetch`, `git reset`, `docker compose build` nem escolhe tags mutáveis. O pacote é a unidade de release; seu prazo no GitHub Actions é de 30 dias. Para auditoria ou rollback depois desse prazo, conservar uma cópia com controle de acesso e integridade verificada. A pasta de configuração na VPS não é uma fonte de código a publicar. Uma invocação direta de `deploy.sh` só é válida com o pacote e os identificadores verificados que o workflow fornece.

Esse fluxo fixa o código e a configuração da release, mas ainda requer conferência operacional de secrets, DNS, backups, compatibilidade da migration e saúde real dos serviços. Não foi executado deploy remoto nesta alteração.

Validação local em 23/09/2026: YAML, sintaxe dos scripts, `docker compose config`, lint, typecheck, 267 testes unitários, 142 testes de integração e build passaram. As cinco imagens Docker de aplicação foram construídas e inspecionadas localmente; as tags temporárias foram removidas após o teste. O empacotamento e os workflows ainda precisam passar na CI remota antes de qualquer publicação.

### Preparação inicial da VPS

Provisionar a VPS antes do primeiro deploy por um operador com acesso administrativo: executar `setup-vps.sh` como `root`, conferir Docker Compose, Caddy, usuário `deploy`, chave SSH, `/opt/barber-platform/.env.production` e `/var/log/barber-deploy.log`. O workflow de deploy não executa o setup, não cria `.env.production` e falha quando os pré-requisitos estão ausentes. Manter secrets fora do pacote e do repositório.

Preencher `PLATFORM_DOMAIN`, `SMTP_HOST`, `SMTP_FROM` e as demais variáveis exigidas no arquivo de produção. O deploy valida os valores antes de migrar o banco e não substitui domínio ou SMTP ausente por valores fictícios.

Se uma instalação preexistente em `/opt/barber-platform` tiver sido criada por `root`, corrigir uma única vez pelo console administrativo da VPS com `chown -R deploy:deploy /opt/barber-platform`, seguido de `touch /var/log/barber-deploy.log`, `chown deploy:deploy /var/log/barber-deploy.log` e `chmod 0640 /var/log/barber-deploy.log`. O setup aplica essas propriedades de forma reproduzível; não ampliar o `chown` para `/opt` ou outro diretório.

Criar um tenant não publica automaticamente um site. A administração global exibe o estado de publicação e só oferece o endereço público depois do fluxo rascunho → aprovação → publicação. Um 404 antes da publicação é o isolamento esperado, não fallback para outro tenant.

### Proxy, cookies e IP de autenticação

Em desenvolvimento os frontends encaminham `/api/auth/*` para a API por um proxy de mesma origem. Cookies ficam no host do painel/admin, sem compartilhamento com subdomínios de barbearias. Esse encaminhamento local agrupa conexões no IP do servidor Next.js.

Em produção, rotear `/api/auth/*` diretamente do ingress de cada painel para a API, mantendo a mesma origem do navegador. O ingress deve sobrescrever `X-Forwarded-For` com o IP observado na conexão e remover headers de identidade enviados pelo cliente. Configurar `TRUST_PROXY_CIDRS` na API com **somente** os IPs/CIDRs desse ingress; o padrão é não confiar em proxies. Nunca usar todas as redes ou encaminhar a cadeia recebida sem validação.

A API calcula `request.ip`, remove qualquer `x-platform-client-ip` de entrada e define esse header internamente para Better Auth. O limiter de autenticação persiste contadores no PostgreSQL. O limite HTTP usa operações atômicas Redis com expiração, compartilhadas entre réplicas: todas devem usar o mesmo `REDIS_URL`, banco e `RATE_LIMIT_NAMESPACE`. Separar namespaces entre ambientes. `RATE_LIMIT_MAX=120` e `RATE_LIMIT_WINDOW_MS=60000` são os padrões por IP; POSTs de verificação de telefone e conexão WhatsApp têm limite de seis por minuto. Não há fallback em memória: Redis indisponível bloqueia operações e readiness; liveness permanece disponível. API não inicia sem Redis. Usar Redis com persistência/alta disponibilidade e sem evicção desses contadores.

Os proxies Next não encaminham IPs arbitrários. Sem roteamento direto pelo ingress, chamadas intermediadas compartilham o IP do frontend e, portanto, o bucket. Ao publicar, rotear também as operações de navegador para a API com reescrita correspondente (`/api/operations/:slug/*` → `/v1/tenants/:slug/*`), sobrescrevendo X-Forwarded-For. Não desabilitar o limite para compensar agregação; calibrar capacidade para chamadas de renderização e aplicar proteção no ingress também para páginas, assets e conexões lentas. Verificar IP real, origens, callback URLs e cookies nos hosts finais antes do uso comercial.

Os frontends geram CSP com nonce por requisição. Scripts externos e execução arbitrária não são permitidos; estilos inline continuam necessários aos tokens e componentes controlados. Previews fictícios locais nunca são liberados no modo de produção.

1. Selecionar a execução de CI aprovada e registrar SHA, ID da execução, tentativa, `RELEASE_ID` e hashes do pacote.
2. Conferir backup/restauração e compatibilidade entre versão anterior e nova.
3. Aplicar migrations compatíveis de expansão antes do código dependente; executar alterações destrutivas em etapa posterior planejada.
4. Publicar API, worker e frontends com health checks e configuração validada.
5. Validar autenticação, tenant A/B, hostnames e tarefas assíncronas.
6. Acompanhar erros, fila e latência; interromper avanço e usar rollback previsto se gates falharem.

Rollback de aplicação não reverte automaticamente banco. Preferir migrations forward e compatibilidade temporária; uma migration destrutiva exige plano específico. Rollback de tema muda a versão publicada e tem ciclo separado do deploy do Core.

### Backup e ensaio de restauração

Agendar o script da release ativa no cron do usuário `deploy`, por exemplo `0 3 * * * bash /opt/barber-platform/current/infra/vps/backup.sh` (03:00 no fuso da VPS). Ele carrega `/opt/barber-platform/.env.production` explicitamente e usa o `RELEASE_ID` de `current` para resolver o Compose, sem depender do diretório inicial do cron. Antes de consultar o banco, valida a configuração; grava o dump PostgreSQL em arquivo temporário privado, verifica que o arquivo não está vazio e que `pg_restore --list` o lê, e só então o move para o nome definitivo. Os dumps locais em `/opt/barber-platform/backups` são mantidos por 14 dias. Falha na criação ou validação não deve deixar um arquivo definitivo parcial nem rotacionar cópias anteriores.

Ensaiar a recuperação periodicamente com um dump e PostgreSQL 17 em ambiente descartável, separado da VPS de produção: executar `pg_restore --list`, restaurar o arquivo em um banco vazio com `pg_restore --exit-on-error --no-owner --no-acl`, conferir tabelas, migrations e registros de referência, e descartar o banco e o volume de teste ao terminar. A listagem do arquivo isoladamente não comprova que ele pode ser restaurado. Não usar `compose.production.yaml` nesse ensaio, pois seu nome de projeto é o da stack produtiva. Registrar data, revisão, arquivo, resultado e tempo de restauração. Os backups atuais ficam somente na VPS; uma cópia externa protegida e testes de restauração com essa cópia ainda são necessários para recuperação após perda do servidor.

Em 23/09/2026, `scripts/restore-drill.sh` fez um ensaio real no PostgreSQL 17 de desenvolvimento local: gerou um dump customizado, restaurou em banco temporário, conferiu 44 tabelas e 8 migrations e removeu o banco de teste. A CI executará o mesmo ensaio com o PostgreSQL descartável após os testes de integração, antes de empacotar uma release. Este resultado não valida um dump da VPS nem a execução do cron; repetir com uma cópia do backup produtivo antes de depender dele para recuperação.

## Observabilidade e limites

O incremento de 09/09 adiciona migrations 5/6 para `version` e 7 para consentimento/outbox WhatsApp. Coordenar atualização da API e dos frontends para o contrato `expectedVersion`, sem clientes antigos que enviem timestamps. Para WhatsApp, parar o worker antigo de console, aplicar as migrations e subir o novo consumidor. Preservar a fila legada sem conversão automática de dados sem tenant/consentimento. Configuração, retries e compatibilidade em [WHATSAPP.md](WHATSAPP.md). Onboarding usa o plano configurado em `SystemSetting[onboarding.defaults]`; configurar administrativamente em produção, sem executar seed demonstrativo.

A agenda requer a migration aditiva `20260905000400_booking_idempotency`: duas colunas nullable, índice único tenant/chave e constraint de consistência. Aplicar antes da nova API; registros antigos permanecem válidos com ambos os campos null. Rollback do código pode manter essas colunas. Não remover dados de idempotência nem desfazer a migration automaticamente.

Provisionar as permissões `appointments.manage_all` e `schedules.manage` e seus vínculos conforme [BOOKING_API.md](BOOKING_API.md). Em desenvolvimento, o seed atualizado adiciona os vínculos sem substituir dados já configurados. Nunca executar o seed demonstrativo em produção. Em um ambiente operado, essa concessão exige procedimento administrativo auditado, preservando roles personalizados.

Fastify fornece identificação da requisição e redação de cookies/autorização nos logs de produção; os logs do worker não incluem payloads ou tokens. Enriquecimento de logs por operação/tenant e exportação de métricas são próximos passos. Métricas previstas: erros/latência HTTP, conexões, falhas/retries de jobs e duração de operações. `/health` verifica o processo; `/ready` consulta PostgreSQL e Redis, sem comprovar SMTP, Meta ou storage.

Antes do primeiro cliente, testar restauração, HTTPS, trusted proxies, SMTP real, limits, persistência de volumes e falhas de dependências. Cloudflare, R2 e Mercado Pago só entram por adapters com secrets do ambiente e validação própria.
