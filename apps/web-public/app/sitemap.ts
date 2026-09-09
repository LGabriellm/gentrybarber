import type { MetadataRoute } from 'next';
import { getPublicSite } from '../lib/site';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> { const site = await getPublicSite(); return [{ url: 'https://' + site.canonicalHost + '/', changeFrequency: 'weekly' }]; }

