import { TestimonialCard, FAQItem, StatsBlock as StatsDisplay, BusinessHours, MapEmbed, CTABanner } from '@platform/design-system';

export function TestimonialsBlock({ testimonials }: { testimonials: readonly { author: string; text: string; rating?: number }[] }) {
  if (!testimonials || testimonials.length === 0) {
    return <div className="empty-testimonials">No testimonials yet.</div>;
  }
  return (
    <div className="ds-testimonials-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--theme-spacing-md)' }}>
      {testimonials.map((t, i) => (
        <TestimonialCard key={i} author={t.author} text={t.text} rating={t.rating} />
      ))}
    </div>
  );
}

export function FAQBlock({ items }: { items: readonly { question: string; answer: string }[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="ds-faq-list" style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--theme-spacing-sm)' }}>
      {items.map((item, i) => (
        <FAQItem key={i} question={item.question} answer={item.answer} />
      ))}
    </div>
  );
}

export function HoursBlock({ hours }: { hours: readonly { day: string; open: string; close: string }[] }) {
  if (!hours || hours.length === 0) return null;
  return <BusinessHours hours={hours} />;
}

export function StatsBlockSection({ stats }: { stats: readonly { value: string; label: string }[] }) {
  if (!stats || stats.length === 0) return null;
  return <StatsDisplay items={stats} />;
}

export function CTABlock({ title, body, ctaUrl, ctaLabel }: { title: string; body?: string; ctaUrl?: string; ctaLabel?: string }) {
  return (
    <CTABanner title={title} subtitle={body} buttonHref={ctaUrl || '#contato'} buttonLabel={ctaLabel || 'Saiba mais'} />
  );
}

export function MapBlock({ mapUrl, title }: { mapUrl: string; title?: string }) {
  return <MapEmbed url={mapUrl} title={title} />;
}
