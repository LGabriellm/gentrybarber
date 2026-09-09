import { createDatabase } from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL before seeding.");
if (process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is disabled in production; provision plans and tenants explicitly.");
}
const db = createDatabase(databaseUrl);

// Commercial examples only: stored configuration is the source of truth.
const features = [
  "website", "booking", "customers", "advanced_site_builder", "custom_domain",
  "custom_design", "custom_pages", "custom_css", "premium_animations", "white_label",
  "finance", "commissions", "inventory", "loyalty", "coupons", "reviews", "analytics",
  "whatsapp_automation", "multi_location",
] as const;

const plans = [
  { key: "start", name: "Start", monthlyPriceCents: 9900, setupFeeCents: 19900, customDesignFeeCents: 0,
    featureKeys: ["website", "booking", "customers"] },
  { key: "pro", name: "Pro", monthlyPriceCents: 19900, setupFeeCents: 29900, customDesignFeeCents: 0,
    featureKeys: ["website", "booking", "customers", "advanced_site_builder", "analytics"] },
  { key: "premium", name: "Premium", monthlyPriceCents: 39900, setupFeeCents: 49900, customDesignFeeCents: 199900,
    featureKeys: ["website", "booking", "customers", "advanced_site_builder", "analytics", "custom_domain", "custom_design", "custom_pages", "custom_css", "premium_animations", "white_label"] },
  { key: "network", name: "Network", monthlyPriceCents: 79900, setupFeeCents: 99900, customDesignFeeCents: 299900,
    featureKeys: ["website", "booking", "customers", "advanced_site_builder", "analytics", "custom_domain", "custom_design", "custom_pages", "custom_css", "premium_animations", "white_label", "multi_location"] },
];

const permissionKeys = [
  "appointments.read", "appointments.create", "appointments.update", "appointments.manage_all", "schedules.manage", "customers.read",
  "customers.update", "services.manage", "professionals.manage", "website.manage",
  "design.manage", "domains.manage", "reports.read", "billing.read", "team.manage",
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  OWNER: permissionKeys,
  MANAGER: permissionKeys.filter((key) => key !== "billing.read" && key !== "team.manage"),
  RECEPTIONIST: ["appointments.read", "appointments.create", "appointments.update", "appointments.manage_all", "customers.read", "customers.update"],
  BARBER: ["appointments.read", "appointments.update", "customers.read"],
};

async function seed() {
  await db.$transaction(async (tx) => {
    const featureIds = new Map<string, string>();
    for (const key of features) {
      const feature = await tx.feature.upsert({ where: { key }, create: { id: `feature-${key}`, key, name: key.replaceAll("_", " ") }, update: {} });
      featureIds.set(key, feature.id);
    }
    const planIds = new Map<string, string>();
    for (const plan of plans) {
      const { featureKeys, ...data } = plan;
      const savedPlan = await tx.plan.upsert({ where: { key: plan.key }, create: { id: `plan-${plan.key}`, ...data }, update: {} });
      planIds.set(plan.key, savedPlan.id);
      for (const key of features) {
        await tx.planFeature.upsert({
          where: { planId_featureId: { planId: savedPlan.id, featureId: featureIds.get(key)! } },
          create: { planId: savedPlan.id, featureId: featureIds.get(key)!, enabled: featureKeys.includes(key), limit: key === "multi_location" && featureKeys.includes(key) ? 10 : null },
          update: {},
        });
      }
    }
    const permissionIds = new Map<string, string>();
    for (const key of permissionKeys) {
      const permission = await tx.permission.upsert({ where: { key }, create: { id: `permission-${key}`, key, description: key }, update: {} });
      permissionIds.set(key, permission.id);
    }
    for (const [key, keys] of Object.entries(rolePermissions)) {
      const role = await tx.role.upsert({ where: { key }, create: { id: `role-${key.toLowerCase()}`, key, name: key }, update: {} });
      for (const permissionKey of keys) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permissionIds.get(permissionKey)! } },
          create: { roleId: role.id, permissionId: permissionIds.get(permissionKey)! }, update: {},
        });
      }
    }
    for (const tenant of [
      { id: "tenant-imperial", slug: "imperial", name: "Barbearia Imperial", planId: planIds.get("premium")! },
      { id: "tenant-studio", slug: "studio", name: "Studio Barber", planId: planIds.get("start")! },
    ]) {
      await tx.tenant.upsert({ where: { slug: tenant.slug }, create: { ...tenant, status: "ACTIVE" }, update: {} });
      await tx.location.upsert({
        where: { id: `location-${tenant.slug}` },
        create: { id: `location-${tenant.slug}`, tenantId: tenant.id, name: "Unidade principal", slug: "principal", address: { city: "São Paulo", state: "SP", country: "BR" } },
        update: {},
      });
      const services = [
        { key: "corte", name: "Corte de cabelo", durationMinutes: 40, priceCents: 6500 },
        { key: "barba", name: "Barba e acabamento", durationMinutes: 30, priceCents: 4500 },
        { key: "completo", name: "Corte e barba", durationMinutes: 70, priceCents: 9500 },
      ];
      for (const service of services) {
        const { key, ...data } = service;
        await tx.service.upsert({
          where: { id: `service-${tenant.slug}-${key}` },
          create: { id: `service-${tenant.slug}-${key}`, tenantId: tenant.id, locationId: `location-${tenant.slug}`, ...data }, update: {},
        });
      }
      await tx.professional.upsert({
        where: { id: `professional-${tenant.slug}` },
        create: { id: `professional-${tenant.slug}`, tenantId: tenant.id, locationId: `location-${tenant.slug}`, name: tenant.slug === "imperial" ? "Rafael" : "Lucas", bio: "Cuidado e precisão em cada detalhe." }, update: {},
      });
      for (const service of services) {
        await tx.professionalService.upsert({
          where: { tenantId_professionalId_serviceId: { tenantId: tenant.id, professionalId: `professional-${tenant.slug}`, serviceId: `service-${tenant.slug}-${service.key}` } },
          create: { tenantId: tenant.id, locationId: `location-${tenant.slug}`, professionalId: `professional-${tenant.slug}`, serviceId: `service-${tenant.slug}-${service.key}` }, update: {},
        });
      }
      for (const weekday of [1, 2, 3, 4, 5, 6]) {
        await tx.businessHour.upsert({
          where: { tenantId_locationId_weekday_startMinute: { tenantId: tenant.id, locationId: `location-${tenant.slug}`, weekday, startMinute: 540 } },
          create: { tenantId: tenant.id, locationId: `location-${tenant.slug}`, weekday, startMinute: 540, endMinute: 1140 }, update: {},
        });
      }
    }
    for (const theme of [
      { id: "classic", key: "classic", name: "Classic", kind: "TEMPLATE" as const, ownerTenantId: null },
      { id: "urban", key: "urban", name: "Urban", kind: "TEMPLATE" as const, ownerTenantId: null },
      { id: "bespoke-imperial", key: "bespoke-imperial", name: "Imperial Exclusivo", kind: "BESPOKE" as const, ownerTenantId: "tenant-imperial" },
    ]) {
      await tx.theme.upsert({ where: { key: theme.key }, create: theme, update: {} });
    }
    for (const site of [
      { tenantId: "tenant-imperial", themeId: "bespoke-imperial", title: "Barbearia Imperial", description: "Tradição, cuidado e estilo em uma experiência feita para você.", heroTitle: "O seu estilo. Nosso legado.", heroSubtitle: "Um ritual de cuidado, pensado nos detalhes." },
      { tenantId: "tenant-studio", themeId: "urban", title: "Studio Barber", description: "Cortes com atitude, técnica e a sua identidade.", heroTitle: "Seu corte. Sua identidade.", heroSubtitle: "Estilo urbano, atenção de verdade." },
    ]) {
      const versionId = `version-${site.tenantId}-1`;
      await tx.themeVersion.upsert({
        where: { id: versionId },
        create: { id: versionId, tenantId: site.tenantId, themeId: site.themeId, version: 1, status: "PUBLISHED", config: { rendererId: site.themeId, revision: 1 }, approvedAt: new Date("2026-01-01T00:00:00.000Z"), publishedAt: new Date("2026-01-01T00:00:00.000Z") }, update: {},
      });
      await tx.siteConfiguration.upsert({
        where: { tenantId: site.tenantId }, create: { ...site, published: true, publishedThemeVersionId: versionId }, update: {},
      });
      await tx.tenantDesignConfig.upsert({
        where: { tenantId: site.tenantId },
        create: { tenantId: site.tenantId, ...(site.tenantId === "tenant-studio" ? { primaryColor: "#D6F04B", accentColor: "#D6F04B", fontHeading: "sans-serif" } : {}) }, update: {},
      });
    }
    await tx.designBrief.upsert({
      where: { id: "brief-imperial" },
      create: { id: "brief-imperial", tenantId: "tenant-imperial", status: "PUBLISHED", desiredStyle: "Clássico contemporâneo", positioning: "Cuidado e tradição com identidade própria.", preferredColors: ["#141311", "#B9945B"] }, update: {},
    });
    await tx.systemSetting.upsert({
      where: { key: "platform.identity" },
      create: { key: "platform.identity", value: { displayName: "BarberHub", locale: "pt-BR" }, description: "Nome comercial configurável, desacoplado dos pacotes." }, update: {},
    });
    await tx.systemSetting.upsert({
      where: { key: "onboarding.defaults" },
      create: { key: "onboarding.defaults", value: { planId: planIds.get("start")! }, description: "Plano inicial configurável para novas barbearias." }, update: {},
    });
  }, { timeout: 30_000 });
}

try {
  await seed();
  console.info("Seed completed: two example tenants, catalog, permissions and presentation snapshots. No credentials were created.");
} finally {
  await db.$disconnect();
}
