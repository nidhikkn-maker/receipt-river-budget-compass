/**
 * K10 Release / version information. Pure rules: which build this is, which environment it runs in, how the app's own
 * services look from this device, and what is known not to work yet. Only an allow-list of build values is read, so no
 * key, token or other secret can ever reach the screen.
 */
import { loadAreaList, type LoadArea } from "./load-state";

/** The only build values this screen may show (Vite exposes VITE_* and MODE/DEV/PROD). */
export const RELEASE_ENV_KEYS = ["MODE", "DEV", "PROD", "VITE_APP_VERSION", "VITE_BUILD_COMMIT", "VITE_BUILD_TIME", "VITE_APP_ENV"] as const;

export interface ReleaseInfo { version: string; environment: string; build: string; commit: string; builtAt: string }
const text = (v: unknown, max = 40) => (typeof v === "string" && /^[\w.:+\-/ ]{1,80}$/.test(v.trim()) ? v.trim().slice(0, max) : null);

export function releaseInfo(env: Readonly<Record<string, unknown>>, host: string | null): ReleaseInfo {
  const mode = text(env["MODE"]) ?? "unknown";
  const named = text(env["VITE_APP_ENV"]);
  const local = !!host && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const environment = named ?? (env["DEV"] === true || mode === "development" ? (local ? "Development (this computer)" : "Development") : /preview|lovable/i.test(host ?? "") ? "Preview" : "Production");
  const commit = text(env["VITE_BUILD_COMMIT"], 12);
  return {
    version: text(env["VITE_APP_VERSION"]) ?? "Not recorded in this build",
    environment,
    build: env["PROD"] === true ? "Production build" : "Development build",
    commit: commit && /^[0-9a-f]{7,40}$/i.test(commit) ? commit : "Not recorded in this build",
    builtAt: text(env["VITE_BUILD_TIME"]) ?? "Not recorded in this build",
  };
}

export type HealthState = "ok" | "attention" | "unknown";
export interface HealthRow { key: string; label: string; state: HealthState; detail: string }
export interface JobState { name: string; status: string; lastSuccess: string | null; reason: string | null }
export interface HealthInput {
  signedIn: boolean; online: boolean; loadErrors: readonly LoadArea[]; pendingCount: number;
  /** The store's readFailure: the whole last cloud read failed (loadErrors then stays empty). */
  readFailed?: boolean;
  jobs: JobState[] | null; jobsFailed: boolean; worker: "active" | "none" | "unsupported"; today: string;
}
const JOB_LABEL: Record<string, string> = { "rule-watch": "Weekly check of official tax pages", "closing-prices": "Evening NSE/BSE closing prices" };
const daysSince = (iso: string | null, today: string) => (iso ? Math.floor((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 864e5) : null);

/** Service health exactly as this app sees it from this device. It never claims more than it checked. */
export function serviceHealth(i: HealthInput): HealthRow[] {
  const rows: HealthRow[] = [
    { key: "session", label: "Sign-in", state: i.signedIn ? "ok" : "attention", detail: i.signedIn ? "Signed in on this device" : "Not signed in" },
    { key: "network", label: "Internet on this device", state: i.online ? "ok" : "attention", detail: i.online ? "Online" : "Offline — changes are kept on this device until you reconnect" },
    { key: "data", label: "Your records in Lovable Cloud", state: i.loadErrors.length || (i.readFailed && i.online) ? "attention" : i.online ? "ok" : "unknown",
      detail: i.loadErrors.length ? `Couldn't load ${loadAreaList(i.loadErrors)} on the last refresh. Nothing has been deleted.`
        : !i.online ? "Not checked while offline"
        : i.readFailed ? "Couldn't reach your records on the last refresh. Nothing has been deleted." : "Loaded on the last refresh" },
    { key: "sync", label: "Offline entries", state: i.pendingCount ? "attention" : "ok", detail: i.pendingCount ? `${i.pendingCount} saved on this device, waiting to upload` : "Nothing waiting to upload" },
    { key: "worker", label: "Offline app support", state: i.worker === "active" ? "ok" : "unknown", detail: i.worker === "active" ? "Installed on this device" : i.worker === "unsupported" ? "This browser doesn't support it" : "Not installed (it is turned off in development and preview builds)" },
  ];
  if (i.jobsFailed) rows.push({ key: "jobs", label: "Background jobs", state: "unknown", detail: "Couldn't check the background jobs. Nothing has been deleted." });
  else if (i.jobs) for (const j of i.jobs) {
    const age = daysSince(j.lastSuccess, i.today);
    const late = j.name === "closing-prices" ? (age ?? 99) > 4 : (age ?? 99) > 10;
    rows.push({ key: `job:${j.name}`, label: JOB_LABEL[j.name] ?? `Background job: ${j.name}`, state: j.status === "failed" || late ? "attention" : j.status === "ok" ? "ok" : "unknown",
      detail: `${j.lastSuccess ? `Last finished ${j.lastSuccess.slice(0, 10)}` : "Has not finished yet"}${j.status === "failed" ? " · last run failed" : ""}${j.reason ? ` · ${j.reason.slice(0, 120)}` : ""}` });
  }
  return rows;
}

/** Plain-language limitations known for this release (kept in step with docs/registers). */
export const KNOWN_LIMITATIONS: readonly { area: string; text: string; ref: string }[] = [
  { area: "Statement Desk", text: "Undo for statement uploads needs an approved database update, so it is hidden for now.", ref: "P0-002" },
  { area: "Exports", text: "Files are prepared in your browser. Server-side approval and an export log are still to come.", ref: "P0-006" },
  { area: "Deleting entries", text: "Deleting a transaction still removes it. Reversal-based corrections are being built.", ref: "P0-005a" },
  { area: "Archive", text: "Loans, goals, scheduled payments, valuations and documents keep their archive status in your settings until the database has archive fields.", ref: "P0-008, P0-012–P0-014" },
  { area: "Notifications", text: "The notification centre lists in-app reminders. Snooze and per-type thresholds are not available yet.", ref: "B05" },
  { area: "Calendar", text: "Calendar items cannot be synced to an outside calendar yet; trip itineraries can be saved as a calendar file.", ref: "B04" },
  { area: "Device checks", text: "Screens are checked in browser emulation; checks on real iPhone and iPad devices are still pending.", ref: "Release gate" },
];
