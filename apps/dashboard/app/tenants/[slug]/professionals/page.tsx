import { CatalogPage } from '../../../../components/catalog-page';

export const dynamic = 'force-dynamic';
export default async function ProfessionalsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CatalogPage slug={slug} resource="professionals" />;
}
