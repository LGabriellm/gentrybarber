import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { createDatabase } from "../src/index.js";

const url = process.env.DATABASE_TEST_URL;
if (!url) throw new Error("DATABASE_TEST_URL must point to a dedicated PostgreSQL test database with migrations applied.");
if (!new URL(url).pathname.endsWith("_test")) throw new Error("DATABASE_TEST_URL database name must end in _test.");

const db = createDatabase(url);
const pool = new pg.Pool({ connectionString: url });
const prefix = `db-test-${randomUUID()}`;
const ids = {
  plan: `${prefix}-plan`, a: `${prefix}-a`, b: `${prefix}-b`,
  locationA: `${prefix}-la`, locationA2: `${prefix}-la2`, locationB: `${prefix}-lb`,
  professionalA: `${prefix}-pa`, professionalB: `${prefix}-pb`,
  serviceA: `${prefix}-sa`, serviceB: `${prefix}-sb`,
  customerA: `${prefix}-ca`, customerB: `${prefix}-cb`,
  theme: `${prefix}-theme`, exclusiveTheme: `${prefix}-exclusive`,
  versionA: `${prefix}-va`, versionB: `${prefix}-vb`,
  userA: `${prefix}-ua`, userB: `${prefix}-ub`,
};

beforeAll(async () => {
  await db.user.createMany({ data: [
    { id: ids.userA, email: `${ids.userA}@example.test`, name: "Identity fixture A" },
    { id: ids.userB, email: `${ids.userB}@example.test`, name: "Identity fixture B" },
  ] });
  await db.plan.create({ data: { id: ids.plan, key: ids.plan, name: "Integration fixture" } });
  await db.tenant.createMany({ data: [
    { id: ids.a, slug: ids.a, name: "Tenant A", planId: ids.plan, status: "ACTIVE" },
    { id: ids.b, slug: ids.b, name: "Tenant B", planId: ids.plan, status: "ACTIVE" },
  ] });
  await db.location.createMany({ data: [
    { id: ids.locationA, tenantId: ids.a, slug: "main", name: "A" },
    { id: ids.locationA2, tenantId: ids.a, slug: "second", name: "A second" },
    { id: ids.locationB, tenantId: ids.b, slug: "main", name: "B" },
  ] });
  await db.professional.createMany({ data: [
    { id: ids.professionalA, tenantId: ids.a, locationId: ids.locationA, name: "Professional A" },
    { id: ids.professionalB, tenantId: ids.b, locationId: ids.locationB, name: "Professional B" },
  ] });
  await db.service.createMany({ data: [
    { id: ids.serviceA, tenantId: ids.a, locationId: ids.locationA, name: "A service", durationMinutes: 30, priceCents: 5000 },
    { id: ids.serviceB, tenantId: ids.b, locationId: ids.locationB, name: "B service", durationMinutes: 30, priceCents: 5000 },
  ] });
  await db.customer.createMany({ data: [
    { id: ids.customerA, tenantId: ids.a, name: "Customer A", phone: "+550000000001" },
    { id: ids.customerB, tenantId: ids.b, name: "Customer B", phone: "+550000000001" },
  ] });
  await db.theme.createMany({ data: [
    { id: ids.theme, key: ids.theme, name: "Shared template", kind: "TEMPLATE" },
    { id: ids.exclusiveTheme, key: ids.exclusiveTheme, name: "Tenant A only", kind: "BESPOKE", ownerTenantId: ids.a },
  ] });
  await db.themeVersion.createMany({ data: [
    { id: ids.versionA, tenantId: ids.a, themeId: ids.theme, version: 1, status: "PUBLISHED" },
    { id: ids.versionB, tenantId: ids.b, themeId: ids.theme, version: 1, status: "PUBLISHED" },
  ] });
  await db.siteConfiguration.createMany({ data: [
    { tenantId: ids.a, themeId: ids.theme, publishedThemeVersionId: ids.versionA, title: "A", description: "A", published: true },
    { tenantId: ids.b, themeId: ids.theme, publishedThemeVersionId: ids.versionB, title: "B", description: "B", published: true },
  ] });
}, 30_000);

afterAll(async () => {
  const tenants = { in: [ids.a, ids.b] };
  try {
    await db.$transaction([
      db.appointment.deleteMany({ where: { tenantId: tenants } }),
      db.siteConfiguration.deleteMany({ where: { tenantId: tenants } }),
      db.themeVersion.deleteMany({ where: { tenantId: tenants } }),
      db.theme.deleteMany({ where: { id: { in: [ids.theme, ids.exclusiveTheme] } } }),
      db.professionalService.deleteMany({ where: { tenantId: tenants } }),
      db.service.deleteMany({ where: { tenantId: tenants } }),
      db.professional.deleteMany({ where: { tenantId: tenants } }),
      db.customer.deleteMany({ where: { tenantId: tenants } }),
      db.location.deleteMany({ where: { tenantId: tenants } }),
      db.billingEvent.deleteMany({ where: { tenantId: tenants } }),
      db.tenant.deleteMany({ where: { id: tenants } }),
      db.plan.deleteMany({ where: { id: ids.plan } }),
      db.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } }),
    ]);
  } finally {
    await pool.end();
    await db.$disconnect();
  }
}, 30_000);

function insertAppointment(input: {
  id: string;
  tenantId?: string;
  locationId?: string;
  professionalId?: string;
  customerId?: string;
  startsAt?: string;
  endsAt?: string;
  status?: string;
}) {
  return pool.query(
    `INSERT INTO "appointments" (id, tenant_id, location_id, professional_id, customer_id, status, starts_at, ends_at, total_cents, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::"AppointmentStatus", $7, $8, 5000, now())`,
    [input.id, input.tenantId ?? ids.a, input.locationId ?? ids.locationA, input.professionalId ?? ids.professionalA,
      input.customerId ?? ids.customerA, input.status ?? "CONFIRMED", input.startsAt ?? "2030-01-01T10:00:00Z", input.endsAt ?? "2030-01-01T10:30:00Z"],
  );
}

describe("PostgreSQL tenant isolation and invariants", () => {
  it("scopes account subjects by issuer rather than configurable provider ID", async () => {
    const statement = `INSERT INTO accounts (id,account_id,provider_id,issuer,user_id,updated_at) VALUES ($1,$2,$3,$4,$5,now())`;
    await pool.query(statement, [`${prefix}-account-a`, prefix, "test-provider", "https://identity-a.example.test", ids.userA]);
    await expect(pool.query(statement, [`${prefix}-account-b`, prefix, "test-provider", "https://identity-b.example.test", ids.userB])).resolves.toBeDefined();
    await expect(pool.query(statement, [`${prefix}-account-duplicate`, prefix, "alternate-provider", "https://identity-a.example.test", ids.userB])).rejects.toMatchObject({ code: "23505" });
  });

  it("requires an explicit account issuer instead of silently assigning an identity namespace", async () => {
    await expect(pool.query(
      `INSERT INTO accounts (id,account_id,provider_id,user_id,updated_at) VALUES ($1,$2,'credential',$2,now())`,
      [`${prefix}-account-missing-issuer`, ids.userA],
    )).rejects.toMatchObject({ code: "23502" });
  });

  it("rejects a service referencing another tenant's location", async () => {
    await expect(pool.query(
      `INSERT INTO services (id,tenant_id,location_id,name,duration_minutes,price_cents,updated_at) VALUES ($1,$2,$3,'Invalid',30,5000,now())`,
      [`${prefix}-bad-service`, ids.a, ids.locationB],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a professional-service association across tenants", async () => {
    await expect(pool.query(
      `INSERT INTO professional_services (tenant_id,location_id,professional_id,service_id) VALUES ($1,$2,$3,$4)`,
      [ids.a, ids.locationA, ids.professionalA, ids.serviceB],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects cross-tenant customer and professional references", async () => {
    await expect(insertAppointment({ id: `${prefix}-bad-customer`, customerId: ids.customerB })).rejects.toMatchObject({ code: "23503" });
    await expect(insertAppointment({ id: `${prefix}-bad-professional`, professionalId: ids.professionalB })).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a professional assigned to a different unit of the same tenant", async () => {
    await expect(insertAppointment({ id: `${prefix}-bad-unit`, locationId: ids.locationA2 })).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects publication of another tenant's theme version", async () => {
    await expect(pool.query(
      `UPDATE site_configurations SET published_theme_version_id=$1 WHERE tenant_id=$2`,
      [ids.versionB, ids.a],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects a published version belonging to a different renderer of the same tenant", async () => {
    await expect(pool.query(
      `UPDATE site_configurations SET theme_id=$1 WHERE tenant_id=$2`,
      [ids.exclusiveTheme, ids.a],
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("changes and rolls back the published snapshot without changing another tenant", async () => {
    const revision = await db.themeVersion.create({ data: {
      tenantId: ids.a, themeId: ids.theme, version: 2, status: "PUBLISHED", config: { heading: "New version" },
    } });
    await db.siteConfiguration.update({ where: { tenantId: ids.a }, data: { publishedThemeVersionId: revision.id } });
    expect((await db.siteConfiguration.findUniqueOrThrow({ where: { tenantId: ids.a } })).publishedThemeVersionId).toBe(revision.id);
    expect((await db.siteConfiguration.findUniqueOrThrow({ where: { tenantId: ids.b } })).publishedThemeVersionId).toBe(ids.versionB);
    await db.siteConfiguration.update({ where: { tenantId: ids.a }, data: { publishedThemeVersionId: ids.versionA } });
    expect((await db.siteConfiguration.findUniqueOrThrow({ where: { tenantId: ids.a } })).publishedThemeVersionId).toBe(ids.versionA);
    expect((await db.themeVersion.findUniqueOrThrow({ where: { id: revision.id } })).config).toEqual({ heading: "New version" });
  });

  it("rejects borrowing a bespoke renderer at both version and site levels", async () => {
    await expect(pool.query(
      `INSERT INTO theme_versions (id,tenant_id,theme_id,version,updated_at) VALUES ($1,$2,$3,1,now())`,
      [`${prefix}-foreign-version`, ids.b, ids.exclusiveTheme],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      `UPDATE site_configurations SET theme_id=$1 WHERE tenant_id=$2`,
      [ids.exclusiveTheme, ids.b],
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents reassignment of a bespoke renderer to another tenant", async () => {
    await expect(pool.query(`UPDATE themes SET owner_tenant_id=$1 WHERE id=$2`, [ids.b, ids.exclusiveTheme])).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents negative commercial values and nonpositive appointment intervals", async () => {
    await expect(pool.query(`UPDATE plans SET monthly_price_cents=-1 WHERE id=$1`, [ids.plan])).rejects.toMatchObject({ code: "23514" });
    await expect(insertAppointment({ id: `${prefix}-zero-time`, endsAt: "2030-01-01T10:00:00Z" })).rejects.toMatchObject({ code: "23514" });
  });

  it("makes provider webhook delivery idempotent at the database boundary", async () => {
    const statement = `INSERT INTO billing_events (id,tenant_id,provider,provider_event_id,type,payload) VALUES ($1,$2,'test',$3,'test','{}')`;
    await pool.query(statement, [`${prefix}-event1`, ids.a, prefix]);
    await expect(pool.query(statement, [`${prefix}-event2`, ids.a, prefix])).rejects.toMatchObject({ code: "23505" });
  });

  it("admits exactly one simultaneous appointment for the same professional", async () => {
    const slot = { startsAt: "2030-02-01T10:00:00Z", endsAt: "2030-02-01T10:30:00Z" };
    const attempts = await Promise.allSettled([
      insertAppointment({ id: `${prefix}-race1`, ...slot }),
      insertAppointment({ id: `${prefix}-race2`, ...slot }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
    expect(rejected).toBeDefined();
    expect(rejected!.reason.code).toMatch(/^(23P01|40P01)$/);
  });

  it("allows adjacent appointments and independently booked tenants", async () => {
    const slot = { startsAt: "2030-02-02T10:00:00Z", endsAt: "2030-02-02T10:30:00Z" };
    await insertAppointment({ id: `${prefix}-adjacent-first`, ...slot });
    await expect(insertAppointment({ id: `${prefix}-adjacent`, startsAt: "2030-02-02T10:30:00Z", endsAt: "2030-02-02T11:00:00Z" })).resolves.toBeDefined();
    await expect(insertAppointment({ id: `${prefix}-tenant-b`, tenantId: ids.b, locationId: ids.locationB, professionalId: ids.professionalB, customerId: ids.customerB, ...slot })).resolves.toBeDefined();
  });

  it("allows canceled overlaps while preventing reactivation into a conflict", async () => {
    const slot = { startsAt: "2030-02-03T10:00:00Z", endsAt: "2030-02-03T10:30:00Z" };
    await insertAppointment({ id: `${prefix}-confirmed-before-canceled`, ...slot });
    await insertAppointment({ id: `${prefix}-canceled`, status: "CANCELED", ...slot });
    await expect(pool.query(`UPDATE appointments SET status='CONFIRMED' WHERE id=$1`, [`${prefix}-canceled`])).rejects.toMatchObject({ code: "23P01" });
  });
});
