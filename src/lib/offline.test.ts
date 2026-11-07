import { describe,expect,it } from "vitest";
import { queueEntry,pendingEntries,removePending,putSnapshot,getSnapshot,encryptOffline,decryptOffline,readReviewContext,writeReviewContext,clearOfflineOwner,keepOriginal,pendingOriginals,removeOriginal } from "./offline";
import { indexedDB } from "fake-indexeddb";
globalThis.indexedDB = indexedDB;
describe("Offline entry isolation",()=>{
  it("retains statement original bytes under one stable identity, isolates owners and clears recovery copies", async () => {
    const file = new File(["Date,Debit\n2026-10-02,730"], "statement.csv", { type: "text/csv" });
    // jsdom File lacks arrayBuffer; use real bytes for this browser API boundary.
    Object.defineProperty(file, "arrayBuffer", { value: async () => new TextEncoder().encode("Date,Debit\n2026-10-02,730").buffer });
    const meta = { id: "original-1", title: "Statement", docType: "bank_statement" as const, docDate: null, amount: null, currency: "INR", merchant: null, notes: "", transactionId: null, accountId: null, loanId: null, expiresOn: null };
    await Promise.all([keepOriginal("original-owner", { file, meta }), keepOriginal("original-owner", { file, meta: { ...meta, id: "original-2" } })]);
    await keepOriginal("original-owner", { file, meta });
    const rows = await pendingOriginals("original-owner");
    expect(rows.map(r => r.meta.id).sort()).toEqual(["original-1", "original-2"]);
    expect(rows[0]?.file.size).toBe(25);
    expect(await pendingOriginals("unrelated-owner")).toEqual([]);
    await removeOriginal("original-owner", "original-1");
    expect((await pendingOriginals("original-owner")).map(r => r.meta.id)).toEqual(["original-2"]);
    await clearOfflineOwner("original-owner");
    expect(await pendingOriginals("original-owner")).toEqual([]);
  });
  it('restores unconfirmed review IDs only for their owner and removes them on data cleanup', async () => {
    const context = { selected: ['review-91'], query: 'Grab', group: 'category', category: 'Transport', account: 'all', workspace: 'all', organisation: 'all' };
    await writeReviewContext('review-owner', context);
    expect(await readReviewContext('review-owner')).toEqual(context);
    expect(await readReviewContext('another-owner')).toBeUndefined();
    await clearOfflineOwner('review-owner');
    expect(await readReviewContext('review-owner')).toBeUndefined();
  });
  it("encrypts records and rejects decryption as another owner",async()=>{
    const sealed=await encryptOffline("owner-a",{balance:78901});
    expect(new TextDecoder().decode(sealed.bytes)).not.toContain("78901");
    expect(await decryptOffline("owner-a",sealed)).toEqual({balance:78901});
    await expect(decryptOffline("owner-b",sealed)).rejects.toThrow();
  });
  it("retains an entry under its owner and stable id",async()=>{
    await queueEntry({id:"stable-entry",owner:"owner-a",createdAt:"2026-10-31",files:[],input:{title:"Offline dinner",merchant:null,amount:2500,currency:"INR",date:"2026-10-31",category:"Dining",scope:"personal",memberId:null,paymentMethod:"cash",description:""}});
    expect((await pendingEntries("owner-a")).map(e=>e.id)).toEqual(["stable-entry"]);
    expect(await pendingEntries("owner-b")).toEqual([]);
    await removePending("stable-entry");expect(await pendingEntries("owner-a")).toEqual([]);
  });
  it("does not share cached financial records across accounts",async()=>{
    await putSnapshot("owner-a",{balance:2500});expect(await getSnapshot("owner-a")).toEqual({balance:2500});expect(await getSnapshot("owner-b")).toBeUndefined();
  });
});