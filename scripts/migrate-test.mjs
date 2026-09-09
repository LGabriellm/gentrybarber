import { spawnSync } from 'node:child_process';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_TEST_URL;
if (!databaseUrl || !decodeURIComponent(new URL(databaseUrl).pathname.slice(1)).endsWith('_test')) throw new Error('DATABASE_TEST_URL must point to a dedicated database ending in _test.');
const cwd = path.resolve('packages/database');
const child = spawnSync(process.execPath, [path.join(cwd, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit', windowsHide: true });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
