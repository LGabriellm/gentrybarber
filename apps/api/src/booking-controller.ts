import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessError, type PermissionKey } from '@platform/types';
import {
  createZernioProfile,
  getZernioWhatsAppConnectUrl,
  listZernioProfileWhatsAppAccounts,
  provisionZernioWhatsAppTemplates,
  whatsappRuntime,
  whatsappTemplateKeys,
} from '@platform/notifications';
import { requirePermission } from '@platform/tenancy';
import { z } from 'zod';
import type { FoundationServices } from './services';
import { FOUNDATION } from './tokens';

@ApiTags('Booking')
@ApiCookieAuth()
@Controller('/v1/tenants/:slug')
export class BookingController {
  constructor(@Inject(FOUNDATION) private readonly services: FoundationServices) {}

  private async context(request: FastifyRequest, slug: string, permission: PermissionKey, writing = false, customers = false) {
    const context = await this.services.authorize(request, slug, permission, 'booking');
    requirePermission(context, 'appointments.manage_all');
    if (customers) await this.services.features.require(context.tenant.id, 'customers');
    if (writing) {
      if (!request.headers.origin || !this.services.config.TRUSTED_ORIGINS.includes(request.headers.origin)) throw new AccessError('FORBIDDEN');
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new AccessError('INVALID_INPUT');
      z.object({}).strict().parse(request.query);
    }
    return context;
  }

  @Get('/booking/options')
  @ApiOperation({ summary: 'Tenant-scoped locations and catalog for operational booking' })
  async options(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    const context = await this.context(request, slug, 'appointments.read');
    z.object({}).strict().parse(query);
    return this.services.booking.getOptions(context);
  }

  @Get('/schedule')
  async schedule(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    return this.services.booking.getSchedule(await this.context(request, slug, 'appointments.read'), query);
  }

  @Put('/schedule')
  @ApiOperation({ summary: 'Change recurring hours without invalidating existing appointments' })
  async updateSchedule(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.services.booking.updateSchedule(await this.context(request, slug, 'schedules.manage', true), body);
  }

  @Post('/time-offs')
  async block(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.services.booking.createTimeOff(await this.context(request, slug, 'schedules.manage', true), body);
  }

  @Delete('/time-offs/:id')
  async unblock(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'schedules.manage', true);
    z.object({}).strict().parse(body);
    return this.services.booking.deleteTimeOff(context, id);
  }

  @Get('/customers')
  async customers(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    return this.services.booking.listCustomers(await this.context(request, slug, 'customers.read', false, true), query);
  }

  @Post('/customers')
  async createCustomer(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.services.booking.createCustomer(await this.context(request, slug, 'customers.update', true, true), body);
  }

  @Patch('/customers/:id')
  async updateCustomer(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    return this.services.booking.updateCustomer(await this.context(request, slug, 'customers.update', true, true), id, body);
  }

  @Get('/availability')
  async availability(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    return this.services.booking.availability(await this.context(request, slug, 'appointments.read'), query);
  }

  @Get('/appointments')
  async appointments(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    return this.services.booking.listAppointments(await this.context(request, slug, 'appointments.read'), query);
  }

  @Get('/whatsapp')
  async whatsapp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Query() query: unknown) {
    const context = await this.context(request, slug, 'appointments.read');
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    z.object({}).strict().parse(query);
    const [items, tenant] = await Promise.all([
      this.services.db.notification.findMany({
        where: { tenantId: context.tenant.id, channel: 'WHATSAPP', templateKey: { in: [...whatsappTemplateKeys] } },
        select: { id: true, appointmentId: true, templateKey: true, status: true, attempts: true, scheduledAt: true, createdAt: true, sentAt: true, lastError: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
      this.services.db.tenant.findUnique({
        where: { id: context.tenant.id },
        select: { zernioProfileId: true, zernioAccountId: true, zernioPhone: true },
      }),
    ]);
    const runtime = whatsappRuntime();
    return {
      items,
      connection: {
        platformConfigured: Boolean(runtime.apiKey),
        globalFallbackConfigured: Boolean(runtime.defaultAccount),
        connected: Boolean(tenant?.zernioAccountId),
        profileId: tenant?.zernioProfileId ?? null,
        accountId: tenant?.zernioAccountId ?? null,
        phone: tenant?.zernioPhone ?? null,
      },
    };
  }

  @Post('/whatsapp/connect')
  @HttpCode(200)
  async connectWhatsApp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'appointments.update', true);
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    const input = z.object({
      redirectUrl: z.url(),
      mode: z.enum(['coexistence', 'api']).default('coexistence'),
    }).strict().parse(body);

    const parsedRedirect = new URL(input.redirectUrl);
    if (!this.services.config.TRUSTED_ORIGINS.includes(parsedRedirect.origin)) {
      throw new AccessError('FORBIDDEN');
    }

    const runtime = whatsappRuntime();
    if (!runtime.apiKey) throw new AccessError('INVALID_INPUT');

    const tenant = await this.services.db.tenant.findUniqueOrThrow({
      where: { id: context.tenant.id },
      select: { id: true, name: true, slug: true, zernioProfileId: true },
    });

    let profileId = tenant.zernioProfileId;
    if (!profileId) {
      const created = await createZernioProfile(runtime.apiKey, tenant);
      profileId = created.profileId;
      await this.services.db.$transaction([
        this.services.db.tenant.update({
          where: { id: context.tenant.id },
          data: { zernioProfileId: profileId },
        }),
        this.services.db.auditLog.create({
          data: {
            tenantId: context.tenant.id,
            actorUserId: context.userId,
            action: 'whatsapp.profile_created',
            resource: 'Tenant',
            resourceId: context.tenant.id,
          },
        }),
      ]);
    }

    const { authUrl } = await getZernioWhatsAppConnectUrl(runtime.apiKey, {
      profileId,
      redirectUrl: input.redirectUrl,
      mode: input.mode,
    });

    await this.services.db.auditLog.create({
      data: {
        tenantId: context.tenant.id,
        actorUserId: context.userId,
        action: 'whatsapp.connect_initiated',
        resource: 'Tenant',
        resourceId: context.tenant.id,
      },
    });

    return { authUrl, profileId };
  }

  @Post('/whatsapp/sync')
  @HttpCode(200)
  async syncWhatsApp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'appointments.update', true);
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    z.object({}).strict().parse(body);

    const runtime = whatsappRuntime();
    if (!runtime.apiKey) throw new AccessError('INVALID_INPUT');

    const tenant = await this.services.db.tenant.findUniqueOrThrow({
      where: { id: context.tenant.id },
      select: { zernioProfileId: true, zernioAccountId: true, zernioPhone: true },
    });

    if (!tenant.zernioProfileId) {
      return { connected: false, accountId: null, phone: null };
    }

    const accounts = await listZernioProfileWhatsAppAccounts(runtime.apiKey, tenant.zernioProfileId);
    const active = accounts.find(acc => acc.status === 'connected') ?? accounts[0];
    if (!active) {
      return { connected: false, accountId: null, phone: null };
    }

    await this.services.db.$transaction([
      this.services.db.tenant.update({
        where: { id: context.tenant.id },
        data: {
          zernioAccountId: active.accountId,
          zernioPhone: active.phone,
        },
      }),
      this.services.db.auditLog.create({
        data: {
          tenantId: context.tenant.id,
          actorUserId: context.userId,
          action: 'whatsapp.account_synced',
          resource: 'Tenant',
          resourceId: context.tenant.id,
        },
      }),
    ]);

    if (runtime.defaultTemplates) {
      await provisionZernioWhatsAppTemplates({
        apiKey: runtime.apiKey,
        accountId: active.accountId,
        ...runtime.defaultTemplates,
      }).catch(() => undefined);
    }

    return {
      connected: true,
      accountId: active.accountId,
      phone: active.phone,
    };
  }

  @Post('/whatsapp/disconnect')
  @HttpCode(200)
  async disconnectWhatsApp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'appointments.update', true);
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    z.object({}).strict().parse(body);

    await this.services.db.$transaction([
      this.services.db.tenant.update({
        where: { id: context.tenant.id },
        data: {
          zernioAccountId: null,
          zernioPhone: null,
        },
      }),
      this.services.db.auditLog.create({
        data: {
          tenantId: context.tenant.id,
          actorUserId: context.userId,
          action: 'whatsapp.account_disconnected',
          resource: 'Tenant',
          resourceId: context.tenant.id,
        },
      }),
    ]);

    return { connected: false, accountId: null, phone: null };
  }

  @Post('/whatsapp/:id/retry')
  @HttpCode(200)
  async retryWhatsApp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'appointments.update', true);
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(id);
    z.object({}).strict().parse(body);
    return this.services.db.$transaction(async tx => {
      const current = await tx.notification.findFirst({ where: { tenantId: context.tenant.id, id, channel: 'WHATSAPP', templateKey: { in: [...whatsappTemplateKeys] } } });
      if (!current) throw new AccessError('NOT_FOUND');
      const changed = await tx.notification.updateMany({ where: { tenantId: context.tenant.id, id, status: 'FAILED' }, data: { status: 'PENDING', processingAt: null, scheduledAt: new Date(), lastError: null, attempts: 0 } });
      if (changed.count !== 1) throw new AccessError('CONFLICT');
      await tx.auditLog.create({ data: { tenantId: context.tenant.id, actorUserId: context.userId, action: 'notification.retry_requested', resource: 'Notification', resourceId: id } });
      return { queued: true };
    });
  }

  @Post('/appointments')
  @ApiOperation({ summary: 'Confirm a booking with transactional availability and idempotency' })
  async book(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.services.booking.createAppointment(await this.context(request, slug, 'appointments.create', true, true), body);
  }

  @Post('/appointments/:id/reschedule')
  @HttpCode(200)
  async reschedule(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    return this.services.booking.reschedule(await this.context(request, slug, 'appointments.update', true), id, body);
  }

  @Post('/appointments/:id/status')
  @HttpCode(200)
  async transition(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    return this.services.booking.transition(await this.context(request, slug, 'appointments.update', true), id, body);
  }
}
