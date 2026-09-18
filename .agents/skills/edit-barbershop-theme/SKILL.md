---
name: edit-barbershop-theme
description: Modificar o HTML/CSS de uma barbearia específica para criar experiências únicas, de pequenos ajustes a mudanças estruturais e animações.
---

# Edit Barbershop Theme (Modificação de Layout Bespoke)

Esta skill orienta o processo de evolução e personalização profunda do layout de uma barbearia específica. O objetivo é permitir que cada tenant (barbearia) possa ter um visual estritamente único — alterando estrutura, animações, seções e estilos — sem quebrar a lógica compartilhada do Core SaaS.

## 1. Localização e Escopo
- **Identificar a Barbearia:** Determine qual é o slug ou identificador da barbearia que receberá as alterações.
- **Localizar o Código do Tema:** Encontre a pasta isolada de componentes visuais dessa barbearia (ex: `apps/frontend/src/themes/<slug-da-barbearia>`).
- **Restrição de Escopo:** Altere APENAS o HTML, CSS e componentes de UI dessa pasta. NUNCA altere regras de negócio, serviços, controllers de API ou contratos de integração do Core para satisfazer um detalhe de design.

## 2. Tipos de Modificações Permitidas
- **Pequenas Mudanças (Tweaks):** Alterar tokens de cores, ajustes de tipografia, espaçamentos (padding/margin), bordas e tamanhos de elementos.
- **Mudanças Estruturais:** Mudar a ordem das seções, criar novos blocos de conteúdo exclusivos da marca, redefinir grids e layouts de página inteira.
- **Animações e Interações:** Adicionar microinterações, animações de entrada (scroll reveals, fade-ins), transições complexas ou efeitos modernos usando as práticas CSS do projeto ou bibliotecas como Framer Motion (quando configurado no repositório).
- **Conteúdo Exclusivo:** Adicionar áreas visuais ricas que destacam fotos, vídeos e a identidade singular daquela barbearia, mantendo o apelo estético "bespoke".

## 3. Boas Práticas e Regras Críticas
- **Separação Rigorosa:** O estilo de uma barbearia **não pode vazar** para outra. Use CSS escopado (ex: CSS Modules) ou utilitários (Tailwind) isolados no contexto dos componentes daquela barbearia.
- **Dados Dinâmicos:** A estrutura HTML criada deve consumir as propriedades (props) entregues pelo Core. Não faça "hardcode" de serviços, horários, preços ou dados que o cliente edita no painel. Esses dados devem vir das consultas ao backend.
- **Responsividade (Mobile-First):** Toda mudança de estrutura ou animação precisa funcionar perfeitamente em dispositivos móveis, sem quebrar o layout horizontal ou ocultar informações vitais de agendamento.
- **Performance e Acessibilidade:** Animações e imagens grandes não podem destruir o tempo de carregamento. O contraste e a navegação por teclado devem permanecer acessíveis.

## 4. Revisão e Preview
- **Preview Autenticado:** Utilize a infraestrutura do `theme-engine` para rodar o site em modo de preview para aquela barbearia específica.
- **Garantia do Core:** Execute lint, typecheck e os testes do projeto. Assegure-se de que nenhum componente compartilhado foi corrompido.
- **Versionamento:** Commits no repositório funcionam como o versionamento do layout da barbearia, permitindo um "rollback" rápido se a barbearia quiser voltar para a interface antiga.

## Gatilho de Uso
Sempre que o usuário pedir para "mudar a cor da barbearia X", "refazer as animações da seção principal da loja Y", ou "fazer uma grande mudança no layout HTML da barbearia Z", utilize esta skill para realizar e auditar a edição do tema bespoke com segurança.
