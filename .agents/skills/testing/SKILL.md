---
name: testing
description: Planejar e executar validação de comportamentos críticos, integração de banco e gates de entrega da Foundation.
---

# Testes

Usar [FOUNDATION_VALIDATION.md](../../../docs/FOUNDATION_VALIDATION.md) para registrar evidência. Cobrir isolamento A/B, sessão/membership, permissão/feature, hostname, seleção de tema e versões no nível implementado.

Mocks não comprovam FK composta, trigger ou exclusão de horário. Testar essas proteções no PostgreSQL real e concorrência quando relevante. Testar falhas e limites que alteram comportamento, sem espelhar apenas a implementação.

Executar lint, typecheck, tests e build apropriados. Relatar comandos, resultados e etapas indisponíveis separadamente; teste ignorado não passou. Só repetir ou ampliar verificações após mudança, falha ou dúvida concreta. Não atribuir operação produtiva a demonstrações de UI.
