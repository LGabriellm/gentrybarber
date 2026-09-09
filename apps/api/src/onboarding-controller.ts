import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessError } from '@platform/types';
import type { FoundationServices } from './services';
import { FOUNDATION } from './tokens';
import { z } from 'zod';

@ApiTags('Onboarding')
@ApiCookieAuth()
@Controller('/v1/onboarding')
export class OnboardingController {
  constructor(@Inject(FOUNDATION) private readonly services: FoundationServices) {}

  @Post('/')
  @ApiOperation({ summary: 'Create a new tenant and location for an authenticated user without active memberships' })
  async onboard(@Req() request: FastifyRequest, @Body() body: unknown) {
    const session = await this.services.session(request);
    z.object({}).strict().parse(request.query);
    
    // Check if the user already has any active membership
    const memberships = await this.services.db.membership.count({
      where: {
        userId: session.user.id,
        status: 'ACTIVE',
        tenant: { status: 'ACTIVE' }
      }
    });

    if (memberships > 0) {
      throw new AccessError('FORBIDDEN');
    }

    if (!request.headers.origin || !this.services.config.TRUSTED_ORIGINS.includes(request.headers.origin)) {
      throw new AccessError('FORBIDDEN');
    }

    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
      throw new AccessError('INVALID_INPUT');
    }

    return this.services.onboarding.onboard(session.user.id, body);
  }
}
