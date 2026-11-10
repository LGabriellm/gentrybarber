# WhatsApp — Confirmações e Lembretes (Zernio WhatsApp Cloud API)

## Escopo implementado

O módulo de notificações de WhatsApp opera sobre a **Zernio API** (`https://zernio.com/api/v1/inbox/conversations` e `https://zernio.com/api/v1/whatsapp/templates`) usando uma fila transacional (`Notification` outbox) processada pelo worker em segundo plano.

A conta da Zernio é **única para toda a plataforma**: qualquer barbearia (tenant) cadastrada com o recurso `whatsapp_automation` ativo envia automaticamente suas confirmações e lembretes usando as credenciais globais do sistema (`ZERNIO_API_KEY` + `ZERNIO_ACCOUNT_ID`), enquanto o nome da barbearia, unidade, profissional, serviços e histórico permanecem estritamente isolados por tenant.

Três tipos de mensagem são enfileirados dentro da mesma transação de criação ou reagendamento de atendimento:

1. **`booking.confirmation` (Confirmação imediata ao cliente)**
   - **Destinatário:** Telefone do cliente (`Customer.phone` em formato E.164, enviado como `participantId` apenas com dígitos e DDI).
   - **Gatilho:** Imediato (`scheduledAt = now`) ao confirmar ou remarcar um agendamento elegível.
   - **Requisitos de elegibilidade:** Feature `whatsapp_automation` habilitada no tenant, agendamento em status `CONFIRMED` com `startsAt > now`, e consentimento explícito registrado em `Customer.whatsappOptInAt`.
   - **Parâmetros (`templateParams`):** `[customerName, tenantName, date, time]`.
   - **Texto padrão do template (`booking_confirmation`):**
     > `Olá, {{1}}! Seu agendamento na {{2}} está confirmado para {{3}} às {{4}}.`

2. **`booking.customer_reminder` (Lembrete de corte para o cliente — 1 hora antes)**
   - **Destinatário:** Telefone do cliente (`Customer.phone` em formato E.164).
   - **Gatilho:** Programado para `startsAt - 60 minutos`. Só é enfileirado quando faltam mais de 60 minutos para o início do atendimento no momento da confirmação/remarcação.
   - **Requisitos de elegibilidade no disparo:** Mesmos requisitos de `booking.confirmation`, além de o horário do atendimento ainda ser futuro (`startsAt > now`) e não ter sido remarcado para outra revisão.
   - **Parâmetros (`templateParams`):** `[customerName, tenantName, date, time]`.
   - **Texto padrão do template (`booking_customer_reminder`):**
     > `Olá, {{1}}! Lembrete: seu horário na {{2}} começa em 1 hora ({{3}} às {{4}}).`

3. **`booking.barber_reminder` (Aviso de próximo cliente para o barbeiro — 15 minutos antes)**
   - **Destinatário:** WhatsApp cadastrado no perfil do profissional (`Professional.phone` em formato E.164).
   - **Gatilho:** Programado para `startsAt - 15 minutos`.
   - **Requisitos de elegibilidade no disparo:** Feature `whatsapp_automation` habilitada no tenant, profissional ativo com `phone` E.164 válido, e agendamento em status `CONFIRMED` com `startsAt > now` e mesma revisão (`appointmentVersion`).
   - **Parâmetros (`templateParams`):** `[professionalName, customerName, servicesSummary, time]`.
   - **Texto padrão do template (`booking_barber_reminder`):**
     > `Olá, {{1}}! Seu próximo cliente em 15 minutos é {{2}} ({{3}}) às {{4}}.`

---

## Configuração única no `.env` da plataforma + Conexão direta por barbearia

As credenciais da Zernio são configuradas **uma única vez** no `.env` (ou `.env.production`) do servidor/worker:

```dotenv
NOTIFICATIONS_MODE=live
ZERNIO_API_KEY=sk_live_sua_chave_zernio_aqui
# Opcional: conta padrão da plataforma caso a barbearia ainda não tenha conectado o próprio WhatsApp Business
ZERNIO_ACCOUNT_ID=66b2e19d8c3f5a7e9d0b1c2d
ZERNIO_TEMPLATE_LANGUAGE=pt_BR
ZERNIO_CONFIRMATION_TEMPLATE=booking_confirmation
ZERNIO_CUSTOMER_REMINDER_TEMPLATE=booking_customer_reminder
ZERNIO_BARBER_REMINDER_TEMPLATE=booking_barber_reminder
```

### Conexão do próprio WhatsApp Business por barbearia (`/tenants/:slug/whatsapp`)

Na página **Mensagens de WhatsApp** (`/tenants/:slug/whatsapp`), cada barbearia pode conectar diretamente o seu próprio WhatsApp Business usando a única `ZERNIO_API_KEY` da plataforma:

1. **`POST /v1/tenants/:slug/whatsapp/connect`**:
   - Cria automaticamente um perfil exclusivo na Zernio para o tenant (`POST https://zernio.com/api/v1/profiles`) e persiste `zernioProfileId` no banco.
   - Gera a `authUrl` oficial da Zernio (`GET https://zernio.com/api/v1/connect/whatsapp`) suportando:
     - **Coexistência (`mode: 'coexistence'`)**: Permite conectar o WhatsApp Business da barbearia escaneando o QR Code / autorizando na Meta **sem perder o aplicativo WhatsApp Business no celular**.
     - **Cloud API exclusiva (`mode: 'api'`)**: Conecta um número dedicado exclusivamente à API.
2. **`POST /v1/tenants/:slug/whatsapp/sync`**:
   - Consulta `GET https://zernio.com/api/v1/accounts?profileId=...&platform=whatsapp`, salva `zernioAccountId` e `zernioPhone` no registro do tenant e provisiona automaticamente os 3 templates (`booking_confirmation`, `booking_customer_reminder`, `booking_barber_reminder`) na conta conectada.
3. **`POST /v1/tenants/:slug/whatsapp/disconnect`**:
   - Desvincula o WhatsApp próprio da barbearia, voltando a usar o `ZERNIO_ACCOUNT_ID` padrão da plataforma (se configurado).

---

## Comandos de Provisionamento e Teste Rápido (Zernio)

1. **Habilitar o recurso `whatsapp_automation` nos planos e barbearias (no banco da plataforma):**
   ```bash
   # Habilita em todos os planos padrão da plataforma
   pnpm whatsapp:enable

   # Habilita também um override específico para uma barbearia
   pnpm whatsapp:enable gentry
   ```

2. **Descobrir o `ZERNIO_ACCOUNT_ID` da sua conta de WhatsApp conectada na Zernio:**
   ```bash
   pnpm whatsapp:verify-zernio --list-accounts <SUA_ZERNIO_API_KEY>
   ```

3. **Criar automaticamente os 3 templates de Utilidade na Zernio (`POST /v1/whatsapp/templates`):**
   ```bash
   pnpm whatsapp:verify-zernio --provision-templates
   ```

4. **Disparar uma mensagem de confirmação de teste (`POST /v1/inbox/conversations`):**
   ```bash
   pnpm whatsapp:verify-zernio +5511999999999
   ```
