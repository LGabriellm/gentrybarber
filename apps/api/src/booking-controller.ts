import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessError, type PermissionKey } from '@platform/types';
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
    const items = await this.services.db.notification.findMany({
      where: { tenantId: context.tenant.id, channel: 'WHATSAPP', templateKey: 'booking.confirmation' },
      select: { id: true, appointmentId: true, status: true, attempts: true, createdAt: true, sentAt: true, lastError: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
    });
    return { items };
  }

  @Post('/whatsapp/:id/retry')
  @HttpCode(200)
  async retryWhatsApp(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    const context = await this.context(request, slug, 'appointments.update', true);
    await this.services.features.require(context.tenant.id, 'whatsapp_automation');
    z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(id);
    z.object({}).strict().parse(body);
    return this.services.db.$transaction(async tx => {
      const current = await tx.notification.findFirst({ where: { tenantId: context.tenant.id, id, channel: 'WHATSAPP', templateKey: 'booking.confirmation' } });
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
