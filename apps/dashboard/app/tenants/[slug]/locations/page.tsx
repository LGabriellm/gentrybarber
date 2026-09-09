import { redirect } from 'next/navigation';
import { apiGet } from '@platform/web-kit/server';
import type { LocationCatalog } from '@platform/types';
import { LocationManager } from '../../../../components/location-manager';

export const dynamic = 'force-dynamic';

export default async function LocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = encodeURIComponent(slug);

  try {
    const data = await apiGet<LocationCatalog>(`/v1/tenants/${decoded}/locations`);
    return <LocationManager slug={slug} initialData={data} />;
  } catch (error) {
    if (error instanceof Error && error.message.includes('403')) redirect('/');
    throw error;
  }
}
