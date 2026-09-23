#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseFiles = ['REVISION', 'RELEASE_ID', 'IMAGE_IDS', 'images.tar.gz', 'config.tar.gz'];
const services = ['api', 'worker', 'web-public', 'dashboard', 'admin'];
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

function lines(value, name) {
  const rows = value.replace(/\r?\n$/, '').split(/\r?\n/);
  if (rows.some(row => row.length === 0)) throw new Error(`${name} contains a blank line`);
  return rows;
}

function singleLine(value, name) {
  const rows = lines(value, name);
  if (rows.length !== 1 || rows[0].includes('\r')) throw new Error(`${name} must contain one line`);
  return rows[0];
}

async function regularFile(directory, name) {
  const file = path.join(directory, name);
  const info = await lstat(file);
  if (!info.isFile()) throw new Error(`${name} must be a regular file`);
  return file;
}

async function readReleaseFile(directory, name) {
  return readFile(await regularFile(directory, name), 'utf8');
}

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyReleaseArtifact(directory, expectedSha, expectedReleaseId) {
  if (!shaPattern.test(expectedSha)) throw new Error('Expected SHA must be a lowercase 40-character Git commit SHA');
  if (!new RegExp(`^${expectedSha}-[1-9][0-9]*-[1-9][0-9]*$`).test(expectedReleaseId)) {
    throw new Error('Expected release ID must contain the SHA, CI run ID and run attempt');
  }

  const revision = singleLine(await readReleaseFile(directory, 'REVISION'), 'REVISION');
  if (revision !== expectedSha) throw new Error('REVISION does not match the approved CI commit');

  const releaseId = singleLine(await readReleaseFile(directory, 'RELEASE_ID'), 'RELEASE_ID');
  if (releaseId !== expectedReleaseId) throw new Error('RELEASE_ID does not match the approved CI run');

  const imageIds = lines(await readReleaseFile(directory, 'IMAGE_IDS'), 'IMAGE_IDS');
  if (imageIds.length !== services.length) throw new Error('IMAGE_IDS must contain exactly five services');
  const seenServices = new Set();
  for (const row of imageIds) {
    const match = /^([a-z-]+)=sha256:([0-9a-f]{64})$/.exec(row);
    if (!match || !services.includes(match[1]) || seenServices.has(match[1])) {
      throw new Error('IMAGE_IDS contains an unknown, duplicate or invalid image ID');
    }
    seenServices.add(match[1]);
  }

  const checksumRows = lines(await readReleaseFile(directory, 'SHA256SUMS'), 'SHA256SUMS');
  if (checksumRows.length !== releaseFiles.length) throw new Error('SHA256SUMS must cover exactly five release files');
  const checksums = new Map();
  for (const row of checksumRows) {
    const match = /^([0-9a-f]{64})[ ]{2}([A-Za-z0-9_.-]+)$/.exec(row);
    if (!match || !digestPattern.test(match[1]) || !releaseFiles.includes(match[2]) || checksums.has(match[2])) {
      throw new Error('SHA256SUMS contains an unknown, duplicate or invalid file');
    }
    checksums.set(match[2], match[1]);
  }

  for (const name of releaseFiles) {
    const actual = await fileDigest(await regularFile(directory, name));
    if (actual !== checksums.get(name)) throw new Error(`${name} failed SHA256 verification`);
  }

  return { revision, releaseId, imageIds: Object.fromEntries(imageIds.map(row => row.split('='))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, expectedSha, expectedReleaseId] = process.argv.slice(2);
  if (!directory || !expectedSha || !expectedReleaseId || process.argv.length !== 5) {
    console.error('Usage: node scripts/verify-release-artifact.mjs <dir> <expected-sha> <expected-release-id>');
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyReleaseArtifact(directory, expectedSha, expectedReleaseId);
      console.log(`Verified release ${result.releaseId}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
