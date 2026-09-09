import { resolveDesignTokens } from "@platform/design-system";
import type { ThemeAccessContext, ThemeDefinition } from "./types";

export class ThemeResolutionError extends Error {
  constructor(public readonly code: "THEME_NOT_FOUND" | "THEME_NOT_ALLOWED" | "MISSING_FEATURE" | "INVALID_TENANT") {
    super(code);
    this.name = "ThemeResolutionError";
  }
}

/** Renderers come from reviewed source code; IDs never become dynamic import paths. */
export class ThemeRegistry {
  readonly #themes = new Map<string, ThemeDefinition>();

  constructor(definitions: readonly ThemeDefinition[] = []) {
    definitions.forEach(definition => this.register(definition));
  }

  register(definition: ThemeDefinition): this {
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(definition.id)) throw new Error("INVALID_THEME_ID");
    if (this.#themes.has(definition.id)) throw new Error("DUPLICATE_THEME_ID");
    if (typeof definition.Renderer !== "function") throw new Error("INVALID_THEME_RENDERER");
    this.#themes.set(definition.id, Object.freeze({ ...definition,
      tokens: resolveDesignTokens({}, definition.tokens),
      capabilities: Object.freeze([...definition.capabilities]),
      requiredFeatures: Object.freeze([...definition.requiredFeatures]),
      ...(definition.allowedTenantIds ? { allowedTenantIds: Object.freeze([...definition.allowedTenantIds]) } : {}),
    }));
    return this;
  }

  get(id: string): ThemeDefinition | undefined { return this.#themes.get(id); }
  list(): readonly ThemeDefinition[] { return Object.freeze([...this.#themes.values()]); }

  resolve(context: ThemeAccessContext): ThemeDefinition {
    if (!context.tenantId.trim()) throw new ThemeResolutionError("INVALID_TENANT");
    const definition = this.get(context.themeId);
    if (!definition) throw new ThemeResolutionError("THEME_NOT_FOUND");
    if (!context.allowedThemeIds.includes(definition.id)) throw new ThemeResolutionError("THEME_NOT_ALLOWED");
    if (definition.allowedTenantIds && !definition.allowedTenantIds.includes(context.tenantId)) throw new ThemeResolutionError("THEME_NOT_ALLOWED");
    if (definition.requiredFeatures.some(feature => !context.features.includes(feature))) {
      throw new ThemeResolutionError("MISSING_FEATURE");
    }
    return definition;
  }
}
