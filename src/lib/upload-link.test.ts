import { describe, expect, it } from "vitest";
import { linkHistory, fileProblem, linkState, MAX_FILES, sendDue, signToken, verifyToken } from "./upload-link";

const row = { id: "x", expires_at: "2026-12-02T00:00:00Z", revoked_at: null, file_count: 0, max_files: MAX_FILES };
const now = new Date("2026-11-02T04:00:00Z");

describe("accountant upload link", () => {
  it("accepts at least 25 files", () => { expect(MAX_FILES).toBeGreaterThanOrEqual(25); expect(linkState({ ...row, file_count: 25 }, now)).toBe("active"); });
  it("stops when full", () => expect(linkState({ ...row, file_count: MAX_FILES }, now)).toBe("full"));
  it("expires after its date", () => expect(linkState(row, new Date("2026-12-02T00:00:01Z"))).toBe("expired"));
  it("turned-off link is revoked", () => expect(linkState({ ...row, revoked_at: "2026-11-01T00:00:00Z" }, now)).toBe("revoked"));
  it("rejects files over 20 MB and other types", () => {
    expect(fileProblem("a.pdf", 21 * 1024 * 1024)).not.toBeNull();
    expect(fileProblem("a.exe", 10)).not.toBeNull();
    expect(fileProblem("a.pdf", 10)).toBeNull();
  });
  it("monthly email only on the chosen day, once a month", () => {
    expect(sendDue(2, null, now)).toBe(true);
    expect(sendDue(1, null, now)).toBe(false);
    expect(sendDue(2, "2026-11-02T01:00:00Z", now)).toBe(false);
    expect(sendDue(2, "2026-10-02T01:00:00Z", now)).toBe(true);
  });
  it("history adds expiry for lapsed links, newest first, not for turned-off ones", () => {
    const h = linkHistory(
      [{ linkId: "a", kind: "uploaded", detail: "x.pdf", at: "2026-10-05T00:00:00Z" }],
      [{ id: "a", expires_at: "2026-10-31T00:00:00Z", revoked_at: null }, { id: "b", expires_at: "2026-10-20T00:00:00Z", revoked_at: "2026-10-10T00:00:00Z" }],
      now,
    );
    expect(h.map((e) => e.kind)).toEqual(["expired", "uploaded"]);
  });
  it("tokens verify only with the right signature", async () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const t = await signToken("s", id);
    expect(await verifyToken("s", t)).toBe(id);
    expect(await verifyToken("other", t)).toBeNull();
    expect(await verifyToken("s", t.slice(0, -2) + "zz")).toBeNull();
  });
});

import { reminderDue, ownerNotifyDue } from "./upload-link";
describe("accountant reminder and owner notice", () => {
  const now = new Date("2026-11-10T04:00:00Z");
  const base = { emailedAt: "2026-11-05T04:00:00Z", fileCount: 0, reminded: false, expiresAt: "2026-12-05T04:00:00Z", revokedAt: null };
  it("reminds 4+ days after the email when nothing uploaded", () => expect(reminderDue(base, now)).toBe(true));
  it("waits until 4 days have passed", () => expect(reminderDue({ ...base, emailedAt: "2026-11-07T04:00:00Z" }, now)).toBe(false));
  it("skips once files are uploaded", () => expect(reminderDue({ ...base, fileCount: 1 }, now)).toBe(false));
  it("reminds only once", () => expect(reminderDue({ ...base, reminded: true }, now)).toBe(false));
  it("skips links never emailed or turned off", () => {
    expect(reminderDue({ ...base, emailedAt: null }, now)).toBe(false);
    expect(reminderDue({ ...base, revokedAt: "2026-11-08T00:00:00Z" }, now)).toBe(false);
  });
  it("owner gets at most one notice per 30 minutes", () => {
    expect(ownerNotifyDue(null, now)).toBe(true);
    expect(ownerNotifyDue("2026-11-10T03:45:00Z", now)).toBe(false);
    expect(ownerNotifyDue("2026-11-10T03:29:00Z", now)).toBe(true);
  });
});

import { requestReport, type LinkEvent, type RequestLink, type RequestUpload } from "./upload-link";
describe("monthly upload request report", () => {
  const now = new Date("2026-11-10T04:00:00Z");
  const link = (over: Partial<RequestLink> = {}): RequestLink => ({
    id: "L1", created_at: "2026-11-01T04:00:00Z", expires_at: "2026-12-01T04:00:00Z",
    revoked_at: null, file_count: 0, max_files: MAX_FILES, last_emailed_at: "2026-11-01T04:00:00Z", ...over,
  });
  const ev = (kind: LinkEvent["kind"], at: string, detail: string | null = null): LinkEvent => ({ linkId: "L1", kind, detail, at });
  const up = (fileName: string, uploadedAt: string, consumedAt: string | null = null): RequestUpload => ({ linkId: "L1", fileName, uploadedAt, consumedAt });
  const one = (l: RequestLink, events: LinkEvent[] = [], ups: RequestUpload[] = []) => {
    const r = requestReport([l], events, ups, now).find((x) => x.id === l.id);
    if (!r) throw new Error("report dropped this request");
    return r;
  };

  it("names the month and reports the email, opens, files and what still waits", () => {
    const r = one(
      link({ file_count: 2 }),
      [ev("created", "2026-11-01T04:00:00Z"), ev("emailed", "2026-11-01T04:00:05Z", "durai@example.com"),
        ev("opened", "2026-11-03T09:00:00Z"), ev("opened", "2026-11-04T09:00:00Z"), ev("uploaded", "2026-11-04T09:05:00Z", "HDFC.pdf")],
      [up("HDFC.pdf", "2026-11-04T09:05:00Z"), up("AMEX.pdf", "2026-11-05T09:05:00Z", "2026-11-06T09:00:00Z")],
    );
    expect(r.month).toBe("November 2026");
    expect(r.state).toBe("active");
    expect(r.emailedTo).toBe("durai@example.com");
    expect(r.opens).toBe(2);
    expect(r.files).toBe(2);
    expect(r.names).toEqual(["AMEX.pdf", "HDFC.pdf"]);
    expect(r.waiting).toBe(1);
    expect(r.reminder).toBe("not-needed");
  });

  it("says a reminder is owed a few days after the email, then sent once it went", () => {
    const events = [ev("emailed", "2026-11-01T04:00:00Z", "durai@example.com")];
    expect(one(link(), events).reminder).toBe("due");
    const sent = one(link(), [...events, ev("reminded", "2026-11-06T04:00:00Z", "durai@example.com")]);
    expect(sent.reminder).toBe("sent");
    expect(sent.reminderAt).toBe("2026-11-06T04:00:00Z");
  });

  it("waits before the reminder day and never reminds a link that was not emailed", () => {
    expect(one(link({ last_emailed_at: "2026-11-08T04:00:00Z" }), [ev("emailed", "2026-11-08T04:00:00Z")]).reminder).toBe("waiting");
    expect(one(link({ last_emailed_at: null })).reminder).toBe("closed");
  });

  it("closes the reminder once a link has lapsed or been turned off with nothing uploaded", () => {
    expect(one(link({ revoked_at: "2026-11-08T04:00:00Z" }), [ev("emailed", "2026-11-01T04:00:00Z")]).reminder).toBe("closed");
    const r = one(link({ expires_at: "2026-11-09T04:00:00Z" }), [ev("emailed", "2026-11-01T04:00:00Z")]);
    expect(r.state).toBe("expired");
    expect(r.reminder).toBe("closed");
  });

  it("reports the confirmation email to you, and flags files that never produced one", () => {
    const withNote = one(link({ file_count: 1 }), [ev("uploaded", "2026-11-04T09:05:00Z", "HDFC.pdf"), ev("owner_notified", "2026-11-04T09:06:00Z", "krupa@ledgerline.biz")], [up("HDFC.pdf", "2026-11-04T09:05:00Z")]);
    expect(withNote.confirmAt).toBe("2026-11-04T09:06:00Z");
    expect(withNote.confirmTo).toBe("krupa@ledgerline.biz");
    const missing = one(link({ file_count: 1 }), [ev("uploaded", "2026-11-04T09:05:00Z", "HDFC.pdf")], [up("HDFC.pdf", "2026-11-04T09:05:00Z")]);
    expect(missing.confirmAt).toBeNull();
    expect(missing.files).toBe(1);
  });

  it("lists the newest request first and reports a full link", () => {
    const older = link({ id: "L0", created_at: "2026-10-01T04:00:00Z" });
    const rows = requestReport([link({ file_count: MAX_FILES }), older], [], [], now);
    expect(rows.map((r) => r.month)).toEqual(["November 2026", "October 2026"]);
    expect(rows.at(0)?.state).toBe("full");
  });
});


import { canResendReminder, reminderEntry } from "./upload-link";
describe("manual reminder resend", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const l = { id: "a", expires_at: "2026-12-01T00:00:00Z", revoked_at: null as string | null, file_count: 0, max_files: 50 };
  it("allowed while link is open", () => expect(canResendReminder(l, now)).toBe(true));
  it("blocked once expired", () => expect(canResendReminder({ ...l, expires_at: "2026-11-01T00:00:00Z" }, now)).toBe(false));
  it("blocked once turned off", () => expect(canResendReminder({ ...l, revoked_at: "2026-11-05T00:00:00Z" }, now)).toBe(false));
  it("marks resends as manual in history", () => {
    expect(reminderEntry({ at: "x", detail: "resent:d@x.com" })).toEqual({ at: "x", to: "d@x.com", manual: true });
    expect(reminderEntry({ at: "x", detail: "d@x.com" })).toEqual({ at: "x", to: "d@x.com", manual: false });
  });
});
