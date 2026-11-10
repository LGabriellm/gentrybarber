-- Ensure whatsapp_automation feature exists in the features catalog
INSERT INTO "features" ("id", "key", "name")
VALUES ('feature-whatsapp_automation', 'whatsapp_automation', 'whatsapp automation')
ON CONFLICT ("key") DO NOTHING;

-- Enable whatsapp_automation on all existing plans
INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled")
SELECT p."id", f."id", true
FROM "plans" p
CROSS JOIN "features" f
WHERE f."key" = 'whatsapp_automation'
ON CONFLICT ("plan_id", "feature_id") DO UPDATE SET "enabled" = true;
