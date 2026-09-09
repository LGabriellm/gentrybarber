import { describe, expect, it } from "vitest";
import { defaultDesignTokens, resolveDesignTokens, tokensToCssVariables } from "../src";

describe("controlled design tokens", () => {
  it("accepts known settings without changing shared defaults", () => {
    const custom = resolveDesignTokens({ accentColor: "#F07B41", fontHeading: "sans" });
    expect(custom.accentColor).toBe("#F07B41");
    expect(defaultDesignTokens.accentColor).toBe("#BC8B5C");
    expect(Object.isFrozen(custom)).toBe(true);
  });

  it.each([
    { primaryColor: "red; background: url(https://tracker.test)" },
    { primaryColor: "#FFF" },
    { fontBody: "url(https://tracker.test/font)" },
    { animationPreset: "custom-javascript" },
    { customCss: "body { display: none }" },
    { customJavascript: "alert(1)" },
    { borderRadius: "99999px" },
  ])("rejects unsafe or unsupported customization %j", input => {
    expect(() => resolveDesignTokens(input)).toThrow();
  });

  it("maps controlled values to CSS without copying unknown properties", () => {
    const css = tokensToCssVariables(resolveDesignTokens({ borderRadius: "rounded", spacingScale: "compact" }));
    expect(css["--theme-radius"]).toBe("22px");
    expect(css["--theme-space"]).toBe("3rem");
    expect(css["--theme-body-font"]).toBe("Arial, Helvetica, sans-serif");
  });
});
