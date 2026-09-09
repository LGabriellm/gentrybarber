-- Prisma cannot express exclusion constraints or cross-row ownership checks.
-- Keep these database guarantees when evolving the schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_slug_format"
  CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_reserved_slug"
  CHECK ("slug" NOT IN ('www', 'api', 'admin', 'app', 'dashboard', 'status', 'support', 'cdn', 'assets', 'mail', 'preview'));

ALTER TABLE "plans" ADD CONSTRAINT "plans_nonnegative_prices"
  CHECK ("monthly_price_cents" >= 0 AND "setup_fee_cents" >= 0 AND "custom_design_fee_cents" >= 0);
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_nonnegative_limit"
  CHECK ("limit" IS NULL OR "limit" >= 0);
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_features_nonnegative_limit"
  CHECK ("limit" IS NULL OR "limit" >= 0);

ALTER TABLE "themes" ADD CONSTRAINT "bespoke_theme_requires_owner"
  CHECK (("kind" = 'BESPOKE') = ("owner_tenant_id" IS NOT NULL));
ALTER TABLE "theme_versions" ADD CONSTRAINT "theme_versions_positive_version"
  CHECK ("version" > 0);

-- A tenant cannot reference another tenant's exclusive renderer, even without
-- a published version. Global template/advanced themes have no owner.
CREATE FUNCTION enforce_theme_tenant_ownership() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE theme_owner text;
BEGIN
  SELECT "owner_tenant_id" INTO theme_owner FROM "themes" WHERE "id" = NEW."theme_id";
  IF theme_owner IS NOT NULL AND theme_owner <> NEW."tenant_id" THEN
    RAISE EXCEPTION 'Theme belongs to a different tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "theme_versions_tenant_owner"
  BEFORE INSERT OR UPDATE OF "tenant_id", "theme_id" ON "theme_versions"
  FOR EACH ROW EXECUTE FUNCTION enforce_theme_tenant_ownership();
CREATE TRIGGER "site_configurations_tenant_owner"
  BEFORE INSERT OR UPDATE OF "tenant_id", "theme_id" ON "site_configurations"
  FOR EACH ROW EXECUTE FUNCTION enforce_theme_tenant_ownership();

-- Ownership is part of renderer identity. Create a new theme to change it;
-- allowing reassignment could invalidate sites or race with a version insert.
CREATE FUNCTION prevent_theme_owner_reassignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."owner_tenant_id" IS DISTINCT FROM NEW."owner_tenant_id" THEN
    RAISE EXCEPTION 'Theme ownership is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "themes_owner_immutable" BEFORE UPDATE OF "owner_tenant_id" ON "themes"
  FOR EACH ROW EXECUTE FUNCTION prevent_theme_owner_reassignment();

ALTER TABLE "domains" ADD CONSTRAINT "domains_canonical_hostname"
  CHECK ("hostname" = lower("hostname") AND "hostname" !~ '[:/[:space:]]' AND right("hostname", 1) <> '.');
CREATE UNIQUE INDEX "domains_one_active_primary_per_tenant"
  ON "domains" ("tenant_id") WHERE "is_primary" = true AND "status" = 'ACTIVE';

ALTER TABLE "services" ADD CONSTRAINT "services_valid_duration_price"
  CHECK ("duration_minutes" > 0 AND "price_cents" >= 0);
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_valid_duration_price"
  CHECK ("duration_minutes" > 0 AND "price_cents" >= 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_positive_interval"
  CHECK ("ends_at" > "starts_at" AND "total_cents" >= 0);

-- Half-open intervals permit adjacent bookings. The exclusion is transactional
-- and protects concurrent requests, including when an appointment is rescheduled.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_professional_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    "professional_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'));

ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_valid_interval"
  CHECK ("weekday" BETWEEN 0 AND 6 AND "start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute");
ALTER TABLE "professional_schedules" ADD CONSTRAINT "professional_schedules_valid_interval"
  CHECK ("weekday" BETWEEN 0 AND 6 AND "start_minute" >= 0 AND "end_minute" <= 1440 AND "end_minute" > "start_minute");
ALTER TABLE "time_offs" ADD CONSTRAINT "time_offs_positive_interval" CHECK ("ends_at" > "starts_at");
ALTER TABLE "payments" ADD CONSTRAINT "payments_nonnegative_amount" CHECK ("amount_cents" >= 0);
ALTER TABLE "gallery_assets" ADD CONSTRAINT "gallery_assets_valid_dimensions"
  CHECK ("size_bytes" > 0 AND ("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
