import { describe, expect, it } from "vitest";
import { defaultDesignTokens } from "@platform/design-system";
import { appendThemeVersion, createThemeHistory, createThemeVersion, publishThemeVersion, rollbackThemeVersion, transitionThemeVersion, type ThemeVersion } from "../src";

function draft(tenantId: string, number = 1): ThemeVersion {
  return createThemeVersion({ id: `${tenantId}-v${number}`, tenantId, themeId: "classic", number, tokens: { ...defaultDesignTokens }, createdAt: "2026-09-04T12:00:00.000Z" });
}

function approve(version: ThemeVersion): ThemeVersion {
  let current = version;
  for (const next of ["DESIGN", "DEVELOPMENT", "REVIEW", "APPROVED"] as const) current = transitionThemeVersion(version.tenantId, current, next);
  return current;
}

describe("immutable tenant theme lifecycle", () => {
  it("walks the review and revision workflow while preserving prior snapshots", () => {
    const initial = draft("a");
    const design = transitionThemeVersion("a", initial, "DESIGN");
    const development = transitionThemeVersion("a", design, "DEVELOPMENT");
    const review = transitionThemeVersion("a", development, "REVIEW");
    const changes = transitionThemeVersion("a", review, "CHANGES_REQUESTED");
    expect(transitionThemeVersion("a", changes, "DEVELOPMENT").state).toBe("DEVELOPMENT");
    expect(initial.state).toBe("BRIEFING");
    expect(review.state).toBe("REVIEW");
    expect(() => transitionThemeVersion("a", initial, "APPROVED")).toThrow("INVALID_THEME_TRANSITION");
  });

  it("requires approval to publish and does not mutate approved snapshots", () => {
    const initial = draft("a");
    expect(() => publishThemeVersion("a", createThemeHistory("a", [initial]), initial.id, "2026-09-04T13:00:00.000Z")).toThrow("THEME_APPROVAL_REQUIRED");
    const approved = approve(initial);
    const history = createThemeHistory("a", [approved]);
    const published = publishThemeVersion("a", history, approved.id, "2026-09-04T13:00:00.000Z");
    expect(published.publishedVersionId).toBe(approved.id);
    expect(published.versions[0]?.state).toBe("PUBLISHED");
    expect(approved.state).toBe("APPROVED");
    expect(history.publishedVersionId).toBeNull();
    expect(() => transitionThemeVersion("a", published.versions[0]!, "DEVELOPMENT")).toThrow("INVALID_THEME_TRANSITION");
  });

  it("rolls back only to a previously published immutable tenant version", () => {
    const v1 = approve(draft("a"));
    const v2 = approve(draft("a", 2));
    const first = publishThemeVersion("a", createThemeHistory("a", [v1]), v1.id, "2026-09-04T13:00:00.000Z");
    const second = publishThemeVersion("a", appendThemeVersion("a", first, v2), v2.id, "2026-09-04T14:00:00.000Z");
    const restored = rollbackThemeVersion("a", second, v1.id);
    expect(restored.publishedVersionId).toBe(v1.id);
    expect(second.publishedVersionId).toBe(v2.id);
    expect(restored.versions).toEqual(second.versions);
    expect(() => rollbackThemeVersion("a", appendThemeVersion("a", second, draft("a", 3)), "a-v3")).toThrow("ROLLBACK_VERSION_UNAVAILABLE");
  });

  it("blocks cross-tenant transitions, insertion, publication and rollback", () => {
    const v1 = approve(draft("a"));
    const historyA = publishThemeVersion("a", createThemeHistory("a", [v1]), v1.id, "2026-09-04T13:00:00.000Z");
    const historyB = createThemeHistory("b", [draft("b")]);
    expect(() => transitionThemeVersion("b", draft("a"), "DESIGN")).toThrow("THEME_TENANT_MISMATCH");
    expect(() => appendThemeVersion("b", historyB, v1)).toThrow("THEME_TENANT_MISMATCH");
    expect(() => publishThemeVersion("b", historyA, v1.id, "2026-09-04T14:00:00.000Z")).toThrow("THEME_TENANT_MISMATCH");
    expect(() => rollbackThemeVersion("b", historyA, v1.id)).toThrow("THEME_TENANT_MISMATCH");
    expect(() => rollbackThemeVersion("b", historyB, v1.id)).toThrow("ROLLBACK_VERSION_UNAVAILABLE");
    expect(historyB.versions[0]?.state).toBe("BRIEFING");
  });

  it("copies and freezes input tokens, rejects duplicate versions", () => {
    const input = { id: "a-v1", tenantId: "a", themeId: "classic", number: 1, tokens: { ...defaultDesignTokens }, createdAt: "2026-09-04T12:00:00.000Z" };
    const version = createThemeVersion(input);
    input.tokens.primaryColor = "#000000";
    expect(version.tokens.primaryColor).toBe(defaultDesignTokens.primaryColor);
    expect(Object.isFrozen(version.tokens)).toBe(true);
    expect(Object.isFrozen(version)).toBe(true);
    expect(() => createThemeHistory("a", [version, version])).toThrow("DUPLICATE_THEME_VERSION");
  });
});
