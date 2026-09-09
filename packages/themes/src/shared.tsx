import type { CSSProperties, ReactNode } from "react";
import { tokensToCssVariables, resolveDesignTokens, type DesignTokens } from "@platform/design-system";
import type { PublicSiteData } from "@platform/theme-engine";
import { Container } from "@platform/ui";

const css = `
.theme-site{background:var(--theme-background);color:var(--theme-text);font-family:var(--theme-body-font);line-height:1.5;overflow:hidden}
.theme-site *{box-sizing:border-box}.theme-site a{color:inherit;text-decoration:none}.theme-site a:focus-visible{outline:3px solid var(--theme-accent);outline-offset:6px}
.theme-site .site-nav{min-height:94px;display:flex;align-items:center;justify-content:space-between;gap:28px;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent)}
.theme-site .site-brand{font-family:var(--theme-heading-font);font-size:22px;line-height:1.1;max-width:300px}.theme-site .site-links{display:flex;gap:30px;font-size:12px;letter-spacing:.025em;align-items:center}
.theme-site .site-links a:hover{color:var(--theme-accent)}.theme-site .site-contact-link{border-bottom:1px solid currentColor;padding-bottom:3px}
.theme-site .theme-grid{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:center}.theme-site .theme-grid-three{display:grid;grid-template-columns:repeat(3,1fr);gap:30px}
.theme-site .eyebrow{font-size:10px;text-transform:uppercase;font-weight:700;letter-spacing:.2em;display:flex;align-items:center;gap:12px}.theme-site .eyebrow:before{content:'';display:block;width:28px;height:1px;background:currentColor}
.theme-site .hero-heading{font-family:var(--theme-heading-font);font-size:clamp(3.3rem,6.7vw,6.5rem);line-height:1.02;letter-spacing:-.045em;font-weight:400;margin:32px 0 26px;overflow-wrap:anywhere}
.theme-site .hero-copy{max-width:460px;font-size:15px;line-height:1.9;opacity:.75}.theme-site .hero-link{display:inline-flex;align-items:center;gap:36px;margin-top:30px;padding:17px 24px;background:var(--theme-primary);color:var(--theme-background);font-size:12px;letter-spacing:.06em;border-radius:var(--theme-radius)}
.theme-site .hero-link:hover{opacity:.88}.theme-site .art-frame{position:relative;min-height:480px;display:flex;align-items:center;justify-content:center;background:var(--theme-primary);color:var(--theme-background);overflow:hidden}
.theme-site .art-frame svg{position:relative;width:100%;height:100%;max-height:560px}.theme-site .art-note{position:absolute;bottom:24px;left:28px;font-size:9px;letter-spacing:.15em;text-transform:uppercase}
.theme-site .section-rule{border-top:1px solid color-mix(in srgb,currentColor 20%,transparent)}.theme-site .site-footer{display:flex;justify-content:space-between;gap:32px;padding:30px 0;border-top:1px solid color-mix(in srgb,currentColor 20%,transparent);font-size:10px;letter-spacing:.08em}
.theme-site .contact-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:36px}.theme-site address{font-style:normal;font-size:14px;line-height:1.9}.theme-site .small-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;opacity:.6;margin:0 0 16px}
.theme-urban .site-nav{min-height:88px;border-bottom:1px solid #44443F}.theme-urban .site-brand{text-transform:uppercase;font-family:Impact,'Arial Narrow',sans-serif;font-size:30px;letter-spacing:.025em}
.theme-urban .hero-heading{text-transform:uppercase;line-height:.88;letter-spacing:-.015em;font-weight:400;font-size:clamp(4.2rem,9.8vw,9rem);margin:30px 0}.theme-urban .urban-strip{background:var(--theme-accent);color:#181A18;padding:18px 24px;font-size:12px;font-weight:700;letter-spacing:.18em;display:flex;gap:42px;justify-content:center;flex-wrap:wrap}
.theme-urban .hero-link{color:#181A18;background:var(--theme-accent);font-weight:700;text-transform:uppercase}.theme-urban .art-frame{background:var(--theme-accent);color:#1D201D;min-height:440px;transform:rotate(3deg)}
.theme-imperial .site-nav{border-color:#807453;justify-content:center;position:relative}.theme-imperial .site-brand{font-size:17px;letter-spacing:.16em;text-transform:uppercase;text-align:center}.theme-imperial .site-links{position:absolute;right:0;font-size:10px}
.theme-imperial .imperial-hero{text-align:center;position:relative;padding:85px 0 96px}.theme-imperial .hero-heading{max-width:950px;margin:24px auto 28px;font-size:clamp(3.2rem,7vw,6.8rem);letter-spacing:-.035em}.theme-imperial .hero-copy{margin-inline:auto}.theme-imperial .eyebrow{justify-content:center;color:var(--theme-accent)}
.theme-imperial .hero-link{background:transparent;color:var(--theme-accent);border:1px solid var(--theme-accent);text-transform:uppercase;font-size:10px;letter-spacing:.18em}.theme-imperial .imperial-frame{border:1px solid #75613C;padding:28px;position:relative}.theme-imperial .imperial-frame:before{content:'';position:absolute;inset:9px;border:1px solid #4B402E;pointer-events:none}
@media(max-width:800px){.theme-site .theme-grid{grid-template-columns:1fr;gap:38px}.theme-site .theme-grid-three{grid-template-columns:repeat(2,1fr);gap:24px}.theme-site .contact-grid{grid-template-columns:1fr 1fr}.theme-site .art-frame{min-height:360px}.theme-site .site-links{gap:18px}.theme-imperial .site-links{position:static}.theme-imperial .site-nav{justify-content:space-between}.theme-imperial .imperial-hero{padding:60px 0}.theme-site .hero-heading{overflow-wrap:normal}}
@media(max-width:480px){.theme-site .site-nav{min-height:82px;align-items:flex-start;flex-direction:column;padding:20px 0;gap:20px}.theme-site .site-brand{font-size:23px}.theme-site .theme-grid-three,.theme-site .contact-grid{grid-template-columns:1fr}.theme-site .site-footer{flex-direction:column;gap:12px}.theme-site .site-links{gap:22px;font-size:11px}.theme-site .art-frame{min-height:300px}.theme-site .hero-heading{font-size:3.4rem}.theme-urban .hero-heading{font-size:4.3rem}.theme-imperial .site-nav{align-items:center}.theme-imperial .imperial-frame{padding:20px}.theme-site .hero-link{margin-top:16px}}
@media(prefers-reduced-motion:reduce){.theme-site *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
`;

export function ThemeShell({ data, defaults, variant, children }: { data: PublicSiteData; defaults: DesignTokens; variant: "classic" | "urban" | "imperial"; children: ReactNode }) {
  const tokens = resolveDesignTokens(data.tokens ?? {}, defaults);
  return <div className={`theme-site theme-${variant}`} data-theme={variant} style={tokensToCssVariables(tokens) as CSSProperties}>
    <style>{css}</style>{children}
  </div>;
}

export function SiteNavigation({ data }: { data: PublicSiteData }) {
  return <Container><header className="site-nav"><a className="site-brand" href="#inicio">{data.tenant.name}</a><nav className="site-links" aria-label="Navegação do site">
    {!!data.services?.length && <a href="#servicos">Serviços</a>}
    {!!data.professionals?.length && <a href="#equipe">Equipe</a>}
    <a href="#contato" className="site-contact-link">Visite-nos ↗</a>
  </nav></header></Container>;
}

export function SiteContact({ data }: { data: PublicSiteData }) {
  const { tenant } = data;
  const phone = tenant.contact.phone?.replace(/[^0-9+]/g, "");
  return <section id="contato" className="section-rule" style={{ padding: "var(--theme-space) 0" }}><Container><div className="contact-grid">
    <div><p className="small-label">Esperamos você</p><h2 style={{ fontFamily: "var(--theme-heading-font)", fontWeight: 400, fontSize: 32, lineHeight: 1.2, margin: 0 }}>{tenant.name}</h2></div>
    <div><p className="small-label">Onde estamos</p><address>{tenant.location.address}<br />{tenant.location.city} · {tenant.location.state}</address></div>
    <div><p className="small-label">Contato</p>{phone && <p style={{ margin: "0 0 8px", fontSize: 14 }}><a href={`tel:${phone}`}>{tenant.contact.phone}</a></p>}{tenant.contact.email && <a style={{ fontSize: 13, overflowWrap: "anywhere" }} href={`mailto:${encodeURIComponent(tenant.contact.email)}`}>{tenant.contact.email}</a>}{!phone && !tenant.contact.email && <p style={{ fontSize: 14 }}>Conheça nosso espaço.</p>}</div>
  </div></Container></section>;
}

export function SiteFooter({ data }: { data: PublicSiteData }) {
  return <Container><footer className="site-footer"><span>{data.tenant.name}</span><span>{data.tenant.location.city}, {data.tenant.location.state}</span><a href="#inicio">Voltar ao início ↑</a></footer></Container>;
}

export function BarberChairArt() {
  return <svg viewBox="0 0 480 560" role="img" aria-label="Ilustração de uma cadeira de barbearia em um espaço com arquitetura em arco">
    <defs><pattern id="chair-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="currentColor" strokeOpacity=".04" /></pattern></defs>
    <rect width="480" height="560" fill="url(#chair-grid)" />
    <path d="M74 470V227a166 166 0 0 1 332 0v243" stroke="currentColor" opacity=".24" fill="none" />
    <path d="M95 470V227a145 145 0 0 1 290 0v243" stroke="currentColor" opacity=".1" fill="none" />
    <ellipse cx="242" cy="466" rx="134" ry="18" fill="currentColor" opacity=".06" />
    <path d="M178 171q60-17 122 0l-7 142q-57 24-108 0Z" fill="currentColor" opacity=".86" />
    <path d="M186 180q52-13 105 0l-6 124q-50 18-90 0Z" fill="var(--theme-primary)" opacity=".86" />
    <path d="M197 196v95m22-99v104m23-106v108m23-106v104m17-100v95" stroke="currentColor" opacity=".22" />
    <rect x="209" y="143" width="62" height="24" rx="8" fill="currentColor" opacity=".86" />
    <path d="M158 321q83-27 164 0v24q-83 17-164 0Z" fill="currentColor" opacity=".86" />
    <path d="M151 313v-57h29m150 57v-57h-29" stroke="currentColor" strokeWidth="8" fill="none" />
    <path d="M147 256h39m111 0h38" stroke="currentColor" strokeWidth="12" />
    <path d="M232 355v77m17-77v77" stroke="currentColor" strokeWidth="6" />
    <ellipse cx="241" cy="444" rx="71" ry="13" fill="currentColor" opacity=".82" />
    <path d="M242 410h42v-25h41" stroke="currentColor" strokeWidth="6" fill="none" />
    <path d="M195 350v36h-28l-13 34h71" stroke="currentColor" strokeWidth="7" fill="none" />
    <path d="M83 486h314" stroke="currentColor" opacity=".24" />
  </svg>;
}

export function ScissorsArt() {
  return <svg viewBox="0 0 450 500" role="img" aria-label="Ilustração gráfica de uma tesoura de barbeiro">
    <circle cx="225" cy="248" r="164" fill="none" stroke="currentColor" strokeWidth="1" opacity=".2" />
    <circle cx="225" cy="248" r="145" fill="none" stroke="currentColor" strokeWidth="1" opacity=".1" />
    <g transform="rotate(-20 225 260)" fill="none" stroke="currentColor" strokeWidth="18"><ellipse cx="159" cy="347" rx="40" ry="47" /><ellipse cx="290" cy="347" rx="40" ry="47" /><path d="m183 310 103-195q14-21 17-30l-51 167-1 45m16 13L164 115q-14-21-17-30l51 167 1 45" strokeLinejoin="round" /></g>
    <circle cx="225" cy="256" r="6" fill="var(--theme-accent)" />
    <path d="M48 62h36M66 44v36m300 337h36m-18-18v36" stroke="currentColor" strokeWidth="2" />
    <text x="37" y="458" fill="currentColor" fontFamily="Arial, sans-serif" fontSize="10" letterSpacing="3">CORTE. EXPRESSÃO. IDENTIDADE.</text>
  </svg>;
}

export function ImperialMark() {
  return <svg width="78" height="72" viewBox="0 0 78 72" fill="none" aria-hidden="true"><path d="M15 45 9 20l20 13 10-23 10 23 20-13-6 25H15Zm0 7h48M19 59h40" stroke="currentColor" strokeWidth="1.5" /><circle cx="9" cy="17" r="3" stroke="currentColor" /><circle cx="39" cy="7" r="3" stroke="currentColor" /><circle cx="69" cy="17" r="3" stroke="currentColor" /></svg>;
}
