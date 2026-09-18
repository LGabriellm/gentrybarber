import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { cp, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

// Run after NEXT_STANDALONE=1 pnpm build. No database or provider calls.
for (const app of ['web-public', 'dashboard', 'admin']) {
  const root = path.resolve('apps', app);
  const standalone = path.join(root, '.next/standalone/apps', app);
  await access(path.join(standalone, 'server.js'));
  await cp(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  try { await access(path.join(root, 'public')); await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const reservation = createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: standalone, windowsHide: true, stdio: 'ignore', env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port), API_URL: 'http://127.0.0.1:9' } });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`${app}: standalone exited`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.json()).status === 'ok') { ready = true; break; }
      } catch { /* Wait for the local process to listen. */ }
      await pause(200);
    }
    if (!ready) throw new Error(`${app}: standalone did not become healthy`);
    const asset = (await readdir(path.join(standalone, '.next/static'), { recursive: true })).find(file => file.endsWith('.js'));
    if (!asset) throw new Error(`${app}: missing JavaScript asset`);
    const response = await fetch(`http://127.0.0.1:${port}/_next/static/${asset.replaceAll(path.sep, '/')}`);
    if (!response.ok) throw new Error(`${app}: static assets unavailable`);
    console.info(`${app}: standalone HTTP and static assets passed`);
  } finally {
    if (child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  }
}
