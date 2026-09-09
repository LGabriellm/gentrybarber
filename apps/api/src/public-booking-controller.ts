import { Controller, Get, Post, Query, Body, Inject, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { FOUNDATION } from './tokens';
import type { FoundationServices } from './services';
import { resolvePublicTenant, normalizeHostname } from '@platform/tenancy';
import { AccessError } from '@platform/types';
import type { FastifyRequest } from 'fastify';

@ApiTags('Public Booking')
@Controller('/v1/public/booking')
export class PublicBookingController {
  constructor(
    @Inject(FOUNDATION) private readonly services: FoundationServices,
  ) {}

  private async authorizePublic(hostname: string) {
    const tenant = await resolvePublicTenant(hostname, this.services.config.PLATFORM_DOMAIN, this.services.directory);
    if (!normalizeHostname(hostname).endsWith(`.${normalizeHostname(this.services.config.PLATFORM_DOMAIN)}`)) await this.services.features.require(tenant.id, 'custom_domain');
    await this.services.features.require(tenant.id, 'website');
    await this.services.features.require(tenant.id, 'booking');
    if (!await this.services.db.siteConfiguration.findFirst({ where: { tenantId: tenant.id, published: true }, select: { id: true } })) throw new AccessError('NOT_FOUND');
    return tenant.id;
  }

  @Get('/availability')
  async getAvailability(@Query() query: Record<string, unknown>) {
    const parsed = z.object({ hostname: z.string().min(1).max(260) }).passthrough().parse(query);
    const tenantId = await this.authorizePublic(parsed.hostname);
    const restQuery = { ...query }; delete restQuery.hostname;
    return this.services.booking.getPublicAvailability(tenantId, restQuery);
  }

  @Post('/appointments')
  async createAppointment(@Body() body: Record<string, unknown>, @Req() request: FastifyRequest) {
    z.object({}).strict().parse(request.query);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw new AccessError('INVALID_INPUT');
    const parsed = z.object({ hostname: z.string().min(1).max(260) }).passthrough().parse(body);
    const tenantId = await this.authorizePublic(parsed.hostname);
    const restBody = { ...body }; delete restBody.hostname;
    return this.services.booking.createPublicAppointment(tenantId, restBody);
  }
}

