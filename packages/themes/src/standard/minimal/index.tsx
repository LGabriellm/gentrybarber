import type { PublicSiteData } from "@platform/theme-engine";
import { resolveDesignTokens, ThemeSection, SectionHeading } from "@platform/design-system";
import { Container } from "@platform/ui";
import { SiteContact, SiteFooter, SiteNavigation, ThemeShell } from "../../shared";
import { BookingWidget } from "@platform/web-kit";
import { EditableSite } from '../../editable';

export const minimalTokens = resolveDesignTokens({
  primaryColor: "#1A1A1A",
  secondaryColor: "#757575",
  accentColor: "#1A1A1A",
  backgroundColor: "#FFFFFF",
  surfaceColor: "#F7F7F7",
  textColor: "#1A1A1A",
  fontHeading: "sans",
  fontBody: "sans",
  borderRadius: "none",
  buttonStyle: "solid",
  cardStyle: "minimal",
  spacingScale: "generous",
});

/** Clean, modern, content-first design. No decorative elements. */
export function MinimalTheme({ data }: { data: PublicSiteData }) {
  if (data.content) return <EditableSite data={data} defaults={minimalTokens} variant="classic" />;
  return <ThemeShell data={data} defaults={minimalTokens} variant="classic"><div id="inicio" /><SiteNavigation data={data} />
    <main>
      <ThemeSection><Container>
        <div style={{ maxWidth: 860, paddingTop: "2rem" }}>
          <h1 style={{ fontFamily: "var(--theme-heading-font)", fontSize: "clamp(3rem, 6vw, 5.5rem)", lineHeight: 1.08, letterSpacing: "-.04em", fontWeight: 600, margin: "0 0 24px", textTransform: "uppercase" }}>{data.tenant.name}</h1>
          <p style={{ fontSize: 18, lineHeight: 1.8, maxWidth: 540, opacity: .7 }}>{data.tenant.description}</p>
          <a href="#contato" style={{ display: "inline-flex", alignItems: "center", gap: 12, marginTop: 32, padding: "14px 28px", background: "var(--theme-primary)", color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>Visite-nos <span aria-hidden="true">→</span></a>
        </div>
      </Container></ThemeSection>

      {!!data.services?.length && <ThemeSection id="servicos" style={{ borderTop: "1px solid #E5E5E5" }}><Container>
        <SectionHeading label="Serviços" title="O que fazemos." />
        <div style={{ display: "grid", gap: 0 }}>
          {data.services.map(service => <article key={service.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 20, padding: "24px 0", borderBottom: "1px solid #E5E5E5" }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>{service.name}</h3>
              {service.description && <p style={{ fontSize: 14, opacity: .6, margin: "6px 0 0" }}>{service.description}</p>}
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              {service.priceLabel && <span style={{ fontSize: 20, fontWeight: 600 }}>{service.priceLabel}</span>}
              {service.durationMinutes !== undefined && <span style={{ display: "block", fontSize: 11, opacity: .5, marginTop: 4 }}>{service.durationMinutes} min</span>}
            </div>
          </article>)}
        </div>
      </Container></ThemeSection>}

      {!!data.professionals?.length && <ThemeSection id="equipe"><Container>
        <SectionHeading label="Equipe" title="Quem faz acontecer." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 48 }}>
          {data.professionals.map((person, index) => <article key={person.id}>
            <span style={{ fontSize: 11, opacity: .4, letterSpacing: ".1em" }}>0{index + 1}</span>
            <h3 style={{ fontSize: 24, fontWeight: 500, margin: "8px 0 4px" }}>{person.name}</h3>
            {person.specialty && <p style={{ fontSize: 14, opacity: .6, margin: 0 }}>{person.specialty}</p>}
          </article>)}
        </div>
      </Container></ThemeSection>}

      <ThemeSection id="agendamento" style={{ borderTop: "1px solid #E5E5E5" }}><Container>
        <SectionHeading label="Agendar" title="Marque seu horário." />
        <BookingWidget locationId={data.tenant.location.id} timezone={data.tenant.location.timezone} services={data.services || []} professionals={data.professionals || []} preview={data.preview} />
      </Container></ThemeSection>

      <SiteContact data={data} />
    </main>
    <SiteFooter data={data} />
  </ThemeShell>;
}
