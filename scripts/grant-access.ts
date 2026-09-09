import { z } from 'zod';
import { createDatabase } from '../packages/database/src/index';

const [emailArg, tenantSlug, roleKey = 'OWNER'] = process.argv.slice(2);
const email = z.email().parse(emailArg);
if (!tenantSlug) throw new Error('Usage: pnpm access:grant <verified-email> <tenant-slug> [OWNER|MANAGER|RECEPTIONIST|BARBER]');
z.enum(['OWNER', 'MANAGER', 'RECEPTIONIST', 'BARBER']).parse(roleKey);
const db = createDatabase(z.url().parse(process.env.DATABASE_URL));
try {
  const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true, emailVerified: true } });
  if (!user.emailVerified) throw new Error('Verify the account e-mail before granting access.');
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: tenantSlug }, select: { id: true } });
  const role = await db.role.findUniqueOrThrow({ where: { key: roleKey }, select: { id: true } });
  await db.$transaction(async tx => {
    await tx.membership.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, create: { tenantId: tenant.id, userId: user.id, roleId: role.id, status: 'ACTIVE' }, update: { roleId: role.id, status: 'ACTIVE' } });
    await tx.auditLog.create({ data: { tenantId: tenant.id, action: 'membership.operator_grant', resource: 'User', resourceId: user.id, metadata: { role: roleKey, source: 'operator-cli' } } });
  });
  console.info('Membership granted and audit event recorded.');
} finally { await db.$disconnect(); }
