export const designSystemCss = `
/* SectionHeading */
.ds-section-heading { max-width: 620px; margin-bottom: 36px; color: inherit; }
.ds-section-heading--inverse { color: #FFFFFF; }
.ds-section-heading__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .18em; margin: 0 0 16px; color: var(--theme-accent); }
.ds-section-heading__title { font-family: var(--theme-heading-font); font-size: clamp(2rem, 4vw, 3.4rem); font-weight: 400; line-height: 1.08; margin: 0; }
.ds-section-heading__description { font-size: 15px; line-height: 1.7; opacity: .75; margin-top: 20px; }

/* ServiceCard */
.ds-service-card { padding: 24px 0; border-bottom: 1px solid currentColor; }
.ds-service-card--bordered { padding: 28px; border: 1px solid currentColor; border-radius: var(--theme-radius); border-bottom: 1px solid currentColor; }
.ds-service-card--editorial { padding: 24px 0; border-top: 1px solid currentColor; border-bottom: none; }
.ds-service-card__header { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
.ds-service-card__title { font-family: var(--theme-heading-font); font-size: 24px; font-weight: 400; margin: 0; }
.ds-service-card__price { white-space: nowrap; font-size: 14px; }
.ds-service-card__description { opacity: .7; font-size: 14px; line-height: 1.7; margin: 8px 0; }
.ds-service-card__duration { font-size: 11px; letter-spacing: .08em; opacity: .65; display: block; margin-top: 8px; }

/* ProfessionalCard */
.ds-professional-card__image-container { aspect-ratio: 4 / 3; background: var(--theme-surface); border: 1px solid currentColor; display: grid; place-items: center; overflow: hidden; position: relative; }
.ds-professional-card__initials { opacity: .16; font-size: clamp(4rem, 9vw, 8rem); font-family: var(--theme-heading-font); }
.ds-professional-card__index { position: absolute; bottom: 14px; left: 16px; font-size: 10px; letter-spacing: .12em; }
.ds-professional-card__title { font-size: 22px; font-family: var(--theme-heading-font); font-weight: 400; margin-bottom: 8px; margin-top: 16px; }
.ds-professional-card__specialty { font-size: 13px; opacity: .7; margin-top: 0; }

/* ThemeSection */
.ds-theme-section { padding: var(--theme-space) 0; }

/* TestimonialCard */
.ds-testimonial-card { padding: 24px; border: 1px solid currentColor; border-radius: var(--theme-radius); display: flex; flex-direction: column; gap: 12px; }
.ds-testimonial-card--featured { background: var(--theme-accent); color: var(--theme-surface); border: none; padding: 32px; }
.ds-testimonial-card__rating { color: var(--theme-accent); font-size: 1.2em; }
.ds-testimonial-card--featured .ds-testimonial-card__rating { color: var(--theme-surface); }
.ds-testimonial-card__quote { margin: 0; font-family: var(--theme-heading-font); font-size: 1.1em; line-height: 1.5; font-style: italic; }
.ds-testimonial-card--featured .ds-testimonial-card__quote { font-size: 1.4em; }
.ds-testimonial-card__author { font-size: 0.9em; font-weight: bold; font-style: normal; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }

/* FAQItem */
.ds-faq-item { border-bottom: 1px solid currentColor; }
.ds-faq-item__summary { padding: 20px 0; font-family: var(--theme-heading-font); font-size: 1.2rem; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; }
.ds-faq-item__summary::-webkit-details-marker { display: none; }
.ds-faq-item__chevron { transition: transform 0.3s ease; font-size: 0.8em; }
@media (prefers-reduced-motion: reduce) { .ds-faq-item__chevron { transition: none; } }
.ds-faq-item[open] .ds-faq-item__chevron { transform: rotate(180deg); }
.ds-faq-item__content { padding-bottom: 20px; opacity: 0.8; line-height: 1.6; }

/* StatsBlock */
.ds-stats-block { display: flex; flex-wrap: wrap; gap: 24px; justify-content: space-around; padding: 32px 0; }
.ds-stats-block__item { text-align: center; }
.ds-stats-block__value { font-family: var(--theme-heading-font); font-size: clamp(2.5rem, 5vw, 4rem); color: var(--theme-accent); line-height: 1; margin-bottom: 8px; }
.ds-stats-block__label { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; }

/* BusinessHours */
.ds-business-hours { width: 100%; border-collapse: collapse; font-size: 1rem; }
.ds-business-hours__row { border-bottom: 1px dashed currentColor; opacity: 0.8; }
.ds-business-hours__row:last-child { border-bottom: none; }
.ds-business-hours__row--highlight { opacity: 1; font-weight: bold; color: var(--theme-accent); }
.ds-business-hours__day { padding: 12px 0; text-align: left; }
.ds-business-hours__time { padding: 12px 0; text-align: right; }

/* SocialLinks */
.ds-social-links { display: flex; gap: 16px; flex-wrap: wrap; }
.ds-social-links__item { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; border: 1px solid currentColor; color: currentColor; transition: opacity 0.2s; }
.ds-social-links__item:hover, .ds-social-links__item:focus-visible { opacity: 0.7; }
@media (prefers-reduced-motion: reduce) { .ds-social-links__item { transition: none; } }

/* MapEmbed */
.ds-map-embed { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--theme-radius); overflow: hidden; background: var(--theme-surface); display: flex; align-items: center; justify-content: center; border: 1px solid currentColor; }
.ds-map-embed__iframe { width: 100%; height: 100%; border: none; }
.ds-map-embed--fallback { font-style: italic; opacity: 0.6; }

/* CTABanner */
.ds-cta-banner { padding: 48px 24px; text-align: center; border-radius: var(--theme-radius); display: flex; flex-direction: column; align-items: center; gap: 16px; }
.ds-cta-banner--solid { background: var(--theme-primary); color: var(--theme-surface); }
.ds-cta-banner--outlined { border: 2px solid currentColor; }
.ds-cta-banner--gradient { background: linear-gradient(135deg, var(--theme-primary), var(--theme-accent)); color: var(--theme-surface); }
.ds-cta-banner__title { font-family: var(--theme-heading-font); font-size: clamp(1.8rem, 4vw, 2.5rem); margin: 0; line-height: 1.2; }
.ds-cta-banner__subtitle { font-size: 1.1rem; opacity: 0.9; margin: 0; }
.ds-cta-banner__button { margin-top: 8px; display: inline-block; padding: 12px 24px; background: currentColor; color: var(--theme-surface); text-decoration: none; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; border-radius: var(--theme-radius); }
.ds-cta-banner--solid .ds-cta-banner__button { background: var(--theme-surface); color: var(--theme-primary); }
.ds-cta-banner--gradient .ds-cta-banner__button { background: var(--theme-surface); color: var(--theme-primary); }

/* Divider */
.ds-divider { margin: 40px auto; border: none; text-align: center; display: flex; justify-content: center; align-items: center; gap: 8px; }
.ds-divider--line { height: 1px; background: currentColor; opacity: 0.2; width: 100%; }
.ds-divider--dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.4; }
.ds-divider--ornament { opacity: 0.6; }

/* FeatureHighlight */
.ds-feature-highlight { padding: 24px; border: 1px solid currentColor; border-radius: var(--theme-radius); text-align: center; }
.ds-feature-highlight__icon { font-size: 2.5rem; margin-bottom: 16px; display: inline-block; }
.ds-feature-highlight__title { font-family: var(--theme-heading-font); font-size: 1.5rem; margin: 0 0 12px; }
.ds-feature-highlight__description { opacity: 0.8; line-height: 1.6; margin: 0; }
`;
