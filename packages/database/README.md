# Database

PostgreSQL é compartilhado. Entidades de negócio possuem `tenant_id`; relações
entre unidades, profissionais, serviços, clientes, agendamentos e versões de tema
usam chaves compostas para impedir referências cruzadas. Identidade, catálogo de
planos, permissões e registro de renderers são globais. Eventos de cobrança ainda
sem tenant resolvido e auditoria da plataforma admitem `tenant_id` nulo, acessível
apenas pelos serviços internos autorizados.

`createDatabase(DATABASE_URL)` cria o Prisma Client com o adapter PostgreSQL.
Somente serviços Core autorizados devem importar este pacote. A existência de
`tenant_id` e de FKs compostas **não filtra consultas**: cada repositório precisa
usar o contexto validado, inclusive em leituras, escritas, jobs e auditoria.

Com as dependências instaladas, a partir da raiz:

```sh
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`DATABASE_URL` deve estar no ambiente do processo. O CLI não carrega `.env`
implicitamente. A geração do client não exige PostgreSQL; aplicação das migrations
e seed exigem. O seed é bloqueado quando `NODE_ENV=production`, adiciona exemplos
de configuração comercial e dois tenants, preserva registros existentes e nunca
cria usuários, senhas ou tokens. Valores comerciais de seed são ilustrativos e
devem ser revisados antes da operação.

A primeira migration cria o schema. A segunda adiciona restrições que o Prisma
não representa: `btree_gist` e exclusão de horários sobrepostos por profissional,
intervalos positivos, preços não negativos, slug reservado, um domínio primário
ativo por tenant e vínculo exclusivo de tema bespoke. O papel de migration precisa
poder instalar `btree_gist`; a aplicação deve usar papel de execução sem permissão
de alterar schema. Ownership de tema é imutável: crie outro registro para atribuir
um renderer a outro tenant.

A terceira migration alinha `Account` ao Better Auth 1.7: identidade é única por
`issuer` + `account_id`, e `provider_id` identifica a configuração do provider.
Contas locais recebem o issuer confiável `local:credential`; contas externas
legadas exigem um mapeamento explícito antes da migration. Novas contas sempre
devem informar o issuer validado: não há um default que possa classificar uma
identidade externa como credencial local.

Os testes de integração usam `DATABASE_TEST_URL` apontando para um banco dedicado
com todas as migrations aplicadas. Criam fixtures com IDs únicos e as removem no
fim; falham explicitamente se a URL não existir. Testam FKs compostas, publicação
de versão de outro tenant, tema bespoke, preço/horário inválidos, unicidade de
webhooks e conflito concorrente de agendamento. Não substituem testes de API nem
a validação do motor de disponibilidade, que pertence à próxima fase.
