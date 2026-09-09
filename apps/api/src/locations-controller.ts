import { Body, Controller, Get, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccessError } from '@platform/types';
import { z } from 'zod';
import type { FoundationServices } from './services';
import { FOUNDATION } from './tokens';

@ApiTags('Locations')
@ApiCookieAuth()
@Controller('/v1/tenants/:slug/locations')
export class LocationController {
  constructor(@Inject(FOUNDATION) private readonly services: FoundationServices) {}

  private async context(request: FastifyRequest, slug: string, writing = false) {
    const context = await this.services.authorize(request, slug);
    z.object({}).strict().parse(request.query);
    if (writing) {
      if (!request.headers.origin || !this.services.config.TRUSTED_ORIGINS.includes(request.headers.origin)) {
        throw new AccessError('FORBIDDEN');
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
        throw new AccessError('INVALID_INPUT');
      }
    }
    return context;
  }

  @Get('/')
  @ApiOperation({ summary: 'List tenant locations' })
  async listLocations(@Req() request: FastifyRequest, @Param('slug') slug: string) {
    return this.services.locations.listLocations(await this.context(request, slug));
  }

  @Post('/')
  @ApiOperation({ summary: 'Create a location for the tenant' })
  async createLocation(@Req() request: FastifyRequest, @Param('slug') slug: string, @Body() body: unknown) {
    return this.services.locations.createLocation(await this.context(request, slug, true), body);
  }

  @Patch('/:id')
  @ApiOperation({ summary: 'Update a location for the tenant' })
  async updateLocation(@Req() request: FastifyRequest, @Param('slug') slug: string, @Param('id') id: string, @Body() body: unknown) {
    return this.services.locations.updateLocation(await this.context(request, slug, true), id, body);
  }
}
