---
name: create-barbershop
description: Cria e implementa um novo tenant (barbearia) no sistema com design e layout HTML/CSS personalizados implementados no frontend.
---

# Create Barbershop

Esta skill descreve o processo ponta-a-ponta para o agente criar e implementar uma nova barbearia no ecossistema SaaS multi-tenant, garantindo que o design (HTML/CSS) seja traduzido em código real, seguro e perfeitamente integrado.

## Escopo e Arquitetura

Conforme as regras do projeto, **não** criamos novas aplicações, backends, bancos de dados ou deploys para um novo tenant. O Core é compartilhado, e a experiência/layout é configurada via **Theme Engine** e código bespoke no frontend.

## Passos para Implementação

### 1. Configuração do Tenant no Core (Banco de Dados)
- Identificar as credenciais, nome comercial, subdomínio/slug e informações da barbearia solicitadas.
- Inserir o novo tenant no banco de dados (ex: via Prisma Client no seed, scripts de administração ou endpoint específico do backend).
- Configurar o tenant para utilizar um tema "bespoke" (customizado) vinculado ao seu ID/slug.

### 2. Implementação do Design (HTML / CSS)
- Traduzir o briefing e o layout desejado em componentes React/Next.js no frontend.
- **Localização:** Criar os arquivos dentro da estrutura de temas suportada pelo projeto (ex: `apps/frontend/src/themes/<nome-da-barbearia>` ou pasta análoga).
- **Estilização:** Utilizar HTML5 semântico e a solução de CSS do projeto (ex: Tailwind CSS). O layout deve ser estritamente voltado para a **apresentação**.
- **Restrições:**
  - O design deve ser **totalmente responsivo** e possuir acessibilidade básica.
  - Não adicione regras de negócios ou chamadas diretas de banco de dados no HTML/CSS do tema.
  - Consuma apenas dados fornecidos pelos contratos do Core.
  - Nenhuma injeção de `<script>` ou HTML arbitrário oriundo do banco (segurança contra XSS).

### 3. Integração com o Theme Engine
- Registrar o novo layout/renderer no **Theme Registry** do projeto.
- Certificar-se de que a resolução de tenant no middleware/backend encaminha a renderização correta das páginas públicas para os componentes recém-criados.

### 4. Validação e Entrega
- Verificar se o isolamento de tenant foi mantido (um cliente não pode ver dados de outro nem carregar o tema de outro indevidamente).
- Executar linting, typecheck e testes de integração.
- Gerar o build final para garantir que o código HTML/CSS implementado não quebra o Core.
- Disponibilizar um link de *preview* isolado para aprovação (via rotas de preview/testes).

## Gatilho de Uso
Sempre que o usuário pedir: "crie uma barbearia com este layout", "implemente o design HTML/CSS da barbearia X", inicie os passos acima consultando as skills auxiliares como `custom-design`, `theme-engine` e `database` para detalhes de implementação específicos de cada camada.
