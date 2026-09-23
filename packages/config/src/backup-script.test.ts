import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash';
const backupScript = fileURLToPath(new URL('../../../infra/vps/backup.sh', import.meta.url));
const releaseId = `${'a'.repeat(40)}-12345-2`;
const dumpBytes = 'PGDMP test archive accepted by fake pg_restore';

function shellPath(file: string) {
  if (process.platform !== 'win32') return file;
  const normalized = path.resolve(file).replaceAll('\\', '/');
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match?.[1] || match[2] === undefined) throw new Error(`Cannot convert Windows path ${file} for Git Bash`);
  return `/${match[1].toLowerCase()}/${match[2]}`;
}

let root: string;
let appDir: string;
let cronCwd: string;
let fakeBin: string;
let logFile: string;
let oldBackup: string;

function runBackup(mode: 'success' | 'dump-fail' | 'restore-fail' | 'empty-dump' = 'success') {
  return spawnSync(bash, ['-c', 'export PATH="$FAKE_BIN:$PATH"; bash "$1"', 'backup-test', shellPath(backupScript)], {
    cwd: cronCwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      BARBER_APP_DIR: shellPath(appDir),
      FAKE_BIN: shellPath(fakeBin),
      FAKE_DOCKER_LOG: shellPath(logFile),
      FAKE_DOCKER_MODE: mode,
      EXPECTED_RELEASE_ID: releaseId,
    },
  });
}

async function backupFiles() {
  const names = await readdir(path.join(appDir, 'backups'));
  return {
    final: names.filter(name => /^platform_\d{8}_\d{6}\.dump$/.test(name)),
    temporary: names.filter(name => /^\.platform_.*\.dump$/.test(name)),
  };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'barber-backup-test-'));
  appDir = path.join(root, 'app');
  cronCwd = path.join(root, 'unrelated-cron-working-directory');
  fakeBin = path.join(root, 'bin');
  logFile = path.join(root, 'docker-calls.log');
  oldBackup = path.join(appDir, 'backups', 'platform_old.dump');

  await Promise.all([
    mkdir(path.join(appDir, 'current'), { recursive: true }),
    mkdir(path.join(appDir, 'backups'), { recursive: true }),
    mkdir(cronCwd),
    mkdir(fakeBin),
  ]);
  await Promise.all([
    writeFile(path.join(appDir, '.env.production'), 'PLATFORM_DOMAIN=example.test\n'),
    writeFile(path.join(appDir, 'current', 'compose.production.yaml'), 'services: {}\n'),
    writeFile(path.join(appDir, 'current', 'RELEASE_ID'), `${releaseId}\n`),
    writeFile(oldBackup, 'previous backup'),
  ]);
  const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  await utimes(oldBackup, oldDate, oldDate);

  const fakeDocker = path.join(fakeBin, 'docker');
  await writeFile(fakeDocker, `#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == compose && "$2" == --project-directory && "$3" == "$BARBER_APP_DIR" && "$4" == --env-file && "$5" == "$BARBER_APP_DIR/.env.production" && "$6" == -f && "$7" == "$BARBER_APP_DIR/current/compose.production.yaml" ]] || { echo 'incorrect compose paths' >&2; exit 90; }
[[ "$RELEASE_ID" == "$EXPECTED_RELEASE_ID" ]] || { echo 'missing active release ID' >&2; exit 91; }
shift 7
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
if [[ "$1" == config && "$2" == --quiet ]]; then
  exit 0
fi
if [[ "$1" == exec && "$2" == -T && "$3" == postgres && "$4" == pg_dump ]]; then
  if [[ "$FAKE_DOCKER_MODE" == dump-fail ]]; then
    printf 'partial dump'
    exit 7
  fi
  if [[ "$FAKE_DOCKER_MODE" == empty-dump ]]; then
    exit 0
  fi
  printf '%s' '${dumpBytes}'
  exit 0
fi
if [[ "$1" == exec && "$2" == -T && "$3" == postgres && "$4" == pg_restore && "$5" == --list ]]; then
  cat > /dev/null
  if [[ "$FAKE_DOCKER_MODE" == restore-fail ]]; then
    exit 8
  fi
  exit 0
fi
echo 'unexpected docker command' >&2
exit 92
`);
  await chmod(fakeDocker, 0o755);
});

afterEach(async () => {
  if (path.dirname(root) !== tmpdir() || !path.basename(root).startsWith('barber-backup-test-')) {
    throw new Error('Refusing to remove a directory outside the backup test area');
  }
  await rm(root, { recursive: true, force: true });
});

describe('production backup from cron', () => {
  it('uses the active release and explicit production env from an unrelated working directory', async () => {
    const result = runBackup();
    expect(result.status, result.stderr).toBe(0);
    const calls = (await readFile(logFile, 'utf8')).trim().split('\n');
    expect(calls[0]).toBe('config --quiet');
    expect(calls[1]).toContain('exec -T postgres pg_dump');
    expect(calls[2]).toBe('exec -T postgres pg_restore --list');
  });

  it('publishes a validated private dump and rotates old copies only after success', async () => {
    const result = runBackup();
    expect(result.status, result.stderr).toBe(0);
    const files = await backupFiles();
    expect(files.final).toHaveLength(1);
    expect(files.temporary).toHaveLength(0);
    const newDump = files.final[0];
    if (!newDump) throw new Error('Expected a published backup');
    expect(await readFile(path.join(appDir, 'backups', newDump), 'utf8')).toBe(dumpBytes);
    await expect(stat(oldBackup)).rejects.toThrow();
    if (process.platform !== 'win32') {
      const dumpMode = (await stat(path.join(appDir, 'backups', newDump))).mode & 0o777;
      const directoryMode = (await stat(path.join(appDir, 'backups'))).mode & 0o777;
      expect(dumpMode).toBe(0o600);
      expect(directoryMode).toBe(0o700);
    }
  });

  it.each(['dump-fail', 'restore-fail', 'empty-dump'] as const)(
    'does not publish or rotate when %s occurs',
    async mode => {
      const result = runBackup(mode);
      expect(result.status).not.toBe(0);
      const files = await backupFiles();
      expect(files.final).toHaveLength(0);
      expect(files.temporary).toHaveLength(0);
      expect(await readFile(oldBackup, 'utf8')).toBe('previous backup');
    },
  );
});
