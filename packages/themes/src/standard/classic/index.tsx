import type { PublicSiteData } from "@platform/theme-engine";
import { defaultDesignTokens, ProfessionalCard, ServiceCard, SectionHeading, ThemeSection } from "@platform/design-system";
import { Container } from "@platform/ui";
import { BarberChairArt, SiteContact, SiteFooter, SiteNavigation, ThemeShell } from "../../shared";
import { BookingWidget } from "@platform/web-kit";

export const classicTokens = defaultDesignTokens;

export function ClassicTheme({ data }: { data: PublicSiteData }) {
  return <ThemeShell data={data} defaults={classicTokens} variant="classic"><div id="inicio" /><SiteNavigation data={data} />
    <main><ThemeSection><Container><div className="theme-grid"><div>
      <p className="eyebrow">Barbearia · {data.tenant.location.city}</p><h1 className="hero-heading">O seu estilo.<br /><em>Nosso cuidado.</em></h1>
      <p className="hero-copy">{data.tenant.description}</p><a href="#contato" className="hero-link">Conheça nosso espaço <span aria-hidden="true">↗</span></a>
    </div><div className="art-frame" style={{ borderRadius: "48% 48% 0 0" }}><BarberChairArt /><span className="art-note">Um espaço para ser você</span></div></div></Container></ThemeSection>
    {!!data.services?.length && <ThemeSection id="servicos" style={{ background: "var(--theme-surface)" }}><Container><div className="theme-grid" style={{ alignItems: "start" }}><SectionHeading label="Feito com cuidado" title="Cada detalhe faz a diferença." description="Conheça os serviços da nossa barbearia." /><div>{data.services.map(service => <ServiceCard key={service.id} {...service} />)}</div></div></Container></ThemeSection>}
    {!!data.professionals?.length && <ThemeSection id="equipe"><Container><SectionHeading label="Quem cuida de você" title="Talento com personalidade." /><div className="theme-grid-three">{data.professionals.map((professional, index) => <ProfessionalCard key={professional.id} {...professional} index={index} />)}</div></Container></ThemeSection>}
    <ThemeSection id="agendamento"><Container><SectionHeading label="Marque seu horário" title="Agende agora." /><BookingWidget locationId={data.tenant.location.id} services={data.services || []} professionals={data.professionals || []} /></Container></ThemeSection>
    <SiteContact data={data} /></main><SiteFooter data={data} /></ThemeShell>;
}
