# ADR 0004 — Registry de código e configuração de apresentação

Status: aceito para a Foundation.

## Contexto

Sites Premium precisam de liberdade visual real, sem duplicar agenda, APIs ou infraestrutura. Um editor de HTML/JavaScript livre ampliaria a superfície de ataque e a manutenção.

## Decisão

Registrar renderers como código revisado no monorepo. Persistir IDs, tokens, metadados e versões; resolver renderer pela configuração publicada do tenant. Temas bespoke mantêm vínculo com o tenant autorizado. O renderer recebe somente um contrato público de dados e usa componentes/APIs do Core.

Builder será composição de componentes permitidos. Bespoke será desenvolvido pela equipe. Ambos usam preview, versão identificável e publicação reversível; o workflow produtivo completo é Fase 4.

## Consequências

Designs podem ser exclusivos enquanto o Core permanece compartilhado. Alterações de código de tema exigem CI e deploy; trocar configuração compatível pode seguir uma publicação própria. Rollback de apresentação não reverte schema de negócio. CSS customizado só será habilitado com validação e escopo; JavaScript arbitrário do tenant continua proibido.
