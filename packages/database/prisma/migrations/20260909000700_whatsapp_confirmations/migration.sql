ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
ALTER TABLE "customers" ADD COLUMN "whatsapp_opt_in_at" TIMESTAMPTZ(3);
ALTER TABLE "notifications"
  ADD COLUMN "appointment_id" TEXT,
  ADD COLUMN "appointment_version" INTEGER,
  ADD COLUMN "processing_at" TIMESTAMPTZ(3),
  ADD COLUMN "provider_message_id" TEXT,
  ADD CONSTRAINT "notifications_appointment_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "notifications_appointment_revision" CHECK (("appointment_id" IS NULL AND "appointment_version" IS NULL) OR ("appointment_id" IS NOT NULL AND "appointment_version" IS NOT NULL AND "appointment_version" > 0));
CREATE INDEX "notifications_channel_status_scheduled_at_idx" ON "notifications"("channel", "status", "scheduled_at");


