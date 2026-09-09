import type { PublicSiteData } from "@platform/theme-engine";
import { resolveDesignTokens, ProfessionalCard, ServiceCard, SectionHeading, ThemeSection } from "@platform/design-system";
import { Container } from "@platform/ui";
import { ScissorsArt, SiteContact, SiteFooter, SiteNavigation, ThemeShell } from "../../shared";

import { BookingWidget } from "@platform/web-kit";

export const urbanTokens = resolveDesignTokens({ primaryColor: "#F16B3E", secondaryColor: "#9BA098", accentColor: "#F16B3E", backgroundColor: "#1C201D", surfaceColor: "#262C27", textColor: "#F1F1E8", fontHeading: "display", borderRadius: "none" });

export function UrbanTheme({ data }: { data: PublicSiteData }) {
  return <ThemeShell data={data} defaults={urbanTokens} variant="urban"><div id="inicio" /><SiteNavigation data={data} /><main>
    <ThemeSection><Container><div className="theme-grid"><div><p className="eyebrow">{data.tenant.location.city} / {data.tenant.location.state}</p><h1 className="hero-heading">Seu corte.<br /><span style={{ color: "var(--theme-accent)" }}>Sua marca.</span></h1><p className="hero-copy">{data.tenant.description}</p><a href="#contato" className="hero-link">Encontre a gente <span aria-hidden="true">↗</span></a></div><div className="art-frame"><ScissorsArt /></div></div></Container></ThemeSection>
    <div className="urban-strip" aria-hidden="true"><span>ESTILO PRÓPRIO</span><span>✳</span><span>ATITUDE EM CADA DETALHE</span><span>✳</span><span>{data.tenant.name.toUpperCase()}</span></div>
    {!!data.services?.length && <ThemeSection id="servicos"><Container><SectionHeading label="Na régua" title="ESCOLHA O SEU ESTILO." /><div className="theme-grid-three">{data.services.map(service => <ServiceCard key={service.id} {...service} variant="editorial" />)}</div></Container></ThemeSection>}
    {!!data.professionals?.length && <ThemeSection id="equipe" style={{ background: "var(--theme-surface)" }}><Container><SectionHeading label="Nosso time" title="QUEM FAZ ACONTECER." /><div className="theme-grid-three">{data.professionals.map((professional, index) => <ProfessionalCard key={professional.id} {...professional} index={index} />)}</div></Container></ThemeSection>}
    <ThemeSection id="agendamento"><Container><SectionHeading label="Agendamento" title="MARQUE SEU HORÁRIO." /><BookingWidget locationId={data.tenant.location.id} services={data.services || []} professionals={data.professionals || []} /></Container></ThemeSection>
    <SiteContact data={data} /></main><SiteFooter data={data} /></ThemeShell>;
}
