-- Additive: appointments created before this release retain NULL metadata.
ALTER TABLE "appointments"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "request_hash" TEXT;
CREATE UNIQUE INDEX "appointments_tenant_id_idempotency_key_key"
  ON "appointments" ("tenant_id", "idempotency_key");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_idempotency_pair"
  CHECK (("idempotency_key" IS NULL AND "request_hash" IS NULL)
    OR ("idempotency_key" IS NOT NULL AND length("idempotency_key") BETWEEN 1 AND 128
      AND "request_hash" IS NOT NULL AND "request_hash" ~ '^[a-f0-9]{64}$'));
