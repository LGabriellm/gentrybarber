import { redirect } from 'next/navigation';
export default async function WebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect('/?tenant=' + encodeURIComponent(slug));
}
