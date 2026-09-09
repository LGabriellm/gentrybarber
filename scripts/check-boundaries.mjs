import { readdir, readFile } from 'node:fs/promises';

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const result = await Promise.all(entries.filter(e => !['node_modules', 'dist', 'generated'].includes(e.name)).map(e => e.isDirectory() ? files(`${path}/${e.name}`) : [`${path}/${e.name}`]));
  return result.flat();
}
const roots = ['packages/themes', 'packages/theme-engine', 'packages/design-system', 'packages/ui'];
for (const root of roots) {
  for (const file of await files(root)) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    if (/(?:from\s*|import\s*\()\s*['"](?:@platform\/(?:database|auth|tenancy|billing|booking)|@prisma\/|node:|\.\..*(?:database|auth)\/)/.test(source)) {
      throw new Error(`Presentation boundary violation: ${file}`);
    }
  }
}
console.log('Presentation boundaries verified.');
