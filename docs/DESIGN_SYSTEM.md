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

Evoluir `Button`, `Container`, `Heading`, `Section`, `ServiceCard`, `ProfessionalCard`, `ReviewCard`, `Gallery`, `Location`, `BookingWidget`, `BookingCTA`, `Navigation` e `Footer` conforme os fluxos surgirem. Variantes como minimal, luxury ou editorial expressam apresentação; não alteram preço, permissão ou disponibilidade.

O template mínimo da Foundation exercita identidade, navegação e dados públicos. Cards avançados, galeria operacional, mapa integrado e booking completo são evoluções futuras, não componentes prontos apenas por constarem nesta lista.

## Critérios visuais

Design responsivo deve funcionar com textos longos, imagens ausentes e telas pequenas. Usar hierarquia semântica, foco visível, navegação por teclado, labels e mensagens de erro compreensíveis. A identidade customizada não justifica esconder informação necessária ou tornar o fluxo dependente de animação.

Compartilhar tokens por objeto imutável/instância; evitar mutação de defaults que contaminaria outro tenant. CSS de um tema permanece no seu escopo. Verificar que duas renderizações simultâneas mantêm tokens e conteúdo separados.

No lançamento, medir LCP, CLS, INP, peso de JavaScript e imagens em páginas representativas. Usar dimensões reservadas, imagens otimizadas e carregamento posterior de conteúdo secundário. O objetivo de performance não será declarado cumprido sem medição de uma página real.
