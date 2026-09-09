-- Better Auth 1.7 identities use (issuer, accountId), not (providerId, accountId).
-- Core contract: @better-auth/core/dist/db/get-tables.mjs and schema/account.mjs.
-- https://better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-is-scoped-by-issuer
BEGIN;

ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;

-- Foundation only enables email/password. Its trusted local issuer is known.
UPDATE "accounts" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';

-- Do not infer an external identity authority from a configurable provider ID.
-- If external accounts predate this migration, map their trusted issuers in a
-- reviewed data migration before applying the required-column/unique-key change.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts" WHERE "issuer" IS NULL) THEN
    RAISE EXCEPTION 'External accounts require an explicit trusted issuer backfill before migrating to Better Auth 1.7';
  END IF;
END;
$$;

ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts" ("issuer", "account_id");
DROP INDEX "accounts_provider_id_account_id_key";

COMMIT;
