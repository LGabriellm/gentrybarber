import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeRegistry, type PublicSiteData } from "@platform/theme-engine";
import { ClassicTheme, ImperialTheme, UrbanTheme, classicTokens, demoSites, resolvePublicTheme, themeRegistry } from "../src";

describe("tenant presentation resolution", () => {
  it("resolves tenant A and tenant B independently", () => {
    const a = resolvePublicTheme({ tenantId: "tenant-a", themeId: "classic", allowedThemeIds: ["classic"], features: [] });
    const b = resolvePublicTheme({ tenantId: "tenant-studio", themeId: "urban", allowedThemeIds: ["urban"], features: [] });
    expect(a.Renderer).toBe(ClassicTheme);
    expect(b.Renderer).toBe(UrbanTheme);
    expect(a.id).toBe("classic");
    expect(() => resolvePublicTheme({ tenantId: "tenant-a", themeId: "urban", allowedThemeIds: ["classic"], features: [] })).toThrow("THEME_NOT_ALLOWED");
  });

  it("loads bespoke renderer only with feature and assignment to its owner", () => {
    const permitted = { tenantId: "tenant-imperial", themeId: "bespoke-imperial", allowedThemeIds: ["bespoke-imperial"], features: ["custom_design"] };
    expect(resolvePublicTheme(permitted).Renderer).toBe(ImperialTheme);
    expect(() => resolvePublicTheme({ ...permitted, features: [] })).toThrow("MISSING_FEATURE");
    expect(() => resolvePublicTheme({ ...permitted, tenantId: "tenant-studio" })).toThrow("THEME_NOT_ALLOWED");
  });

  it("fails closed for unavailable themes and duplicate registry entries", () => {
    expect(() => resolvePublicTheme({ tenantId: "tenant-a", themeId: "../database", allowedThemeIds: ["../database"], features: [] })).toThrow("THEME_NOT_FOUND");
    const definition = themeRegistry.get("classic")!;
    expect(() => new ThemeRegistry([definition, definition])).toThrow("DUPLICATE_THEME_ID");
    expect(() => resolvePublicTheme({ tenantId: "", themeId: "classic", allowedThemeIds: ["classic"], features: [] })).toThrow("INVALID_TENANT");
  });

  it("renders distinct compositions with shared public data and real anchor navigation", () => {
    const classic = renderToStaticMarkup(<ClassicTheme data={demoSites.classic} />);
    const urban = renderToStaticMarkup(<UrbanTheme data={demoSites.urban} />);
    const imperial = renderToStaticMarkup(<ImperialTheme data={demoSites.imperial} />);
    expect(classic).toContain('data-theme="classic"');
    expect(urban).toContain('data-theme="urban"');
    expect(imperial).toContain('data-theme="imperial"');
    expect(classic).toContain("Casa do Barbeiro");
    expect(urban).not.toContain("Casa do Barbeiro");
    expect(imperial).toContain("Imperial Barbearia");
    expect(imperial).toContain('href="#contato"');
    expect(imperial).not.toContain("Agendar");
  });

  it("escapes tenant text, rejects token injection, and never changes another tenant's palette", () => {
    const hostile: PublicSiteData = { ...demoSites.classic, tenant: { ...demoSites.classic.tenant, name: "<script>alert('x')</script>" }, tokens: { accentColor: "#112233" } };
    const output = renderToStaticMarkup(<ClassicTheme data={hostile} />);
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>");
    expect(classicTokens.accentColor).toBe("#BC8B5C");
    expect(themeRegistry.get("classic")?.tokens.accentColor).toBe("#BC8B5C");
    const injected = { ...hostile, tokens: { accentColor: "red;display:none" } } as PublicSiteData;
    expect(() => renderToStaticMarkup(<ClassicTheme data={injected} />)).toThrow();
  });
});
