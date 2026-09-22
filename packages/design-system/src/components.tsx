import React from "react";
import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

export function SectionHeading({ label, title, description, inverse = false }: { label: string; title: string; description?: string; inverse?: boolean }) {
  return (
    <div className={`ds-section-heading ${inverse ? 'ds-section-heading--inverse' : ''}`}>
      <p className="ds-section-heading__label">{label}</p>
      <h2 className="ds-section-heading__title">{title}</h2>
      {description && <p className="ds-section-heading__description">{description}</p>}
    </div>
  );
}

export function ServiceCard({ name, description, priceLabel, durationMinutes, variant = "minimal" }: {
  name: string; description?: string; priceLabel?: string; durationMinutes?: number; variant?: "minimal" | "bordered" | "editorial";
}) {
  return (
    <article className={`ds-service-card ds-service-card--${variant}`}>
      <div className="ds-service-card__header">
        <h3 className="ds-service-card__title">{name}</h3>
        {priceLabel && <span className="ds-service-card__price">{priceLabel}</span>}
      </div>
      {description && <p className="ds-service-card__description">{description}</p>}
      {durationMinutes !== undefined && <span className="ds-service-card__duration">{durationMinutes} MIN</span>}
    </article>
  );
}

export function ProfessionalCard({ name, specialty, index = 0 }: { name: string; specialty?: string; index?: number }) {
  return (
    <article className="ds-professional-card">
      <div aria-hidden="true" className="ds-professional-card__image-container">
        <span className="ds-professional-card__initials">{name.split(" ").slice(0, 2).map(part => part[0]).join("")}</span>
        <span className="ds-professional-card__index">0{index + 1}</span>
      </div>
      <h3 className="ds-professional-card__title">{name}</h3>
      {specialty && <p className="ds-professional-card__specialty">{specialty}</p>}
    </article>
  );
}

export function ThemeSection({ id, children, style, className }: { id?: string; children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <section id={id} className={`ds-theme-section ${className || ''}`} style={style}>
      {children}
    </section>
  );
}

export function TestimonialCard({ text, author, rating = 5, variant = 'minimal' }: {
  text: string; author: string; rating?: number; variant?: 'minimal' | 'featured';
}) {
  return (
    <div className={`ds-testimonial-card ds-testimonial-card--${variant}`}>
      <div className="ds-testimonial-card__rating">
        {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
      </div>
      <blockquote className="ds-testimonial-card__quote">"{text}"</blockquote>
      <cite className="ds-testimonial-card__author">{author}</cite>
    </div>
  );
}

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="ds-faq-item">
      <summary className="ds-faq-item__summary">
        {question}
        <span className="ds-faq-item__chevron" aria-hidden="true">▼</span>
      </summary>
      <div className="ds-faq-item__content">{answer}</div>
    </details>
  );
}

export function StatsBlock({ items }: { items: readonly { value: string; label: string }[] }) {
  return (
    <div className="ds-stats-block">
      {items.map((item, index) => (
        <div key={index} className="ds-stats-block__item">
          <div className="ds-stats-block__value">{item.value}</div>
          <div className="ds-stats-block__label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export function BusinessHours({ hours, highlightDay }: { hours: readonly { day: string; open: string; close: string }[]; highlightDay?: number }) {
  return (
    <table className="ds-business-hours">
      <tbody>
        {hours.map((h, index) => (
          <tr key={index} className={`ds-business-hours__row ${highlightDay === index ? 'ds-business-hours__row--highlight' : ''}`}>
            <td className="ds-business-hours__day">{h.day}</td>
            <td className="ds-business-hours__time">
              {h.open === h.close ? h.open : `${h.open} - ${h.close}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SOCIAL_ICONS = {
  instagram: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>,
  whatsapp: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>,
  facebook: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>,
  google: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.788 5.108A9 9 0 1021 12h-8"></path></svg>
};

export function SocialLinks({ links }: { links: readonly { type: 'instagram' | 'whatsapp' | 'facebook' | 'google'; url: string }[] }) {
  return (
    <div className="ds-social-links">
      {links.map((link, i) => (
        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="ds-social-links__item" aria-label={link.type}>
          {SOCIAL_ICONS[link.type]}
        </a>
      ))}
    </div>
  );
}

export function MapEmbed({ url, title }: { url: string; title?: string }) {
  const isValid = url.startsWith('https://www.google.com/maps/embed');
  if (!isValid) {
    return <div className="ds-map-embed ds-map-embed--fallback">Mapa indisponível.</div>;
  }
  return (
    <div className="ds-map-embed">
      <iframe 
        src={url} 
        title={title || "Mapa"} 
        loading="lazy" 
        className="ds-map-embed__iframe" 
        allowFullScreen 
        referrerPolicy="no-referrer-when-downgrade" 
      />
    </div>
  );
}

export function CTABanner({ title, subtitle, buttonLabel, buttonHref, onButtonClick, variant = 'solid' }: {
  title: string; subtitle?: string; buttonLabel: string; buttonHref: string;
  onButtonClick?: MouseEventHandler<HTMLAnchorElement>;
  variant?: 'solid' | 'outlined' | 'gradient';
}) {
  return (
    <div className={`ds-cta-banner ds-cta-banner--${variant}`}>
      <h2 className="ds-cta-banner__title">{title}</h2>
      {subtitle && <p className="ds-cta-banner__subtitle">{subtitle}</p>}
      <a href={buttonHref} onClick={onButtonClick} className="ds-cta-banner__button">{buttonLabel}</a>
    </div>
  );
}

export function Divider({ variant = 'line' }: { variant?: 'line' | 'dots' | 'ornament' }) {
  if (variant === 'dots') {
    return <div className="ds-divider ds-divider--dots"><span /><span /><span /></div>;
  }
  if (variant === 'ornament') {
    return (
      <div className="ds-divider ds-divider--ornament">
        <svg width="40" height="12" viewBox="0 0 40 12" fill="none">
          <path d="M0 6h40" stroke="currentColor" strokeDasharray="4 4"/>
          <circle cx="20" cy="6" r="4" fill="var(--theme-accent)"/>
        </svg>
      </div>
    );
  }
  return <hr className="ds-divider ds-divider--line" />;
}

export function FeatureHighlight({ icon, title, description }: {
  icon: string; title: string; description: string;
}) {
  return (
    <div className="ds-feature-highlight">
      <div className="ds-feature-highlight__icon" aria-hidden="true">{icon}</div>
      <h3 className="ds-feature-highlight__title">{title}</h3>
      <p className="ds-feature-highlight__description">{description}</p>
    </div>
  );
}
