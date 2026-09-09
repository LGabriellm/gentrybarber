import type { CSSProperties, ReactNode } from "react";

export function Container({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ width: "min(1180px, calc(100% - 48px))", marginInline: "auto", ...style }}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" }) {
  const colors = { neutral: ["#EEF0EC", "#4D584F"], success: ["#E9F3EA", "#2C603A"], warning: ["#FBF2DD", "#715816"] };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "5px 9px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: colors[tone][0], color: colors[tone][1] }}>{children}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div style={{ padding: "36px 24px", textAlign: "center", border: "1px dashed #D4DAD4", borderRadius: 8 }}>
    <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>{title}</h3>
    <p style={{ fontSize: 14, color: "#647067", lineHeight: 1.6, margin: 0 }}>{description}</p>
  </div>;
}
