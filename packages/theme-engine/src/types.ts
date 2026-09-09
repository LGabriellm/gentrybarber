import type { ComponentType } from "react";
import type { DesignTokenOverrides, DesignTokens } from "@platform/design-system";

/** A serializable, explicitly public projection. Never pass a database entity here. */
export interface PublicSiteData {
  readonly tenant: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
    readonly description: string;
    readonly contact: { readonly phone?: string; readonly email?: string };
    readonly location: { readonly id: string; readonly address: string; readonly city: string; readonly state: string };
  };
  readonly services?: readonly {
    readonly id: string; readonly name: string; readonly description?: string;
    readonly priceLabel?: string; readonly durationMinutes?: number;
  }[];
  readonly professionals?: readonly { readonly id: string; readonly name: string; readonly specialty?: string }[];
  readonly tokens?: DesignTokenOverrides;
}

export type ThemeRenderer = ComponentType<{ readonly data: PublicSiteData }>;
export type ThemeKind = "TEMPLATE" | "ADVANCED" | "BESPOKE";
export type ThemeCapability = "colors" | "typography" | "services" | "professionals" | "bespoke";

export interface ThemeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: ThemeKind;
  readonly Renderer: ThemeRenderer;
  readonly tokens: DesignTokens;
  readonly capabilities: readonly ThemeCapability[];
  readonly requiredFeatures: readonly string[];
  readonly allowedTenantIds?: readonly string[];
}

/** Supplied by trusted application code after tenant and entitlement resolution. */
export interface ThemeAccessContext {
  readonly tenantId: string;
  readonly themeId: string;
  readonly allowedThemeIds: readonly string[];
  readonly features: readonly string[];
}
