import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Next.js forwards Node CLI flags to its workers through NODE_OPTIONS, where
// --env-file-if-exists is forbidden. A preload keeps that flag out of the CLI.
try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
