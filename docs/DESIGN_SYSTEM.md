# Design system e tokens

O design system oferece primitivas e componentes de apresentação reutilizáveis. Ele permite identidades diferentes sem transferir regras comerciais para os temas. Componentes Core expõem ações e estados consistentes; a apresentação pode variar por composição e variantes.

## Tokens por tenant

`TenantDesignConfig` representa configurações validadas de cores, tipografia, espaçamento, radius, sombras e animação. O contrato inicial precisa aceitar apenas valores previstos, com limites e valores padrão seguros. Nem toda chave conceitual precisa estar habilitada no primeiro renderer.

| Grupo | Opções previstas | Limite |
| --- | --- | --- |
| Cores | primary, secondary, accent, background, surface, text | Formato validado e contraste na combinação aplicada. |
| Tipografia | heading, body | Catálogo permitido; fontes externas precisam de política de carregamento. |
| Forma | borderRadius, buttonStyle, cardStyle | Variantes registradas, sem código livre. |
| Ritmo | spacingScale, layout e densidade | Faixas limitadas que preservam legibilidade e mobile. |
| Movimento | NONE, SUBTLE, MODERATE, RICH | Respeitar `prefers-reduced-motion`; não bloquear ação ou leitura. |

## Componentes

O dashboard da barbearia organiza links de operação em “Seu dia a dia” (agenda, clientes, horários/pausas e confirmações) e “Configure sua barbearia” (serviços/preços, profissionais, dados da unidade). Cada ação tem uma descrição curta. Informações de acesso e recursos ficam em uma área expansível, sem ocupar os destaques da rotina. Uma única membership não mostra troca de barbearia; um único local ou profissional elegível aparece como contexto no lugar de um seletor redundante. Os estilos do dashboard e os tokens do site público permanecem separados.

Evoluir `Button`, `Container`, `Heading`, `Section`, `ServiceCard`, `ProfessionalCard`, `ReviewCard`, `Gallery`, `Location`, `BookingWidget`, `BookingCTA`, `Navigation` e `Footer` conforme os fluxos surgirem. Variantes como minimal, luxury ou editorial expressam apresentação; não alteram preço, permissão ou disponibilidade.

O template mínimo da Foundation exercita identidade, navegação e dados públicos. Cards avançados, galeria operacional, mapa integrado e booking completo são evoluções futuras, não componentes prontos apenas por constarem nesta lista.

## Critérios visuais

Design responsivo deve funcionar com textos longos, imagens ausentes e telas pequenas. Usar hierarquia semântica, foco visível, navegação por teclado, labels e mensagens de erro compreensíveis. A identidade customizada não justifica esconder informação necessária ou tornar o fluxo dependente de animação.

Compartilhar tokens por objeto imutável/instância; evitar mutação de defaults que contaminaria outro tenant. CSS de um tema permanece no seu escopo. Verificar que duas renderizações simultâneas mantêm tokens e conteúdo separados.

No lançamento, medir LCP, CLS, INP, peso de JavaScript e imagens em páginas representativas. Usar dimensões reservadas, imagens otimizadas e carregamento posterior de conteúdo secundário. O objetivo de performance não será declarado cumprido sem medição de uma página real.

## Administração global

O admin utiliza composição própria em `apps/admin/components`: navegação verde escura, superfície clara, indicadores, tabelas e formulários reutilizados nas quatro áreas. O CSS fica sob classes `admin-*`, sem alterar os tokens dos sites dos tenants. Em telas pequenas, a navegação passa para o topo e as tabelas apresentam registros em cartões. Situações combinam texto e cor; formulários têm labels, estados de envio e erros acessíveis. As capturas desktop/mobile e a ausência de rolagem horizontal foram verificadas na suíte `e2e-admin`.

## Painel com foco em celular — 15/09/2026

O início apresenta cartões compactos e busca instantânea de atalhos, tolerante a acentos. A navegação inferior em telas de até 700 px oferece Início, Agenda, Clientes e Ajustes, preservando o tenant selecionado. Os links de agenda/clientes dependem de permissões e entitlements fornecidos pelo servidor; a API continua validando cada operação.

A agenda oferece dia anterior/próximo e retorno a Hoje no timezone da unidade. Busca por cliente, telefone ou profissional e filtro por situação operam sobre a data/unidade carregadas, com contador e estado vazio recuperável. Resumos continuam representando o dia inteiro. Controles ficam bloqueados durante alterações ou carregamento, mantendo as proteções existentes contra dados desatualizados.

No celular, formulários usam texto de 16 px, alvos de toque de pelo menos 44 px e navegação inferior com espaço reservado para a área segura. Menus secundários têm rolagem horizontal própria. Temas públicos e administração global não recebem esses estilos.

Possíveis próximos incrementos: resumo do próximo atendimento na abertura; lista de espera para preencher cancelamentos; reagendamento recorrente. São propostas, dependentes de contratos, autorização e testes próprios, ainda não implementadas neste incremento.

O formulário de clientes aceita telefone brasileiro com DDD, inclusive com pontuação, e converte para o contrato internacional da API. Números iniciados por + são preservados e validados; o campo abre teclado de telefone no celular.

## Navegação da gestão

Agenda, Clientes, Horários, WhatsApp, Serviços, Profissionais, Dados da barbearia e Financeiro usam TenantNavigation com ordem, permissões e entitlements consistentes. Dados da barbearia preserva o shell e estilos do catálogo. HTML, CSS e publicação são exclusivos da administração global da agência; a URL antiga do site no dashboard retorna ao painel do tenant. Atualizar cidade e estado preserva os demais campos do endereço.
