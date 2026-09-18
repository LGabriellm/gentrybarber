import type React from "react";
import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

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

const buttonStyles = {
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: "inherit",
    lineHeight: 1.4,
    boxSizing: "border-box" as const,
    outline: "3px solid transparent",
    outlineOffset: 2,
    transition: "outline-color 0.15s ease",
  },
  variants: {
    primary: {
      background: "#214f3c",
      color: "#ffffff",
      border: "1px solid #214f3c",
    },
    secondary: {
      background: "#e5eee6",
      color: "#214f3c",
      border: "1px solid transparent",
    },
    outline: {
      background: "transparent",
      color: "#214f3c",
      border: "1px solid #214f3c",
    },
    ghost: {
      background: "transparent",
      color: "#214f3c",
      border: "none",
    },
  },
  sizes: {
    sm: { padding: "8px 14px", fontSize: 13 },
    md: { padding: "12px 20px", fontSize: 14 },
    lg: { padding: "16px 28px", fontSize: 15 },
  },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style">) {
  const combinedStyle: CSSProperties = {
    ...buttonStyles.base,
    ...buttonStyles.sizes[size],
    ...buttonStyles.variants[variant],
  };

  const handleFocus = (e: React.FocusEvent<HTMLButtonElement & HTMLAnchorElement>) => {
    if (typeof e.currentTarget.matches === "function" && e.currentTarget.matches(":focus-visible")) {
      e.currentTarget.style.outline = "3px solid #214f3c";
      e.currentTarget.style.outlineOffset = "2px";
    }
    props.onFocus?.(e as React.FocusEvent<HTMLButtonElement>);
  };

  const handleBlur = (e: React.FocusEvent<HTMLButtonElement & HTMLAnchorElement>) => {
    e.currentTarget.style.outline = "3px solid transparent";
    e.currentTarget.style.outlineOffset = "2px";
    props.onBlur?.(e as React.FocusEvent<HTMLButtonElement>);
  };

  if (href) {
    return (
      <a
        href={href}
        style={combinedStyle}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...(props as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type={props.type || "button"}
      style={combinedStyle}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...props}
    >
      {children}
    </button>
  );
}

export function Stack({
  children,
  direction = "column",
  gap = 16,
  align,
  justify,
  style,
}: {
  children: ReactNode;
  direction?: "row" | "column";
  gap?: number;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        gap,
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Grid({
  children,
  columns: _columns = 3,
  gap = 24,
  minWidth = 280,
  style,
}: {
  children: ReactNode;
  columns?: number;
  gap?: number;
  minWidth?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function VisuallyHidden({
  children,
  as: Component = "span",
}: {
  children: ReactNode;
  as?: "span" | "div";
}) {
  return <Component style={visuallyHiddenStyle}>{children}</Component>;
}
