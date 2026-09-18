import { Controller, Get, Param, Query, Req, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { FoundationServices } from './services';
import { FOUNDATION } from './tokens';
import { z } from 'zod';

const querySchema = z.object({
  locationId: z.string().optional(),
  timezone: z.string().default('America/Sao_Paulo'),
}).strict();

@ApiTags('finance')
@Controller('/v1/tenants/:slug/finance')
export class FinanceController {
  constructor(@Inject(FOUNDATION) private readonly services: FoundationServices) {}

  @Get('/summary')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get financial summary for the current month' })
  async summary(
    @Req() request: FastifyRequest,
    @Param('slug') slug: string,
    @Query() query: unknown,
  ) {
    // Requires reports.read permission and booking feature
    const context = await this.services.authorize(request, slug, 'reports.read', 'booking');
    const { locationId, timezone } = querySchema.parse(query);
    
    return this.services.finance.getSummary(context.tenant.id, locationId, timezone);
  }
}
