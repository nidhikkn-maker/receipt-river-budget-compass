// Development/preview build identity, read from build-time variables only (never from the network or records).
// The panel that shows it renders only when VITE_PREVIEW_ENV is exactly "preview", so production builds and normal
// local development never show it. Pure functions here; src/components/PreviewInfoPanel.tsx renders them.

export interface PreviewEnv {
  VITE_PREVIEW_ENV?: string | undefined;
  VITE_PREVIEW_COMMIT?: string | undefined;
  VITE_PREVIEW_BRANCH?: string | undefined;
  VITE_PREVIEW_BUILT_AT?: string | undefined;
  VITE_SUPABASE_URL?: string | undefined;
}

export type DataSource = "sample" | "unknown";

export interface PreviewInfo {
  commit: string | null;
  shortCommit: string | null;
  branch: string | null;
  builtAt: Date | null;
  builtAtLabel: string;
  buildVersion: string;
  dataSource: DataSource;
  dataSourceLabel: string;
  host: string;
}

export const SAMPLE_DATA_LABEL = "Sample data only — not connected to your real records";
export const UNKNOWN_DATA_LABEL = "Unknown data source";

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** True only for a build explicitly marked as a preview. */
export const isPreviewBuild = (env: PreviewEnv) => (env.VITE_PREVIEW_ENV ?? "").trim() === "preview";

/** Path segment the fixture backend is served under (scripts/dev/local-preview.cjs and the hosted fixture). */
const FIXTURE_PATH_SEGMENT = "__fixture-supabase";
/** A host label word that names a fixture backend, e.g. "thapal-fixture-backend.vercel.app" or "fixture.example". */
const FIXTURE_HOST_WORD = /^fixtures?$/;

/**
 * Positive detection of the fixture (sample-data) backend from the configured record-store address. Anything that
 * is not recognisably the fixture — including any real hosted project — is "unknown"; this never guesses "real".
 */
export function classifyDataSource(url: string | undefined, base = "http://localhost"): DataSource {
  const raw = (url ?? "").trim();
  if (!raw) return "unknown";
  let parsed: URL;
  try { parsed = new URL(raw, base); } catch { return "unknown"; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "unknown";
  if (parsed.pathname.split("/").includes(FIXTURE_PATH_SEGMENT)) return "sample";
  const words = parsed.hostname.toLowerCase().split(/[.-]/);
  return words.some((w) => FIXTURE_HOST_WORD.test(w)) ? "sample" : "unknown";
}

/** Accepts an ISO timestamp or Unix seconds/milliseconds. */
export function parseBuiltAt(v: string | undefined): Date | null {
  const t = clean(v);
  if (!t) return null;
  const d = /^\d+$/.test(t) ? new Date(t.length <= 10 ? Number(t) * 1000 : Number(t)) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "10 Nov 2026, 14:32 UTC" — UTC so every viewer reads the same build time. */
export const formatBuiltAt = (d: Date) =>
  `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;

/** "20261110.1432-69ab3e2": build time plus commit, unique per build of a commit. */
export function buildVersion(builtAt: Date | null, shortCommit: string | null) {
  const stamp = builtAt
    ? `${builtAt.getUTCFullYear()}${pad(builtAt.getUTCMonth() + 1)}${pad(builtAt.getUTCDate())}.${pad(builtAt.getUTCHours())}${pad(builtAt.getUTCMinutes())}`
    : null;
  return [stamp, shortCommit].filter(Boolean).join("-") || "Unknown build";
}

export function readPreviewInfo(env: PreviewEnv, host: string, base?: string): PreviewInfo {
  const commit = clean(env.VITE_PREVIEW_COMMIT);
  const shortCommit = commit ? commit.slice(0, 7) : null;
  const builtAt = parseBuiltAt(env.VITE_PREVIEW_BUILT_AT);
  const dataSource = classifyDataSource(env.VITE_SUPABASE_URL, base);
  return {
    commit,
    shortCommit,
    branch: clean(env.VITE_PREVIEW_BRANCH),
    builtAt,
    builtAtLabel: builtAt ? formatBuiltAt(builtAt) : "Unknown time",
    buildVersion: buildVersion(builtAt, shortCommit),
    dataSource,
    dataSourceLabel: dataSource === "sample" ? SAMPLE_DATA_LABEL : UNKNOWN_DATA_LABEL,
    host: host || "Unknown host",
  };
}
