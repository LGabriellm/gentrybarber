import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import path from 'node:path';

// Check the compiled artifact, including bundled Prisma and its runtime imports.
const portReservation = createServer();
portReservation.listen(0, '127.0.0.1');
await once(portReservation, 'listening');
const port = portReservation.address().port;
await new Promise(resolve => portReservation.close(resolve));
const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: path.resolve('apps/api'), windowsHide: true,
  env: { ...process.env, API_PORT: String(port), BIND_HOST: '127.0.0.1', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let spawnError;
child.on('error', error => { spawnError = error; });
child.stdout.on('data', chunk => { output = (output + chunk).slice(-5000); });
child.stderr.on('data', chunk => { output = (output + chunk).slice(-5000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error('Compiled API exited before readiness.\n' + output);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json()).status === 'ready') { ready = true; break; }
    } catch { /* The child may still be starting. */ }
    await pause(100);
  }
  if (!ready) throw new Error('Compiled API did not reach PostgreSQL readiness.\n' + output);
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  if (!response.ok || (await response.json()).phase !== 'foundation') throw new Error('Unexpected compiled API response.');
  console.info('Compiled API boots and reaches PostgreSQL successfully.');
} finally {
  const exited = once(child, 'exit');
  if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([exited, pause(3000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
