import { z } from "zod";

/** Only a finite vocabulary and opaque hexadecimal colors can reach CSS. */
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor hexadecimal de seis dígitos.");

export const designTokensSchema = z.object({
  primaryColor: color,
  secondaryColor: color,
  accentColor: color,
  backgroundColor: color,
  surfaceColor: color,
  textColor: color,
  fontHeading: z.enum(["serif", "sans", "display"]),
  fontBody: z.enum(["sans", "serif"]),
  borderRadius: z.enum(["none", "subtle", "rounded"]),
  buttonStyle: z.enum(["solid", "outline"]),
  cardStyle: z.enum(["minimal", "bordered", "elevated"]),
  spacingScale: z.enum(["compact", "comfortable", "generous"]),
  animationPreset: z.enum(["none", "subtle"]),
}).strict();

export const designTokenOverridesSchema = designTokensSchema.partial().strict();
export type DesignTokens = Readonly<z.infer<typeof designTokensSchema>>;
export type DesignTokenOverrides = Readonly<z.infer<typeof designTokenOverridesSchema>>;

export const defaultDesignTokens: DesignTokens = Object.freeze({
  primaryColor: "#374D40", secondaryColor: "#6A746B", accentColor: "#BC8B5C",
  backgroundColor: "#F7F5EE", surfaceColor: "#FFFFFF", textColor: "#263B30",
  fontHeading: "serif", fontBody: "sans", borderRadius: "subtle",
  buttonStyle: "solid", cardStyle: "minimal", spacingScale: "comfortable", animationPreset: "none",
});

export function resolveDesignTokens(overrides: unknown = {}, base: DesignTokens = defaultDesignTokens): DesignTokens {
  return Object.freeze(designTokensSchema.parse({ ...designTokensSchema.parse(base), ...designTokenOverridesSchema.parse(overrides) }));
}

export const fontFamilies = Object.freeze({
  serif: "Georgia, 'Times New Roman', serif",
  sans: "Arial, Helvetica, sans-serif",
  display: "Impact, 'Arial Narrow', sans-serif",
});

export function colorContrast(first: string, second: string): number {
  function luminance(hex: string) {
    const channels = color.parse(hex).slice(1).match(/../g)!.map(part => {
      const value = parseInt(part, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
  }
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

export function tokensToCssVariables(tokens: DesignTokens) {
  const safe = designTokensSchema.parse(tokens);
  return {
    "--theme-primary": safe.primaryColor,
    "--theme-secondary": safe.secondaryColor,
    "--theme-accent": safe.accentColor,
    "--theme-background": safe.backgroundColor,
    "--theme-surface": safe.surfaceColor,
    "--theme-text": safe.textColor,
    "--theme-on-primary": colorContrast(safe.primaryColor, '#FFFFFF') >= colorContrast(safe.primaryColor, '#000000') ? '#FFFFFF' : '#000000',
    "--theme-heading-font": fontFamilies[safe.fontHeading],
    "--theme-body-font": fontFamilies[safe.fontBody],
    "--theme-radius": { none: "0", subtle: "6px", rounded: "22px" }[safe.borderRadius],
    "--theme-space": { compact: "3rem", comfortable: "5rem", generous: "7rem" }[safe.spacingScale],
  };
}
