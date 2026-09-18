# Contexto visual do produto

A fonte mantida do sistema é [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md); os tokens e primitivas pertencem a `packages/design-system` e `packages/ui`. Esta entrada registra decisões da interface sem duplicar valores de tokens.

O painel serve à equipe da barbearia em português brasileiro, com uso prioritário no celular. Preservar shell, painéis, tipografia e botões existentes. A página WhatsApp usa `catalog.css`, e o fluxo assíncrono usa `booking-client.ts`, como o reenvio de confirmação. Mensagens de erro ficam junto à ação, com `role=alert`; estados usam `role=status`. Não criar um novo sistema de toast para esta operação.

A página WhatsApp apresenta o histórico e a ação de nova tentativa para falhas elegíveis. A conta oficial de envio é configurada no servidor; não há pareamento no painel. Não exibir tokens ou detalhes de infraestrutura no fluxo do usuário.
