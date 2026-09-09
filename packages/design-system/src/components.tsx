import type { CSSProperties, ReactNode } from "react";

export function SectionHeading({ label, title, description, inverse = false }: { label: string; title: string; description?: string; inverse?: boolean }) {
  return <div style={{ maxWidth: 620, marginBottom: 36, color: inverse ? "#FFFFFF" : "inherit" }}>
    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".18em", margin: "0 0 16px", color: "var(--theme-accent)" }}>{label}</p>
    <h2 style={{ fontFamily: "var(--theme-heading-font)", fontSize: "clamp(2rem, 4vw, 3.4rem)", fontWeight: 400, lineHeight: 1.08, margin: 0 }}>{title}</h2>
    {description && <p style={{ fontSize: 15, lineHeight: 1.7, opacity: .75, marginTop: 20 }}>{description}</p>}
  </div>;
}

export function ServiceCard({ name, description, priceLabel, durationMinutes, variant = "minimal" }: {
  name: string; description?: string; priceLabel?: string; durationMinutes?: number; variant?: "minimal" | "bordered" | "editorial";
}) {
  const styles: Record<string, CSSProperties> = {
    minimal: { padding: "24px 0", borderBottom: "1px solid currentColor" },
    bordered: { padding: 28, border: "1px solid currentColor", borderRadius: "var(--theme-radius)" },
    editorial: { padding: "24px 0", borderTop: "1px solid currentColor" },
  };
  return <article style={styles[variant]}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20 }}>
      <h3 style={{ fontFamily: "var(--theme-heading-font)", fontSize: 24, fontWeight: 400, margin: 0 }}>{name}</h3>
      {priceLabel && <span style={{ whiteSpace: "nowrap", fontSize: 14 }}>{priceLabel}</span>}
    </div>
    {description && <p style={{ opacity: .7, fontSize: 14, lineHeight: 1.7 }}>{description}</p>}
    {durationMinutes !== undefined && <span style={{ fontSize: 11, letterSpacing: ".08em", opacity: .65 }}>{durationMinutes} MIN</span>}
  </article>;
}

export function ProfessionalCard({ name, specialty, index = 0 }: { name: string; specialty?: string; index?: number }) {
  return <article>
    <div aria-hidden="true" style={{ aspectRatio: "4 / 3", background: "var(--theme-surface)", border: "1px solid currentColor", display: "grid", placeItems: "center", overflow: "hidden", position: "relative" }}>
      <span style={{ opacity: .16, fontSize: "clamp(4rem, 9vw, 8rem)", fontFamily: "var(--theme-heading-font)" }}>{name.split(" ").slice(0, 2).map(part => part[0]).join("")}</span>
      <span style={{ position: "absolute", bottom: 14, left: 16, fontSize: 10, letterSpacing: ".12em" }}>0{index + 1}</span>
    </div>
    <h3 style={{ fontSize: 22, fontFamily: "var(--theme-heading-font)", fontWeight: 400, marginBottom: 8 }}>{name}</h3>
    {specialty && <p style={{ fontSize: 13, opacity: .7, marginTop: 0 }}>{specialty}</p>}
  </article>;
}

export function ThemeSection({ id, children, style }: { id?: string; children: ReactNode; style?: CSSProperties }) {
  return <section id={id} style={{ padding: "var(--theme-space) 0", ...style }}>{children}</section>;
}
