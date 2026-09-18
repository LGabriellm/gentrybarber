import { z } from 'zod';
import { siteEditorConfigSchema } from './site-editor';

/** Portable presentation only: importing never imports tenant IDs, roles or publication state. */
export const siteProjectSchema = z.object({ format: z.literal('barber-site'), version: z.literal(1), config: siteEditorConfigSchema }).strict();
export function parseSiteProject(source: string) {
  if (new TextEncoder().encode(source).length > 950000) throw new Error('Projeto excede 950 KB.');
  return siteProjectSchema.parse(JSON.parse(source));
}
export function exportSiteProject(config: unknown) {
  return JSON.stringify(siteProjectSchema.parse({ format: 'barber-site', version: 1, config }), null, 2);
}
