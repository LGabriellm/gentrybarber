# ADR 0003 — Features por dados e override explícito

Status: aceito para a Foundation.

## Contexto

Nomes e preços dos planos mudam. Clientes podem negociar recursos específicos sem justificar uma branch de código ou um novo plano com lógica duplicada.

## Decisão

Definir chaves estáveis em `Feature`, vínculos em `PlanFeature` e exceções em `TenantFeatureOverride`. A avaliação no backend verifica elegibilidade do tenant, depois override explícito válido, depois vínculo do plano; ausência de regra concede nada. Uma negação explícita não é substituída por permissão do plano.

Roles/permissões autorizam pessoas; features autorizam módulos da empresa. Uma ação pode exigir ambos. Mensalidade, implantação e custom design fee são dados editáveis, sem valores comerciais hardcoded.

## Consequências

A UI pode refletir as capacidades recebidas do backend, mas esconder um botão não substitui o guard. Cache de entitlement precisa de invalidação ao mudar plano/override. O ciclo comercial de inadimplência e carência será formalizado com billing; não inferir pagamento por redirect ou nome do plano.
