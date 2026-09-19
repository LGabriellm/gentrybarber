import { z } from 'zod';
import { createDatabase } from '../packages/database/src/index';

const emailArg = process.argv[2];
if (!emailArg) {
  console.error("Usage: node --env-file-if-exists=.env --import tsx scripts/make-superadmin.ts <email>");
  process.exit(1);
}

const email = z.email().parse(emailArg);
const db = createDatabase(process.env.DATABASE_URL!);

async function makeSuperAdmin() {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
  }

  await db.user.update({
    where: { id: user.id },
    data: { platformRole: 'SUPER_ADMIN', emailVerified: true }
  });
  
  console.log(`Successfully elevated user ${email} to SUPER_ADMIN.`);
}

makeSuperAdmin()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
