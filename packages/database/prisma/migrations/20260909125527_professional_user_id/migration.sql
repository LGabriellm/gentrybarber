-- AlterTable
ALTER TABLE "professionals" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "professionals_user_id_idx" ON "professionals"("user_id");

-- RenameForeignKey
ALTER TABLE "notifications" RENAME CONSTRAINT "notifications_appointment_fkey" TO "notifications_tenant_id_appointment_id_fkey";

-- AddForeignKey
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
