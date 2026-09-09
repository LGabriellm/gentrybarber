import { BookingPage } from '../../../../components/booking-page';
export const dynamic = 'force-dynamic';
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <BookingPage slug={slug} mode="horarios" />; }
