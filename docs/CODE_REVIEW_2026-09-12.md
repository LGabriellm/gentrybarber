# Code Review - 12 de Setembro de 2026

**Status:** Concluído
**Contexto:** Revisão completa da base de código após implementação do Módulo Financeiro, Painel Administrativo, melhorias no Widget de Agendamento, e novos componentes do Design System.

## Resumo Executivo
A plataforma evoluiu significativamente desde a última revisão. Os problemas críticos anteriores (como vazamento de permissões na API de clientes, falhas de paginação e ausência de bloqueio no Worker em dev/test) foram **resolvidos**. As garantias de isolamento multi-tenant (`tenantId` compulsório no Prisma) continuam robustas em todos os módulos examinados.

No entanto, a introdução dos novos recursos trouxe algumas áreas que exigem atenção, particularmente no módulo de relatórios financeiros e formatação de datas.

## Achados e Vulnerabilidades

### 1. P2 — Finance Controller requer feature errada
**Local:** `apps/api/src/finance-controller.ts` (Linha 27)
**Problema:** O endpoint de resumo financeiro exige a feature `booking` em vez da feature `finance`:
```typescript
const context = await this.services.authorize(request, slug, 'reports.read', 'booking');
```
**Impacto:** Qualquer plano que tenha a feature `booking` (Atualmente todos os planos) ganhará acesso ao painel financeiro caso tenham a permissão de leitura de relatórios. Embora os planos no `seed.ts` ainda não habilitem explicitamente a feature `finance`, essa validação permitirá vazamento da funcionalidade para barbearias no plano inicial quando o recurso for devidamente segregado.
**Correção Recomendada:** Alterar a autorização para validar a feature `'finance'`.

### 2. P3 — Risco de Performance no Fuso Horário (Financeiro)
**Local:** `apps/api/src/finance.ts` (Linhas 48-52)
**Problema:** O método `getSummary` utiliza a classe `Intl.DateTimeFormat` para formatar a data de **cada** apontamento (`appointment`) dentro de um loop:
```typescript
for (const appt of appointments) {
  const apptDateStr = formatter.format(appt.startsAt);
  const [aMonth, aDay, aYear] = apptDateStr.split('/');
  // ...
}
```
**Impacto:** A API `Intl.DateTimeFormat.prototype.format()` é computacionalmente custosa. Executá-la dentro de um loop iterando sobre centenas ou milhares de atendimentos no mês vai causar um gargalo, resultando em latência alta sob carga pesada.
**Correção Recomendada:** Converter `appt.startsAt` para o fuso horário usando matemática de offsets (ticks) em vez de formatação de string iterativa, ou usar a lógica de limites temporais já usada na busca binária inicial.

### 3. P3 — Tratamento de Usuário Administrador (Onboarding)
**Local:** `apps/api/src/admin.ts` (Linha 66)
**Problema:** Ao criar um usuário no painel de administração (`createUser`), o campo `emailVerified` é definido diretamente como `false` sem disparar nenhum fluxo explícito de convite/verificação por e-mail no ato da criação (ao contrário da criação de tenant onde o dono precisa ter e-mail verificado).
**Impacto:** Usuários criados manualmente pelo Super Admin não conseguirão logar diretamente sem antes acionarem o fluxo de redefinição de senha ou reenvio de verificação.
**Correção Recomendada:** Disparar um e-mail de "Boas Vindas / Definição de Senha" automaticamente usando a infraestrutura do `Worker` quando um administrador cria um usuário.

---

## Verificações Positivas (Resolvidas desde a última revisão)

1. **Bug do Worker:** O `providers.ts` agora rejeita envio real se o ambiente for desenvolvimento ou teste.
2. **Privacidade de Cliente no Booking Widget:** Em `createPublicAppointment`, o uso do telefone previne duplicatas, e dados fornecidos publicamente **não** sobrescrevem dados de clientes existentes (que são apenas vinculados ao novo agendamento, protegendo o nome/email real).
3. **Paginação de Clientes Resolvida:** `customer-manager.tsx` agora utiliza paginação corretamente via `/api/operations/{slug}/customers`, suportando carteiras de clientes ilimitadas e garantindo carregamento performático.

## Próximos Passos
A aplicação está num estado maduro para o MVP comercial. Sugiro corrigir o vazamento de feature no `finance-controller.ts` antes de lançar planos comerciais diferenciados, e revisar a formatação de datas no módulo financeiro caso a volumetria de agendamentos por barbearia passe de 1.000/mês.
