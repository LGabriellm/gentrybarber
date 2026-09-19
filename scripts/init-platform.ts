import { createDatabase } from '../packages/database/src/index.js';

const db = createDatabase(process.env.DATABASE_URL!);

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

async function setup() {
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
    for (const theme of [
      { id: "classic", key: "classic", name: "Classic", kind: "TEMPLATE" as const, ownerTenantId: null },
      { id: "urban", key: "urban", name: "Urban", kind: "TEMPLATE" as const, ownerTenantId: null },
    ]) {
      await tx.theme.upsert({ where: { key: theme.key }, create: theme, update: {} });
    }
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

setup().then(() => console.log('Platform configuration completed.')).catch(console.error).finally(() => db.$disconnect());
