import { z } from 'zod';
import { createDatabase } from '../packages/database/src/index';

const [emailArg, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(' ').trim();
if (!emailArg || !reason) {
  console.error("Usage: pnpm access:superadmin <email> <reason>");
  process.exit(1);
}

const email = z.email().parse(emailArg.trim().toLowerCase());
const db = createDatabase(process.env.DATABASE_URL!);

async function makeSuperAdmin() {
  await db.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user) throw new Error(`User with email ${email} not found.`);
    await tx.user.update({ where: { id: user.id }, data: { platformRole: 'SUPER_ADMIN', emailVerified: true } });
    await tx.auditLog.create({ data: {
      tenantId: null,
      actorUserId: null,
      action: 'platform.super_admin_granted',
      resource: 'User',
      resourceId: user.id,
      metadata: { previousRole: user.platformRole, reason, source: 'operator-cli' },
    } });
  });
  console.log(`Successfully elevated user ${email} to SUPER_ADMIN.`);
}

makeSuperAdmin()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
