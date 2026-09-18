import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { exportSiteProject, siteAssetSchema } from '../packages/theme-engine/src/index';

const [input, output] = process.argv.slice(2);
if (!input || !output || !output.endsWith('.site.json')) throw new Error('Uso: pnpm site:pack <pasta> <arquivo.site.json>');
const entries = await readdir(input, { withFileTypes: true });
for (const entry of entries) if (!(['index.html', 'styles.css', 'content.json'].includes(entry.name) && entry.isFile()) && !(entry.name === 'assets' && entry.isDirectory())) throw new Error(`Arquivo não suportado: ${entry.name}`);
async function bounded(file: string, limit: number) { const data = await readFile(path.join(input!, file)); if (data.length > limit) throw new Error(`Arquivo muito grande: ${file}`); return data; }
const metadata: unknown = JSON.parse((await bounded('content.json', 900000)).toString('utf8'));
if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(key => !['tokens', 'content'].includes(key))) throw new Error('content.json aceita apenas tokens e content.');
const assets = [];
if (entries.some(entry => entry.name === 'assets')) {
  const files = await readdir(path.join(input, 'assets'), { withFileTypes: true });
  if (files.length > 10) throw new Error('Limite de 10 imagens.');
  for (const file of files) {
    if (!file.isFile()) throw new Error('assets aceita apenas arquivos raster.');
    const bytes = await bounded(`assets/${file.name}`, 58 * 1024);
    const extension = path.extname(file.name).slice(1);
    assets.push(siteAssetSchema.parse({ name: file.name, src: `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}` }));
  }
}
const project = exportSiteProject({ ...metadata, code: { enabled: true, html: (await bounded('index.html', 120000)).toString('utf8'), css: (await bounded('styles.css', 80000)).toString('utf8'), assets } });
await writeFile(output, project, { flag: 'wx' });
console.log(`Projeto validado: ${output}. Importe no workspace da barbearia de destino.`);
