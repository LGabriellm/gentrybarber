import { z } from "zod";
import { designTokensSchema, type DesignTokens } from "@platform/design-system";

export const themeVersionStates = ["BRIEFING", "DESIGN", "DEVELOPMENT", "REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED"] as const;
export type ThemeVersionState = typeof themeVersionStates[number];

export type ThemePublicationStatus = "DRAFT" | "PREVIEW" | "APPROVED" | "PUBLISHED";

/** The design workflow is not the database publication status enum. Archival is separate. */
export function themeWorkflowToPublicationStatus(state: ThemeVersionState): ThemePublicationStatus {
  const status: Readonly<Record<ThemeVersionState, ThemePublicationStatus>> = {
    BRIEFING: "DRAFT", DESIGN: "DRAFT", DEVELOPMENT: "DRAFT", CHANGES_REQUESTED: "DRAFT",
    REVIEW: "PREVIEW", APPROVED: "APPROVED", PUBLISHED: "PUBLISHED",
  };
  return status[state];
}

export interface ThemeVersion {
  readonly id: string; readonly tenantId: string; readonly themeId: string; readonly number: number;
  readonly state: ThemeVersionState; readonly tokens: DesignTokens; readonly createdAt: string;
  readonly publishedAt?: string;
}

export interface ThemeHistory {
  readonly tenantId: string;
  readonly versions: readonly ThemeVersion[];
  readonly publishedVersionId: string | null;
}

const versionInputSchema = z.object({
  id: z.string().min(1).max(100), tenantId: z.string().min(1).max(100),
  themeId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/), number: z.number().int().positive(),
  tokens: designTokensSchema, createdAt: z.iso.datetime(),
}).strict();

function freezeVersion(version: ThemeVersion): ThemeVersion {
  return Object.freeze({ ...version, tokens: Object.freeze({ ...version.tokens }) });
}

export function createThemeVersion(input: Omit<ThemeVersion, "state" | "publishedAt">): ThemeVersion {
  return freezeVersion({ ...versionInputSchema.parse(input), state: "BRIEFING" });
}

const transitions: Readonly<Record<ThemeVersionState, readonly ThemeVersionState[]>> = Object.freeze({
  BRIEFING: ["DESIGN"], DESIGN: ["DEVELOPMENT"], DEVELOPMENT: ["REVIEW"],
  REVIEW: ["CHANGES_REQUESTED", "APPROVED"], CHANGES_REQUESTED: ["DEVELOPMENT"],
  APPROVED: [], PUBLISHED: [],
});

/** Published snapshots cannot be edited. A new design always receives a new version. */
export function transitionThemeVersion(tenantId: string, version: ThemeVersion, next: ThemeVersionState): ThemeVersion {
  assertTenant(tenantId, version.tenantId);
  if (!transitions[version.state].includes(next)) throw new Error("INVALID_THEME_TRANSITION");
  return freezeVersion({ ...version, state: next });
}

function assertTenant(expected: string, actual: string): void {
  if (!expected.trim() || expected !== actual) throw new Error("THEME_TENANT_MISMATCH");
}

function freezeHistory(history: ThemeHistory): ThemeHistory {
  assertTenant(history.tenantId, history.tenantId);
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const version of history.versions) {
    assertTenant(history.tenantId, version.tenantId);
    if (ids.has(version.id) || numbers.has(version.number)) throw new Error("DUPLICATE_THEME_VERSION");
    ids.add(version.id);
    numbers.add(version.number);
  }
  if (history.publishedVersionId !== null && !history.versions.some(version => version.id === history.publishedVersionId && version.state === "PUBLISHED")) {
    throw new Error("INVALID_PUBLISHED_THEME_VERSION");
  }
  return Object.freeze({ ...history, versions: Object.freeze(history.versions.map(freezeVersion)) });
}

export function createThemeHistory(tenantId: string, versions: readonly ThemeVersion[] = []): ThemeHistory {
  return freezeHistory({ tenantId, versions, publishedVersionId: null });
}

export function appendThemeVersion(tenantId: string, history: ThemeHistory, version: ThemeVersion): ThemeHistory {
  assertTenant(tenantId, history.tenantId);
  assertTenant(tenantId, version.tenantId);
  return freezeHistory({ ...history, versions: [...history.versions, version] });
}

export function publishThemeVersion(tenantId: string, history: ThemeHistory, versionId: string, publishedAt: string): ThemeHistory {
  assertTenant(tenantId, history.tenantId);
  const validated = freezeHistory(history);
  const target = validated.versions.find(version => version.id === versionId);
  if (!target) throw new Error("THEME_VERSION_NOT_FOUND");
  if (target.state !== "APPROVED") throw new Error("THEME_APPROVAL_REQUIRED");
  z.iso.datetime().parse(publishedAt);
  return freezeHistory({ ...validated, publishedVersionId: target.id,
    versions: validated.versions.map(version => version.id === target.id ? { ...version, state: "PUBLISHED", publishedAt } : version),
  });
}

export function rollbackThemeVersion(tenantId: string, history: ThemeHistory, targetVersionId: string): ThemeHistory {
  assertTenant(tenantId, history.tenantId);
  const validated = freezeHistory(history);
  const target = validated.versions.find(version => version.id === targetVersionId);
  if (!validated.publishedVersionId || !target || target.state !== "PUBLISHED") throw new Error("ROLLBACK_VERSION_UNAVAILABLE");
  return freezeHistory({ ...validated, publishedVersionId: target.id });
}
