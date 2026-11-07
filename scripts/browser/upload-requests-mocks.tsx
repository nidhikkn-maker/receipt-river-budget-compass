import { MAX_FILES, requestReport, type LinkEvent, type RequestLink, type RequestUpload, type UploadRequest } from "../../src/lib/upload-link";

// Controlled monthly requests only: no account session, no Cloud client and no real email are involved.
const NOW = new Date("2026-11-10T04:00:00Z");
const link = (id: string, created_at: string, expires_at: string, over: Partial<RequestLink> = {}): RequestLink =>
  ({ id, created_at, expires_at, revoked_at: null, file_count: 0, max_files: MAX_FILES, last_emailed_at: null, ...over });
const ev = (linkId: string, kind: LinkEvent["kind"], at: string, detail: string | null = null): LinkEvent => ({ linkId, kind, detail, at });
const up = (linkId: string, fileName: string, uploadedAt: string, consumedAt: string | null = null): RequestUpload => ({ linkId, fileName, uploadedAt, consumedAt });

const LINKS: RequestLink[] = [
  link("nov-used", "2026-11-01T04:00:00Z", "2026-12-01T04:00:00Z", { file_count: 2, last_emailed_at: "2026-11-01T04:00:05Z" }),
  link("nov-due", "2026-11-05T04:00:00Z", "2026-12-05T04:00:00Z", { last_emailed_at: "2026-11-05T04:00:00Z" }),
  link("oct-sent", "2026-10-01T04:00:00Z", "2026-10-31T04:00:00Z", { last_emailed_at: "2026-10-01T04:00:00Z" }),
  link("sep-off", "2026-09-01T04:00:00Z", "2026-10-01T04:00:00Z", { last_emailed_at: "2026-09-01T04:00:00Z", revoked_at: "2026-09-20T04:00:00Z" }),
  link("aug-off", "2026-08-01T04:00:00Z", "2026-09-01T04:00:00Z", { revoked_at: "2026-08-20T04:00:00Z" }),
  link("jul-off", "2026-07-01T04:00:00Z", "2026-08-01T04:00:00Z", { revoked_at: "2026-07-20T04:00:00Z" }),
  link("jun-off", "2026-06-01T04:00:00Z", "2026-07-01T04:00:00Z", { revoked_at: "2026-06-20T04:00:00Z" }),
];
const EVENTS: LinkEvent[] = [
  ev("nov-used", "emailed", "2026-11-01T04:00:05Z", "durai@example.com"),
  ev("nov-used", "opened", "2026-11-03T09:00:00Z"),
  ev("nov-used", "uploaded", "2026-11-03T09:10:00Z", "HDFC-Nov.pdf"),
  ev("nov-used", "owner_notified", "2026-11-03T09:11:00Z", "nidhi.kkn@gmail.com"),
  ev("nov-due", "emailed", "2026-11-05T04:00:00Z", "durai@example.com"),
  ev("oct-sent", "emailed", "2026-10-01T04:00:00Z", "durai@example.com"),
  ev("oct-sent", "reminded", "2026-10-06T04:00:00Z", "durai@example.com"),
  ev("sep-off", "emailed", "2026-09-01T04:00:00Z", "durai@example.com"),
];
const UPLOADS: RequestUpload[] = [
  up("nov-used", "HDFC-Nov.pdf", "2026-11-03T09:10:00Z"),
  up("nov-used", "AMEX-Nov.pdf", "2026-11-04T09:10:00Z", "2026-11-05T09:00:00Z"),
];

/** Stands in for the server function: real derivation, controlled rows. */
export async function getUploadRequests(): Promise<UploadRequest[]> {
  return requestReport(LINKS, EVENTS, UPLOADS, NOW);
}

export const PageTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <header>
    <h1>{title}</h1>
    {sub ? <p>{sub}</p> : null}
  </header>
);
