import "reflect-metadata";
import {
  Body,
  Catch,
  Controller,
  Get,
  Inject,
  Module,
  Param,
  Patch,
  Post,
  Query,
  Req,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
  DocumentBuilder,
  SwaggerModule,
} from "@nestjs/swagger";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyRequest, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z, ZodError } from "zod";
import { AccessError, type PermissionKey } from "@platform/types";
import type { PlatformConfig } from "@platform/config";
import type { FoundationServices } from "./services";
import { BookingController } from "./booking-controller";
import { OnboardingController } from "./onboarding-controller";
import { LocationController } from "./locations-controller";
import { PublicBookingController } from "./public-booking-controller";
import { FOUNDATION } from "./tokens";

export { FOUNDATION } from "./tokens";
@Catch(AccessError, ZodError)
class BoundaryErrorFilter implements ExceptionFilter {
  catch(error: AccessError | ZodError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const code = error instanceof ZodError ? "INVALID_INPUT" : error.code;
    const details = error instanceof ZodError ? error.issues : undefined;
    const status = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      FEATURE_DISABLED: 403,
      INVALID_INPUT: 400,
      CONFLICT: 409,
    }[code];
    reply.status(status).send({ error: code, details });
  }
}
@ApiTags("Foundation")
@Controller()
class FoundationController {
  constructor(
    @Inject(FOUNDATION) private readonly services: FoundationServices,
  ) {}
  @Get("/health")
  @ApiOperation({ summary: "Process liveness" })
  health() {
    return { status: "ok", phase: "foundation" };
  }

  @Get("/ready")
  @ApiOperation({ summary: "Database readiness" })
  async ready() {
    await this.services.db.$queryRaw`SELECT 1`;
    return { status: "ready" };
  }

  @Get("/v1/me")
  @ApiCookieAuth()
  me(@Req() request: FastifyRequest) {
    return this.services.me(request);
  }

  @Get("/v1/tenants/:slug/context")
  @ApiCookieAuth()
  context(@Req() request: FastifyRequest, @Param("slug") slug: string) {
    return this.services.authorize(request, slug);
  }

  @Get("/v1/tenants/:slug/features")
  @ApiCookieAuth()
  async features(@Req() request: FastifyRequest, @Param("slug") slug: string) {
    return this.services.entitlements(
      await this.services.authorize(request, slug),
    );
  }

  @Get("/v1/tenants/:slug/site")
  @ApiCookieAuth()
  async site(@Req() request: FastifyRequest, @Param("slug") slug: string) {
    return this.services.site(
      await this.services.authorize(request, slug, "website.manage", "website"),
    );
  }

  @Get("/v1/tenants/:slug/sites/:id")
  @ApiCookieAuth()
  async siteById(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
    @Param("id") id: string,
  ) {
    return this.services.site(
      await this.services.authorize(request, slug, "website.manage", "website"),
      z.string().min(1).max(128).parse(id),
    );
  }

  @Get("/v1/tenants/:slug/domains")
  @ApiCookieAuth()
  async domains(@Req() request: FastifyRequest, @Param("slug") slug: string) {
    return this.services.domains(
      await this.services.authorize(
        request,
        slug,
        "domains.manage",
        "custom_domain",
      ),
    );
  }

  @Get("/v1/admin/tenants")
  @ApiCookieAuth()
  admin(@Req() request: FastifyRequest) {
    return this.services.adminTenants(request);
  }

  @Get("/v1/public/site")
  publicSite(@Query() query: unknown) {
    return this.services.publicSite(
      z
        .object({ hostname: z.string().min(1).max(260) })
        .strict()
        .parse(query).hostname,
    );
  }
}
@ApiTags("Catalog")
@ApiCookieAuth()
@Controller("/v1/tenants/:slug")
class CatalogController {
  constructor(
    @Inject(FOUNDATION) private readonly services: FoundationServices,
  ) {}

  private async context(
    request: FastifyRequest,
    slug: string,
    permission: PermissionKey,
    writing = false,
  ) {
    const context = await this.services.authorize(
      request,
      slug,
      permission,
      "booking",
    );
    if (writing) {
      const origin = request.headers.origin;
      if (!origin || !this.services.config.TRUSTED_ORIGINS.includes(origin))
        throw new AccessError("FORBIDDEN");
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers["content-type"] ?? "",
        )
      )
        throw new AccessError("INVALID_INPUT");
    }
    return context;
  }

  @Get("/services")
  @ApiOperation({
    summary: "List tenant services and locations, including inactive records",
  })
  async servicesList(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
  ) {
    return this.services.catalog.listServices(
      await this.context(request, slug, "services.manage"),
    );
  }

  @Post("/services")
  @ApiOperation({ summary: "Create a service in an active tenant location" })
  async createService(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    return this.services.catalog.createService(
      await this.context(request, slug, "services.manage", true),
      body,
    );
  }

  @Patch("/services/:id")
  @ApiOperation({
    summary:
      "Edit service fields with expectedVersion concurrency protection",
  })
  async updateService(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.services.catalog.updateService(
      await this.context(request, slug, "services.manage", true),
      id,
      body,
    );
  }

  @Get("/professionals")
  @ApiOperation({
    summary:
      "List tenant professionals, locations and service assignment options",
  })
  async professionalsList(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
  ) {
    return this.services.catalog.listProfessionals(
      await this.context(request, slug, "professionals.manage"),
    );
  }

  @Post("/professionals")
  @ApiOperation({
    summary:
      "Create a professional and service assignments in an active location",
  })
  async createProfessional(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
    @Body() body: unknown,
  ) {
    return this.services.catalog.createProfessional(
      await this.context(request, slug, "professionals.manage", true),
      body,
    );
  }

  @Patch("/professionals/:id")
  @ApiOperation({
    summary:
      "Edit professional and service assignments atomically with expectedVersion",
  })
  async updateProfessional(
    @Req() request: FastifyRequest,
    @Param("slug") slug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.services.catalog.updateProfessional(
      await this.context(request, slug, "professionals.manage", true),
      id,
      body,
    );
  }
}
@Module({})
class AppModule {}
export async function createApplication(
  config: PlatformConfig,
  services: FoundationServices,
  options: { testRateLimitMax?: number } = {},
) {
  if (options.testRateLimitMax !== undefined && config.NODE_ENV !== 'test') throw new Error('Test rate limit override requires NODE_ENV=test');
  const adapter = new FastifyAdapter({
    bodyLimit: 32 * 1024,
    trustProxy: config.TRUST_PROXY_CIDRS.length
      ? config.TRUST_PROXY_CIDRS
      : false,
    logger:
      config.NODE_ENV === "production"
        ? {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "res.headers.set-cookie",
            ],
          }
        : false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      controllers: [FoundationController, CatalogController, BookingController, OnboardingController, LocationController, PublicBookingController],
      providers: [{ provide: FOUNDATION, useValue: services }],
    },
    adapter,
    { logger: config.NODE_ENV === "test" ? false : ["error", "warn", "log"] },
  );
  app.useGlobalFilters(new BoundaryErrorFilter());
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: "no-referrer" },
  });
  await app.register(rateLimit, { max: options.testRateLimitMax ?? 120, timeWindow: "1 minute" });
  app.enableCors({
    origin: config.TRUSTED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
  });
  const fastify = adapter.getInstance();
  fastify.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    return payload;
  });
  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (request, reply) => {
      const headers = fromNodeHeaders(request.headers);
      // Forwarded identity/host headers are not trusted; canonical auth URL comes from configuration.
      for (const key of [
        "host",
        "x-forwarded-host",
        "x-forwarded-for",
        "x-forwarded-proto",
        "x-platform-client-ip",
      ])
        headers.delete(key);
      headers.set("x-platform-client-ip", request.ip);
      const url = new URL(request.url, config.BETTER_AUTH_URL);
      const response = await services.auth.handler(
        new Request(url, {
          method: request.method,
          headers,
          ...(request.method !== "GET" && request.body
            ? { body: JSON.stringify(request.body) }
            : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(`${config.PLATFORM_NAME} API`)
      .setVersion("0.2.0")
      .addCookieAuth("better-auth.session_token")
      .build(),
  );
  fastify.get("/openapi.json", async () => document);
  await app.init();
  await fastify.ready();
  return app;
}
