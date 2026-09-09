import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { PublicSiteData, ThemeAccessContext } from '@platform/theme-engine';
export interface PublicSite { data: PublicSiteData; themeId: string; themeContext: ThemeAccessContext; version: number; title: string; canonicalHost: string }
export const getPublicSite = cache(async (): Promise<PublicSite> => {
  const incoming = await headers();
  const host = incoming.get('host') || '';
  const target = new URL('/v1/public/site', process.env.API_URL || 'http://localhost:4000');
  target.searchParams.set('hostname', host);
  const response = await fetch(target, { cache: 'no-store' });
  if ([400, 403, 404].includes(response.status)) notFound();
  if (!response.ok) throw new Error('Site temporariamente indisponível');
  return response.json() as Promise<PublicSite>;
});

