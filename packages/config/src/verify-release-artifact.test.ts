import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../scripts/verify-release-artifact.mjs', import.meta.url));
const sha = 'a'.repeat(40);
const releaseId = `${sha}-12345-2`;
const releaseFiles = ['REVISION', 'RELEASE_ID', 'IMAGE_IDS', 'images.tar.gz', 'config.tar.gz'];
const services = ['api', 'worker', 'web-public', 'dashboard', 'admin'];
let directory: string;

async function writeChecksums() {
  const rows = await Promise.all(releaseFiles.map(async name => {
    const content = await readFile(path.join(directory, name));
    return `${createHash('sha256').update(content).digest('hex')}  ${name}`;
  }));
  await writeFile(path.join(directory, 'SHA256SUMS'), `${rows.join('\n')}\n`);
}

function verify(expectedSha = sha, expectedReleaseId = releaseId) {
  return spawnSync(process.execPath, [script, directory, expectedSha, expectedReleaseId], { encoding: 'utf8' });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'barber-release-test-'));
  await writeFile(path.join(directory, 'REVISION'), `${sha}\n`);
  await writeFile(path.join(directory, 'RELEASE_ID'), `${releaseId}\n`);
  await writeFile(path.join(directory, 'IMAGE_IDS'), `${services.map(service => `${service}=sha256:${createHash('sha256').update(service).digest('hex')}`).join('\n')}\n`);
  await writeFile(path.join(directory, 'images.tar.gz'), 'representative compressed image bytes');
  await writeFile(path.join(directory, 'config.tar.gz'), 'representative release configuration bytes');
  await writeChecksums();
});

afterEach(async () => {
  if (path.dirname(directory) !== tmpdir() || !path.basename(directory).startsWith('barber-release-test-')) {
    throw new Error('Refusing to remove a directory outside the release test area');
  }
  await rm(directory, { recursive: true, force: true });
});

describe('immutable production release verification', () => {
  it('accepts the complete bundle only for its approved CI commit and run', () => {
    const result = verify();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Verified release ${releaseId}`);
  });

  it.each(['images.tar.gz', 'config.tar.gz'])('rejects altered %s after packaging', async name => {
    await writeFile(path.join(directory, name), 'changed bytes after approval');
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${name} failed SHA256 verification`);
  });

  it('rejects a valid bundle when the deploy selects another CI commit', () => {
    const otherSha = 'b'.repeat(40);
    const result = verify(otherSha, `${otherSha}-12345-2`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REVISION does not match');
  });

  it('rejects a bundle re-labeled with a different commit even if its checksums are updated', async () => {
    await writeFile(path.join(directory, 'REVISION'), `${'b'.repeat(40)}\n`);
    await writeChecksums();
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('REVISION does not match');
  });

  it('rejects a bundle from another CI attempt even if its checksums are updated', async () => {
    await writeFile(path.join(directory, 'RELEASE_ID'), `${sha}-12345-3\n`);
    await writeChecksums();
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RELEASE_ID does not match');
  });

  it('rejects missing release files before publication', async () => {
    await unlink(path.join(directory, 'config.tar.gz'));
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
  });

  it.each([
    ['duplicate service', `api=sha256:${'a'.repeat(64)}\napi=sha256:${'b'.repeat(64)}\nworker=sha256:${'c'.repeat(64)}\ndashboard=sha256:${'d'.repeat(64)}\nadmin=sha256:${'e'.repeat(64)}\n`],
    ['unknown service', `api=sha256:${'a'.repeat(64)}\nworker=sha256:${'b'.repeat(64)}\nweb-public=sha256:${'c'.repeat(64)}\ndashboard=sha256:${'d'.repeat(64)}\nunknown=sha256:${'e'.repeat(64)}\n`],
    ['invalid image ID', `api=latest\nworker=sha256:${'b'.repeat(64)}\nweb-public=sha256:${'c'.repeat(64)}\ndashboard=sha256:${'d'.repeat(64)}\nadmin=sha256:${'e'.repeat(64)}\n`],
  ])('rejects IMAGE_IDS with %s', async (_name, content) => {
    await writeFile(path.join(directory, 'IMAGE_IDS'), content);
    await writeChecksums();
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/IMAGE_IDS contains/);
  });

  it('rejects a checksum manifest with a duplicate or unlisted file', async () => {
    const checksumFile = path.join(directory, 'SHA256SUMS');
    const checksums = await readFile(checksumFile, 'utf8');
    await writeFile(checksumFile, checksums.replace(/config\.tar\.gz/, 'images.tar.gz'));
    expect(verify().status).toBe(1);
  });

  it('requires a release ID tied to a concrete CI run and attempt', () => {
    const result = verify(sha, `${sha}-0-1`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected release ID');
  });
});
