import { duplicateDocuments } from "@/lib/documents";
import { takePendingScan } from "@/lib/pending-scan";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { returnAfterReview } from "@/lib/review-navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountForm } from "@/components/AccountForm";
import { PayeePicker } from '@/components/PayeePicker';
import { useEffect, useMemo, useRef, useState } from "react";

const acctNameOf = (list: { id: string; name: string }[], id: string) => list.find((a) => a.id === id)?.name ?? "account";
import { toast } from "sonner";
import { ScanLine, Sparkles, X, Camera, Image as ImageIcon, FolderOpen, Inbox, RotateCcw, PencilLine, ChevronDown, Check, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { dayShortcut, recentFirst, relevantSections, repeatCandidates, repeatDraft, smartDefaults, applyShopRule, shopRuleFor, type SmartDefaultReason } from "@/lib/entry-form";
import { ArrowRight, Repeat, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACTIVE_SCOPES, BASE_CURRENCY, CATEGORIES, CURRENCIES, PAYMENT_LABEL, PAYMENT_METHODS, convert, money, splitEvenly,
  type Category, type PaymentMethod, type Scope, type ReceiptDetails,
  SCOPE_LABEL,
} from "@/lib/expenses";
import { tagValue } from "@/lib/preferences";
import { duplicateBills } from "@/lib/bill-duplicates";
import { suggestForEntry } from "@/lib/statement-pipeline/single-entry";
import { buildReceiptAudit, receiptFingerprint, receiptFingerprintMatches, type ReceiptReadValues } from "@/lib/receipt-audit";
import { receiptConfidence, receiptBreakdownError, receiptRoundOff, receiptItemConfidence, receiptItemReviewReasons, receiptReviewCheck, receiptReviewSignature, unconfirmedFields, correctedFields, learnedShopName, type ReceiptField, type ReadingConfidence } from "@/lib/receipt-reading";
import { ReceiptZoomViewer } from "@/components/ReceiptZoomViewer";
import { quickEntrySearch } from "@/lib/quick-entry";
import { useStore } from "@/lib/store";
import { activeInstruments, applyInstrument, instrumentLabel, lastInstrumentForMerchant } from "@/lib/payment-instruments";
import { extractReceipt } from "@/lib/receipt-extract.functions";
import { prepareForReading } from "@/lib/image-prep";
import { getFxRate } from "@/lib/fx.functions";
import { parseSpokenEntry } from "@/lib/assistant.functions";
import { useServerFn } from "@tanstack/react-start";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProcessingPanel, stagesAt } from "@/components/ProcessingPanel";
import { createLatest } from "@/lib/latest-request";
import { fileToLocal, localDrafts, localToFile, putLocalDraft, removeLocalDraft } from "@/lib/offline";
import { completeDraft, draftReceiptFile, draftStatus, getDraft, hasDraftContent, upsertDraft, uploadDraftReceipt, type DraftData, type DraftReceipt } from "@/lib/drafts";
import { ACCOUNT_LABEL, MOVE_TARGET, isMove, TXN_LABEL, TXN_TYPES, frequentMerchants, suggestForMerchant, type TxnType } from "@/lib/ledger";


import { WorkspacePicker, splitShares } from "@/components/WorkspacePicker";
import { suggestWorkspace, validateShares, type AllocationMethod } from "@/lib/workspaces";
import { tripTag } from "@/lib/intelligence";
import { smartTripSuggestions } from "@/lib/trip-suggestions";
import { BOOKING_CATEGORY, bookingOutstanding, bookingPaid, bookingPaymentIds, travelCategory, tripsForDate, type TravelTrip } from "@/lib/travel";
import { emiSplit } from "@/lib/planning";
import { todayISO } from "@/lib/use-position";

const TYPE_HINT: Partial<Record<TxnType, string>> = {
  transfer: "Moving money between your own accounts isn't counted as spending or income.",
  card_payment: "Paying a credit card bill lowers what you owe on the card. The purchases were already counted, so this isn't spending again.",
  loan_repayment: "Lowers the loan balance. Not counted as spending.",
  investment: "Moves money into an investment account. Not spending; it stays in your net worth.",
  advance: "Money given to you ahead of travel or work. It raises the account balance but isn't income — it's owed back or settled with expenses.",
  advance_settlement: "Returning the unused part of an advance. Lowers the balance but isn't spending.",
};

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: quickEntrySearch,
  head: () => ({
    meta: [
      { title: "Add expense — Ledgerline" },
      { name: "description", content: "Scan a bill in any currency and tag it business or personal." },
      { property: "og:title", content: "Add expense — Ledgerline" },
      { property: "og:description", content: "Scan a bill in any currency and tag it business or personal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewExpense,
});

type LocalReceipt = { file: File; name: string; type: string; dataUrl: string; fingerprint: string; path?: string };

const readFile = async (f: File): Promise<LocalReceipt> => {
  const [dataUrl, fingerprint] = await Promise.all([
    new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
      r.readAsDataURL(f);
    }),
    receiptFingerprint(f),
  ]);
  return { file: f, name: f.name, type: f.type, dataUrl, fingerprint };
};

const isDate = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

interface SpeechRec { lang: string; interimResults: boolean; start: () => void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void }

interface Scan { merchant: string; date: string; amount: string; currency: string }

function ReadingIndicator({ value, field }: { value: ReadingConfidence; field?: string }) {
  const label = { high: "High reading confidence", medium: "Double-check · medium confidence", low: "Double-check · low confidence", unknown: "Double-check · confidence unavailable" }[value];
  return <span aria-label={field ? `${field}: ${label}` : undefined} className={cn("block text-xs", value === "high" ? "text-success" : value === "unknown" ? "text-muted-foreground" : "text-warning")}>{label}</span>;
}

function NewExpense() {
  const { userId, save, transactions: expenses, members, accounts, loans, preferences, savePreferences, documents, addDocument, removeDocument, signedUrl } = useStore();
  const PENDING = "pending-receipt";
  const inbox = documents.filter((d) => d.notes === PENDING && !d.transactionId);
  const [fromInbox, setFromInbox] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null); const galleryRef = useRef<HTMLInputElement>(null);
  const saveForLater = async () => {
    // Same evidence store and duplicate check as Statement Desk: a photo already in DocuRepo is not stored twice.
    try { for (const r of receipts) if (!duplicateDocuments(documents, { fileName: r.file.name, size: r.file.size, docType: "receipt", docDate: null, amount: null, merchant: null }).some((d) => d.fileName === r.file.name && d.size === r.file.size)) await addDocument(r.file, { title: `Receipt to add · ${r.name}`.slice(0, 120), docType: "receipt", docDate: null, amount: null, currency: "INR", merchant: null, notes: PENDING, transactionId: null, accountId: null, loanId: null, expiresOn: null });
      toast.success(`${receipts.length} receipt${receipts.length === 1 ? "" : "s"} saved to add later`); setReceipts([]); setScan(null); setConfirmed(true);
    } catch (e) { toast.error((e as Error).message); }
  };
  const useSaved = async (id: string) => {
    const d = inbox.find((x) => x.id === id); if (!d) return;
    const url = await signedUrl(d.filePath); if (!url) { toast.error("Couldn't open the saved receipt"); return; }
    const blob = await (await fetch(url)).blob();
    const dt = new DataTransfer(); dt.items.add(new File([blob], d.fileName, { type: d.mimeType || blob.type }));
    setFromInbox((x) => [...x, id]); await onFiles(dt.files);
  };
  const liveAccounts = accounts.filter((a) => !a.archived);
  const nav = useNavigate();
  const router = useRouter();
  const search = Route.useSearch();
  const { edit } = search;
  const editing = edit ? expenses.find((e) => e.id === edit) : undefined;
  const [scope, setScope] = useState<Scope>("personal");
  const [wsSplit, setWsSplit] = useState<{ on: boolean; method: AllocationMethod; values: Partial<Record<Scope, string>> }>({ on: false, method: "fixed", values: {} });
  const ctxTrip = (preferences.trips as TravelTrip[]).find((t) => t.id === search.trip);
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [accountId, setAccountId] = useState<string>("none");
  const [addAcct, setAddAcct] = useState(false);
  const [toAccountId, setToAccountId] = useState<string>("none");
  const [tripId, setTripId] = useState<string>("none");
  const [principal, setPrincipal] = useState("");
  const [interest, setInterest] = useState("");
  const [tags, setTags] = useState("");
  const [memberId, setMemberId] = useState<string>("me");
  const [splitOn, setSplitOn] = useState(false);
  const [shares, setShares] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // One id per draft: retrying after a timeout re-sends the same id, so the server keeps a single entry.
  const draftId = useRef<string>(crypto.randomUUID());
  const latest = useRef(createLatest());
  const [stage, setStage] = useState<{ kind: "receipt" | "voice"; at: number } | null>(null);
  const [more, setMore] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<string>(preferences.defaultCurrency);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [instrumentId, setInstrumentId] = useState<string>("none");
  const savedMethods = activeInstruments(preferences.paymentInstruments, accounts);
  const pickInstrument = (id: string) => {
    setInstrumentId(id);
    const p = savedMethods.find((x) => x.id === id);
    if (!p) return;
    const f = applyInstrument(p);
    setPaymentMethod(f.paymentMethod); setAccountId(f.accountId);
    if (f.memberId && !splitOn) setMemberId(f.memberId);
  };
  useEffect(() => {
    if (editing || instrumentId !== "none") return;
    const d = savedMethods.find((p) => p.isDefault);
    if (d) pickInstrument(d.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.paymentInstruments]);
  const [category, setCategory] = useState<Category>("Groceries");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [receiptDetails, setReceiptDetails] = useState<ReceiptDetails>({});
  const [includeItems, setIncludeItems] = useState(false);
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);
  const [queue, setQueue] = useState<LocalReceipt[]>([]);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [duplicateApproval, setDuplicateApproval] = useState("");
  const [matchApproval, setMatchApproval] = useState("");
  const [reviewApproval, setReviewApproval] = useState("");
  const [reviewDialog, setReviewDialog] = useState(false);
  const [fieldChecks, setFieldChecks] = useState<Partial<Record<ReceiptField, string>>>({});
  const [reading, setReading] = useState(false);
  const [readingError, setReadingError] = useState("");
  const [readTarget, setReadTarget] = useState<LocalReceipt | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanRead, setScanRead] = useState<ReceiptReadValues | null>(null);
  const [scanCategory, setScanCategory] = useState<string>("");
  const [confirmed, setConfirmed] = useState(true);
  const [receiptApproval, setReceiptApproval] = useState("");
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());
  const [fx, setFx] = useState<{ rate: number; date: string } | { error: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!reading && (readingError || (scan && !confirmed))) reviewRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [reading, readingError, scan !== null, confirmed]);
  const parseSpoken = useServerFn(parseSpokenEntry);
  const [listening, setListening] = useState(false);
  const [spoken, setSpoken] = useState("");
  const extract = useServerFn(extractReceipt);
  const intakeApplied = useRef(false);
  useEffect(() => {
    if (edit || intakeApplied.current) return;
    intakeApplied.current = true;
    if (search.title) setTitle(search.title);
    if (search.merchant) setMerchant(search.merchant);
    if (search.amount) setAmount(String(search.amount));
    if (search.currency) setCurrency(search.currency);
    if (search.date) setDate(search.date);
    if (search.payment) setPaymentMethod(search.payment);
    if (search.scope) setScope(search.scope);
    const tr = (preferences.trips as TravelTrip[]).find((t) => t.id === search.trip);
    if (tr) { setTags((x) => [...new Set([...x.split(",").map((y) => y.trim()).filter(Boolean), tripTag(tr)])].join(", ")); if (tr.type && tr.type !== "mixed") setScope(tr.type); if (!search.date && todayISO() > tr.end) setDate(tr.start); }
    const bk = tr?.bookings?.find((b) => b.id === search.booking);
    if (bk) { if (!search.title) setTitle(`${bk.kind.charAt(0).toUpperCase()}${bk.kind.slice(1)} — ${bk.provider || bk.ref}`); if (!search.amount && bk.amount) setAmount(String(bookingOutstanding(bk, expenses))); if (bk.provider && !search.merchant) setMerchant(bk.provider); if (bk.kind === "flight" || bk.kind === "hotel") { const want = BOOKING_CATEGORY[bk.kind]; setCategory((c) => (preferences.categories.some((x) => x.name === want && !x.archived) ? want : preferences.categories.some((x) => x.name === "Travel") ? "Travel" : c)); } }
    if (search.kind) { setTxnType(search.kind); if (tr) setTripId(tr.id); }
    if (search.text) setSpoken(search.text);
  }, [edit, search]);
  useEffect(() => {
    if (edit || !search.account) return;
    const account = liveAccounts.find(a => a.id === search.account || a.name.toLowerCase() === search.account?.toLowerCase());
    if (account) setAccountId(account.id);
  }, [edit, search.account, accounts]);

  // ---- Drafts: autosave, restore, resume later ----
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "uploading" | "device" | "error">("idle");
  const draftLoaded = useRef(!search.draft);
  const draftExists = useRef(false);
  useEffect(() => {
    if (!search.draft || edit) return;
    let live = true;
    (async () => {
      const server = navigator.onLine ? await getDraft(search.draft!).catch(() => null) : null;
      const local = (await localDrafts(userId).catch(() => [])).find((l) => l.id === search.draft);
      if (!live) return;
      const useLocal = !!local && (!server || (server.status !== "saved" && local.updatedAt > server.updatedAt));
      const d = useLocal && local ? { id: local.id, data: local.data as DraftData, receipts: [] as DraftReceipt[], status: "draft" as const } : server;
      if (!d || d.status === "saved") { draftLoaded.current = true; if (!d) toast.error("That draft is no longer available"); return; }
      draftId.current = d.id; draftExists.current = true;
      const x = d.data;
      if (x.txnType) setTxnType(x.txnType as TxnType); if (x.amount) setAmount(x.amount); if (x.currency) setCurrency(x.currency);
      if (x.date) setDate(x.date); if (x.category) setCategory(x.category as Category); if (x.merchant) setMerchant(x.merchant); if (x.title) setTitle(x.title);
      if (x.accountId) setAccountId(x.accountId); if (x.toAccountId) setToAccountId(x.toAccountId); if (x.instrumentId) setInstrumentId(x.instrumentId);
      if (x.paymentMethod) setPaymentMethod(x.paymentMethod as PaymentMethod); if (x.scope) setScope(x.scope as Scope); if (x.tripId) setTripId(x.tripId);
      if (x.tags) setTags(x.tags); if (x.description) setDescription(x.description); if (x.memberId) setMemberId(x.memberId);
      if (x.principal) setPrincipal(x.principal); if (x.interest) setInterest(x.interest);
      if (x.wsSplit) setWsSplit(x.wsSplit as typeof wsSplit); if (x.splitOn) setSplitOn(true); if (x.shares) setShares(x.shares);
      if (x.receiptDetails) setReceiptDetails(x.receiptDetails as ReceiptDetails);
      const files: LocalReceipt[] = [];
      if (useLocal && local) for (const f of local.files) files.push({ ...(await readFile(localToFile(f))), ...(f.path ? { path: f.path } : {}) });
      else for (const r of d.receipts) { const f = await draftReceiptFile(r); if (f) files.push({ ...(await readFile(f)), path: r.path }); }
      if (!live) return;
      setReceipts(files);
      draftLoaded.current = true; setDraftState(useLocal ? "device" : "saved");
      if (x.scan && !search.retry) {
        // Restore the unconfirmed reading so its amount, shop and date are shown for review again.
        const sc = x.scan; setScan({ merchant: sc.merchant, date: sc.date, amount: sc.amount, currency: sc.currency }); setScanCategory(sc.category ?? "");
        setScanRead(sc.read ?? { merchant: sc.merchant, date: sc.date, amount: Number(sc.amount) || 0, currency: sc.currency }); setConfirmed(false);
      } else if (files.length && navigator.onLine && (search.retry || !(Number(x.amount) > 0))) await runExtraction(files[0]!, false);
    })().catch(() => { draftLoaded.current = true; toast.error("Couldn't open that draft"); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.draft]);
  const draftData = (): DraftData => ({ txnType, amount, currency, date, category, merchant, title, accountId, toAccountId, instrumentId, paymentMethod, scope, tripId, tags, description, memberId, principal, interest, wsSplit, splitOn, shares, receiptDetails, extracted: !!scanRead || !!receiptDetails.text, ...(readingError ? { error: readingError } : {}), ...(scan && !confirmed ? { scan: { ...scan, category: scanCategory, ...(scanRead ? { read: scanRead } : {}) } } : {}) });
  const persistDraft = async (auto = false): Promise<boolean> => {
    if (editing || !draftLoaded.current) return false;
    const d = draftData();
    if (!hasDraftContent(d, receipts.length) && !draftExists.current) return false;
    // Background autosave only starts a new draft once there is an amount or a receipt;
    // a shop name alone (often auto-filled) shouldn't leave "No amount yet" drafts behind.
    if (auto && !draftExists.current && !(Number(d.amount) > 0) && receipts.length === 0) return false;
    setDraftState("saving");
    // Always keep an encrypted copy on this device first, so edits survive a lost connection or a closed app.
    try {
      await putLocalDraft(userId, { id: draftId.current, data: d as Record<string, unknown>, updatedAt: new Date().toISOString(), files: await Promise.all(receipts.map((r) => fileToLocal(r.file, { fingerprint: r.fingerprint, ...(r.path ? { path: r.path } : {}) }))) });
    } catch { /* device storage unavailable — the account copy below still applies */ }
    if (!navigator.onLine) { setDraftState("device"); return true; }
    try {
      const stored: DraftReceipt[] = [];
      for (const r of receipts) {
        if (!r.path) { setDraftState("uploading"); r.path = await uploadDraftReceipt(userId, draftId.current, r.file); }
        stored.push({ name: r.name, type: r.type, path: r.path, fingerprint: r.fingerprint });
      }
      await upsertDraft(draftId.current, userId, d, stored, draftStatus(d, stored.length, { processing: reading }));
      draftExists.current = true; setDraftState("saved");
      await removeLocalDraft(userId, draftId.current).catch(() => {});
      return true;
    } catch {
      const kept = (await localDrafts(userId).catch(() => [])).some((l) => l.id === draftId.current);
      setDraftState(kept ? "device" : "error"); return kept;
    }
  };
  const draftSig = JSON.stringify([draftData(), receipts.map((r) => r.fingerprint)]);
  useEffect(() => {
    if (saving) return;
    const t = setTimeout(() => { void persistDraft(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSig, reading]);
  const resumeLater = async () => {
    const ok = await persistDraft();
    if (!ok && hasDraftContent(draftData(), receipts.length)) { toast.error("Draft not saved — check your connection and try again"); return; }
    if (ok) toast.success(navigator.onLine ? "Saved to Drafts — finish it any time" : "Saved on this device — it will sync when you're back online");
    if (window.history.length > 1) window.history.back(); else nav({ to: "/drafts" });
  };
  const close = async () => {
    if (!editing && hasDraftContent(draftData(), receipts.length)) { await resumeLater(); return; }
    if (window.history.length > 1) window.history.back(); else nav({ to: "/dashboard" });
  };

  // Smart defaults: start a routine expense with your usual category, account, payment method and workspace,
  // then re-check once the merchant is known. A field is only changed while it still holds the value we put
  // there, so anything you (or a scan, link, draft or repeat) chose is never overwritten.
  const defaultsBase = useRef<{ category: string; accountId: string; scope: string; paymentMethod: string } | null>(null);
  const [defaultsNote, setDefaultsNote] = useState<{ basis: "merchant" | "habit"; merchant?: string; reasons: { label: string; value: string; reason: SmartDefaultReason | null }[] } | null>(null);
  // Set once you pick an account yourself; shop-name matching and smart defaults then never change it.
  const accountByUser = useRef(false);
  const sdOn = preferences.smartDefaults ?? { category: true, payment: true, workspace: true };
  const liveAccountKey = liveAccounts.map((a) => a.id).join(",");
  useEffect(() => {
    if (edit || search.draft || txnType !== "expense" || !expenses.length) return;
    const base = defaultsBase.current ?? { category, accountId, scope, paymentMethod };
    const d = smartDefaults(expenses, liveAccounts.map((a) => a.id), { merchant, scopes: ACTIVE_SCOPES, categories: preferences.categories.filter((c) => !c.archived).map((c) => c.name) });
    if (!d.basis) return;
    const filled = new Set<string>();
    const shopRule = applyShopRule(d, shopRuleFor(merchant, preferences.shopRules, preferences.shopAliases));
    Object.assign(d, shopRule.value);
    const byRule = (f: "category" | "accountId" | "paymentMethod" | "scope") => shopRule.ruled.includes(f);
    if (!sdOn.category) d.category = null;
    if (!sdOn.payment) { d.accountId = null; d.paymentMethod = null; }
    if (!sdOn.workspace) d.scope = null;
    if (accountByUser.current) d.accountId = null;
    if (!d.category && !d.accountId && !d.paymentMethod && !d.scope) { setDefaultsNote(null); return; }
    if (d.category && category === base.category && d.category !== category) { setCategory(d.category as Category); filled.add("category"); }
    if (d.accountId && !search.account && accountId === base.accountId && d.accountId !== accountId) { setAccountId(d.accountId); filled.add("payment"); }
    if (d.paymentMethod && !search.payment && instrumentId === "none" && paymentMethod === base.paymentMethod && d.paymentMethod !== paymentMethod && (PAYMENT_METHODS as readonly string[]).includes(d.paymentMethod)) setPaymentMethod(d.paymentMethod as PaymentMethod);
    if (d.scope && !search.scope && !search.trip && !wsSplit.on && scope === base.scope && d.scope !== scope) { setScope(d.scope); filled.add("workspace"); }
    defaultsBase.current = {
      category: base.category === category && d.category ? d.category : "\u0000",
      accountId: !search.account && base.accountId === accountId && d.accountId ? d.accountId : "\u0000",
      scope: !search.scope && !search.trip && base.scope === scope && d.scope ? d.scope : "\u0000",
      paymentMethod: base.paymentMethod === paymentMethod && d.paymentMethod ? d.paymentMethod : "\u0000",
    };
    if (filled.size) setAutoFilled((x) => new Set([...x, ...filled]));
    const reasons: { label: string; value: string; reason: SmartDefaultReason | null }[] = [];
    const rs = (f: "category" | "accountId" | "paymentMethod" | "scope") => (byRule(f) ? null : d.reasons[f] ?? null);
    if (d.category && (byRule("category") || d.reasons.category)) reasons.push({ label: "Category", value: d.category, reason: rs("category") });
    if (d.accountId && (byRule("accountId") || d.reasons.accountId)) reasons.push({ label: "Paid with", value: liveAccounts.find((a) => a.id === d.accountId)?.name ?? "Account", reason: rs("accountId") });
    if (d.paymentMethod && (byRule("paymentMethod") || d.reasons.paymentMethod)) reasons.push({ label: "Payment method", value: d.paymentMethod, reason: rs("paymentMethod") });
    if (d.scope && (byRule("scope") || d.reasons.scope)) reasons.push({ label: "Workspace", value: SCOPE_LABEL[d.scope as Scope] ?? d.scope, reason: rs("scope") });
    setDefaultsNote({ basis: d.basis, ...(d.merchant ? { merchant: d.merchant } : {}), reasons });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, search.draft, txnType, expenses.length, liveAccountKey, merchant.trim().toLowerCase(), JSON.stringify(shopRuleFor(merchant, preferences.shopRules, preferences.shopAliases) ?? null), sdOn.category, sdOn.payment, sdOn.workspace]);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatedFrom, setRepeatedFrom] = useState<string | null>(null);
  const favs = preferences.favouriteEntries ?? [];
  const repeatList = repeatCandidates(expenses, favs);
  const toggleFav = (id: string) => void savePreferences({ ...preferences, favouriteEntries: favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id] });
  const applyRepeat = (id: string) => {
    const src = expenses.find((e) => e.id === id); if (!src) return;
    const d = repeatDraft(src, preferences.trips as TravelTrip[], todayISO());
    setTxnType("expense"); setTitle(d.title); setMerchant(d.merchant); setCategory(d.category as Category); setScope(d.scope);
    setAmount(String(d.suggestedAmount)); setCurrency(d.currency); setPaymentMethod(d.paymentMethod as PaymentMethod);
    setAccountId(liveAccounts.some((a) => a.id === d.accountId) ? d.accountId : "none");
    setInstrumentId(savedMethods.some((p) => p.id === d.instrumentId) ? d.instrumentId : "none");
    setTags(d.tags.join(", ")); setDescription(d.description); setTripId(d.tripId); setDate(d.date);
    setWsSplit({ on: false, method: "fixed", values: {} }); setSplitOn(false); setShares({});
    setAutoFilled(new Set(["amount", "category", "merchant", "title"])); setRepeatedFrom(src.merchant || src.title); setRepeatOpen(false);
  };

  const applySpoken = async (text: string) => {
    if (!text.trim()) return;
    setReading(true); setStage({ kind: "voice", at: 0 });
    const req = latest.current.begin();
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = await parseSpoken({ data: { text, today, accounts: liveAccounts.map((a) => a.name) } });
      if (!req.isCurrent()) return;
      if (!r.ok) { toast.error(r.error); return; }
      setStage({ kind: "voice", at: 1 });
      const x = r.result;
      const filled = new Set<string>();
      setTxnType(x.txn_type);
      if (x.title) { setTitle(x.title); filled.add("title"); }
      if (x.merchant) { setMerchant(x.merchant); filled.add("merchant"); }
      if (x.amount && x.amount > 0) { setAmount(String(x.amount)); filled.add("amount"); }
      if (x.currency && /^[A-Z]{3}$/.test(x.currency)) { setCurrency(x.currency); filled.add("currency"); }
      if (x.date && isDate(x.date)) { setDate(x.date); filled.add("date"); }
      if (x.category) { setCategory(x.category); filled.add("category"); }
      if (x.payment_method) { setPaymentMethod(x.payment_method); filled.add("paymentMethod"); }
      if (x.scope) { setScope(x.scope); filled.add("scope"); }
      const accountName = x.account_name;
      const acc = accountName && liveAccounts.find((a) => a.name.toLowerCase() === accountName.toLowerCase());
      if (acc) setAccountId(acc.id);
      setAutoFilled(filled);
      toast.success("Filled in from what you said — check and save");
    } catch { if (req.isCurrent()) toast.error("Couldn't understand that — try again or type the details"); } finally { if (req.isCurrent()) { setReading(false); setStage(null); } }
  };

  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) { toast.message("Voice isn't available in this browser — type it below instead"); return; }
    const rec = new SR();
    rec.lang = "en-IN"; rec.interimResults = false;
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript ?? ""; setSpoken(t); void applySpoken(t); };
    rec.onend = () => setListening(false);
    rec.onerror = () => { setListening(false); toast.error("Didn't catch that — try again or type it"); };
    setListening(true); rec.start();
  };

  useEffect(() => {
    if (!editing) return;
    setReceiptDetails(editing.receiptDetails ?? {});
    setTitle(editing.title); setMerchant(editing.merchant ?? ""); setAmount(String(editing.originalAmount)); setCurrency(editing.currency);
    setPaymentMethod(editing.paymentMethod); setCategory(editing.category); setDate(editing.date); setDescription(editing.description);
    setScope(editing.scope); setMemberId(editing.memberId ?? "me");
    const wa = editing.workspaceAllocations ?? [];
    setWsSplit(wa.length > 1 ? { on: true, method: "fixed", values: Object.fromEntries(wa.map((x) => [x.workspace, String(x.amount)])) } : { on: false, method: "fixed", values: {} });
    setTxnType(editing.txnType ?? "expense"); setAccountId(editing.accountId ?? "none"); setInstrumentId(editing.paymentInstrumentId ?? "none"); setToAccountId(editing.toAccountId ?? "none"); setTags((editing.tags ?? []).join(", "));
    setTripId(editing.tripId ?? "none"); setPrincipal(editing.principal == null ? "" : String(editing.principal)); setInterest(editing.interest == null ? "" : String(editing.interest));
    setSplitOn(editing.splits.length > 0);
    setShares(Object.fromEntries(editing.splits.map((x) => [x.memberId ?? "me", String(x.amount)])));
  }, [editing]);

  // Live rate for the bill date
  useEffect(() => {
    if (currency === BASE_CURRENCY) { setFx({ rate: 1, date }); return; }
    if (!isDate(date)) return;
    let live = true;
    setFx(null);
    getFxRate({ data: { currency, date } })
      .then((r) => live && setFx(r.ok ? { rate: r.rate, date: r.date } : { error: r.error }))
      .catch(() => live && setFx({ error: "Couldn't load the exchange rate" }));
    return () => { live = false; };
  }, [currency, date]);

  const runExtraction = async (first: LocalReceipt, fresh: boolean) => {
    setReadTarget(first);
    setReadingError("");
    setScan(null);
    setScanCategory("");
    setConfirmed(false);
    setReviewApproval(""); setReviewDialog(false); setFieldChecks({});
    setReading(true); setStage({ kind: "receipt", at: 0 });
    const req = latest.current.begin();
    try {
      const prepared = await prepareForReading(first.dataUrl, first.type);
      if (!req.isCurrent()) return;
      setStage({ kind: "receipt", at: 1 });
      if (prepared.dataUrl.length > 4_000_000) throw new Error("This file is too large to read. Try a smaller photo or PDF, or enter the details yourself.");
      const res = await extract({ data: { ...prepared, includeItems } });
      if (!req.isCurrent()) return;
      if (!res.ok) throw new Error(res.error);
      setStage({ kind: "receipt", at: 2 });
      const x = res.result;
      setReceiptDetails({ subtotal: x.subtotal, tax: x.tax, tip: x.tip, roundOff: x.round_off != null && Math.abs(x.round_off) <= 1 ? x.round_off : null, confidence: receiptConfidence(x), items: x.items, text: x.text, fingerprint: first.fingerprint });
      const filled = new Set<string>();
      if (x.title && (fresh || !title)) { setTitle(x.title); filled.add("title"); }
      const merchantHint = suggestForEntry({ date: isDate(x.date) ? x.date : date, amount: x.amount ?? 0, currency: x.currency ?? currency, txnType: "expense", text: [x.merchant, x.description].filter(Boolean).join(" "), accountId: accountId === "none" ? null : accountId }, { transactions: expenses, accounts, categories: preferences.categories }).category;
      const categoryHint = merchantHint ?? x.category;
      setScanCategory(categoryHint && preferences.categories.some(c => !c.archived && c.name === categoryHint) ? categoryHint : "");
      if (x.payment_method) { setPaymentMethod(x.payment_method); filled.add("payment"); }
      if (x.description && (fresh || !description)) { setDescription(x.description); filled.add("description"); }
      if (x.scope) { setScope(x.scope); filled.add("scope"); }
      const cur = x.currency && /^[A-Z]{3}$/.test(x.currency.toUpperCase()) ? x.currency.toUpperCase() : currency;
      const readValues: ReceiptReadValues = { merchant: x.merchant ?? "", date: isDate(x.date) ? x.date : date, amount: x.amount ?? 0, currency: cur };
      setScanRead(readValues);
      const learned = learnedShopName(readValues.merchant, preferences.shopAliases, expenses.map((e) => e.merchant ?? "").filter(Boolean));
      setScan({ merchant: learned ?? readValues.merchant, date: readValues.date, amount: x.amount != null ? String(x.amount) : "", currency: cur });
      setAutoFilled(filled);
      setConfirmed(false);
      toast.success("Bill read — check the key details");
    } catch (error) {
      if (!req.isCurrent()) return;
      const message = error instanceof Error ? error.message : "";
      setReadingError(!message || /fetch|network|load failed/i.test(message) ? "Couldn't connect to receipt reading. Check your connection and try again, or enter the details manually." : message);
    } finally {
      if (req.isCurrent()) { setReading(false); setStage(null); }
    }
  };

  useEffect(() => { const f = takePendingScan(); if (!f) return; const dt = new DataTransfer(); f.forEach((x) => dt.items.add(x)); void onFiles(dt.files); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onFiles = async (files: FileList | null) => {
    if (!files?.length || reading || saving) return;
    const big = Array.from(files).find((f) => f.size > 5 * 1024 * 1024);
    if (big) { toast.error(`${big.name} is larger than 5 MB`); return; }
    let read: LocalReceipt[];
    try { read = await Promise.all(Array.from(files).map(readFile)); }
    catch { toast.error("Couldn't open that file. Choose it again or enter the details yourself."); return; }
    const first = read[0];
    if (!first) return;
    if (read.length > 1 && !editing) {
      // Bulk upload: one bill per entry — review and save each, the rest wait in line.
      setReceipts([first]);
      // Each extra bill becomes its own draft with its own receipt, never merged into this entry.
      let made = 0;
      for (const r of read.slice(1)) {
        try { const id = crypto.randomUUID(); const path = await uploadDraftReceipt(userId, id, r.file); await upsertDraft(id, userId, {}, [{ name: r.name, type: r.type, path, fingerprint: r.fingerprint }], "info_required"); made++; }
        catch { toast.error(`${r.name} couldn't be saved as a draft — add it again`); }
      }
      if (made) toast.message(`${made} more bill${made === 1 ? "" : "s"} saved to Drafts to finish later`);
    } else {
      setReceipts((r) => [...r, ...read]);
    }
    await runExtraction(first, false);
  };

  // Live receipt check: recomputed whenever an item, subtotal, tax, tip or the bill total is edited.
  const reviewTotal = Number(!confirmed && scan ? scan.amount : amount);
  const review = useMemo(() => receiptReviewCheck(reviewTotal, receiptDetails, currency), [reviewTotal, receiptDetails, currency]);
  const reviewSig = useMemo(() => receiptReviewSignature(reviewTotal, receiptDetails), [reviewTotal, receiptDetails]);
  const reviewMessages = [receiptBreakdownError(reviewTotal, receiptDetails, currency), review.itemTotalError].filter((m): m is string => !!m);

  const roundInfo = receiptRoundOff(reviewTotal, receiptDetails, currency);
  const roundAmt = roundInfo.printed || roundInfo.implied;
  const roundNote = roundAmt ? `Round-off ${roundAmt > 0 ? "+" : "−"}${Math.abs(roundAmt).toFixed(2)}${roundInfo.implied ? " (bill rounded to nearest whole amount)" : " (printed on bill)"}.` : "";
  const fieldValues: Record<ReceiptField, string> = { merchant: scan?.merchant.trim() ?? "", date: scan?.date ?? "", total: scan?.amount ?? "" };
  const corrected = scan ? correctedFields(scanRead, scan) : [];
  const fieldsToConfirm = unconfirmedFields(receiptDetails.confidence, fieldValues, fieldChecks).filter((f) => !corrected.includes(f));
  const readShown: Record<ReceiptField, string> = { merchant: scanRead?.merchant || "nothing", date: scanRead?.date || "nothing", total: scanRead ? String(scanRead.amount) : "" };
  const Corrected = ({ f }: { f: ReceiptField }) => !scan || !scanRead || !corrected.includes(f) ? null : (
    <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Corrected</span> (bill read {readShown[f]})
      <button type="button" className="text-primary underline" onClick={() => setScan({ ...scan, ...(f === "merchant" ? { merchant: scanRead.merchant } : f === "date" ? { date: scanRead.date } : { amount: String(scanRead.amount) }) })}>Undo</button></p>);
  const FIELD_LABEL: Record<ReceiptField, string> = { merchant: "merchant", date: "date", total: "total" };
  const FieldCheck = ({ f }: { f: ReceiptField }) => receiptDetails.confidence?.[f] !== "low" || corrected.includes(f) ? null : (
    <label className={cn("flex items-center gap-2 rounded-xl border-2 p-2 text-xs font-semibold", fieldChecks[f] === fieldValues[f] ? "border-border" : "border-warning bg-warning/10")}>
      <input type="checkbox" className="h-4 w-4" checked={fieldChecks[f] === fieldValues[f]} onChange={(e) => setFieldChecks((c) => ({ ...c, [f]: e.target.checked ? fieldValues[f] : undefined }))} />
      I've checked this {FIELD_LABEL[f]} against the receipt
    </label>);

  const confirmScan = (reviewApproved = false) => {
    if (!scan) return;
    if (!scan.merchant.trim()) { toast.error("Enter the merchant"); return; }
    if (!(Number(scan.amount) > 0)) { toast.error("Enter an amount greater than zero"); return; }
    if (!isDate(scan.date)) { toast.error("Enter the date"); return; }
    const breakdownError = receiptBreakdownError(Number(scan.amount), receiptDetails, currency);
    if (breakdownError) { toast.error(breakdownError); return; }
    if (fieldsToConfirm.length) { toast.error(`Confirm the ${fieldsToConfirm.map((f) => FIELD_LABEL[f]).join(", ")} — it was hard to read`); return; }
    if (!reviewApproved && review.needed && reviewApproval !== reviewSig) { setReviewDialog(true); return; }
    if (!preferences.categories.some(c => !c.archived && c.name === scanCategory)) { toast.error("Choose a category to confirm"); return; }
    setCategory(scanCategory);
    setMerchant(scan.merchant.trim()); rememberMerchant(scan.merchant.trim());
    if (scanRead?.merchant.trim() && corrected.includes("merchant")) {
      const from = scanRead.merchant.trim().toLowerCase().replace(/\s+/g, " "), to = scan.merchant.trim().toLowerCase().replace(/\s+/g, " ");
      if (from !== to && preferences.shopAliases?.[from] !== to) void savePreferences({ ...preferences, shopAliases: { ...preferences.shopAliases, [from]: to } }).catch(() => {});
    }
    if (!title.trim()) setTitle(scan.merchant.trim());
    setAmount(scan.amount);
    setDate(scan.date);
    setCurrency(scan.currency);
    if (scanRead) {
      const audit = buildReceiptAudit(scanRead, { merchant: scan.merchant, date: scan.date, amount: Number(scan.amount), currency: scan.currency }, new Date().toISOString());
      setReceiptDetails((d) => ({ ...d, audit }));
    }
    setAutoFilled((s) => new Set([...s, "merchant", "amount", "date", "currency", "category"]));
    setConfirmed(true);
  };

  const billIdentity = { merchant: !confirmed && scan ? scan.merchant : merchant, date: !confirmed && scan ? scan.date : date, amount: Number(!confirmed && scan ? scan.amount : amount), currency: !confirmed && scan ? scan.currency : currency };
  const duplicates = txnType === "expense" ? duplicateBills(billIdentity, expenses, edit) : [];
  const duplicateSignature = JSON.stringify([billIdentity, receipts.map(r => r.name), duplicates.map(e => e.id)]);
  const duplicateBlocked = duplicates.length > 0 && duplicateApproval !== duplicateSignature;
  // Statement Desk rules on this one entry: suggestions only, applied by tap, never saved on their own.
  const deskText = [merchant, title, description].filter(Boolean).join(" ");
  const desk = useMemo(() => suggestForEntry({ id: edit, date, amount: Number(amount) || 0, currency, txnType, text: deskText, accountId: accountId === "none" ? null : accountId }, { transactions: expenses, accounts, categories: preferences.categories }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deskText, date, amount, currency, txnType, accountId, expenses, accounts, preferences.categories, edit]);
  const deskCategory = desk.category && desk.category !== category && preferences.categories.some((c) => c.name === desk.category && !c.archived) ? desk.category : null;
  const deskAccount = desk.accountId && accountId === "none" ? acctNameOf(accounts, desk.accountId) : null;
  const deskType = desk.txnType && desk.txnType !== txnType ? desk.txnType : null;
  const deskMatches = desk.matches.filter((m) => !duplicates.some((d) => d.id === m.record.id));
  const matchSignature = JSON.stringify([date, amount, currency, accountId, deskMatches.map((m) => m.record.id)]);
  const matchBlocked = deskMatches.some((m) => m.exact) && matchApproval !== matchSignature;
  // Same receipt file already attached to another entry (by content fingerprint).
  const receiptReuse = txnType === "expense" && !editing ? receiptFingerprintMatches(receipts[0]?.fingerprint, expenses) : [];
  const receiptSignature = JSON.stringify([receipts[0]?.fingerprint, receiptReuse.map(e => e.id)]);
  const receiptBlocked = receiptReuse.length > 0 && receiptApproval !== receiptSignature;
  const advanceQueue = async () => {
    const [next, ...rest] = queue;
    setQueue(rest); setBatch(b => next && b ? { done: b.done + 1, total: b.total } : null);
    setFromInbox([]); setDuplicateApproval(""); setReceiptApproval(""); setReviewApproval(""); setReviewDialog(false); setFieldChecks({}); setReceipts(next ? [next] : []);
    setTitle(""); setMerchant(""); setAmount(""); setDescription(""); setTags("");
    setReceiptDetails({}); setScan(null); setScanRead(null); setConfirmed(true); setReadingError(""); setReadTarget(null); setAutoFilled(new Set()); setSplitOn(false); setShares({});
    if (next) await runExtraction(next, true);
  };

  const rememberMerchant = (m: string) => {
    if (editing) return;
    const found = suggestForMerchant(m, expenses);
    if (!found) return;
    const rule = shopRuleFor(m, preferences.shopRules, preferences.shopAliases);
    const ruled = applyShopRule({ category: found.category, accountId: found.accountId ?? null, paymentMethod: found.paymentMethod, scope: found.scope }, rule).value;
    const hit = { ...found, category: ruled.category ?? "", accountId: ruled.accountId ?? null, paymentMethod: ruled.paymentMethod ?? "", scope: (ruled.scope ?? "") as typeof found.scope };
    const filled = new Set(autoFilled);
    if (preferences.categories.some(c=>c.name===hit.category && !c.archived)) { setCategory(hit.category as Category); filled.add("category"); }
    if ((PAYMENT_METHODS as readonly string[]).includes(hit.paymentMethod)) { setPaymentMethod(hit.paymentMethod as PaymentMethod); filled.add("paymentMethod"); }
    if (hit.scope === "business" || hit.scope === "personal") { setScope(hit.scope); filled.add("scope"); }
    if (!accountByUser.current && hit.accountId && liveAccounts.some((a) => a.id === hit.accountId)) setAccountId(hit.accountId);
    const usual = accountByUser.current || rule?.accountId || rule?.paymentMethod ? null : lastInstrumentForMerchant(m, expenses, savedMethods);
    if (usual) { pickInstrument(usual.id); filled.add("paymentMethod"); }
    if (hit.tags.length && !tags.trim()) setTags(hit.tags.join(", "));
    setAutoFilled(filled);
    toast.message(`Filled in from your last ${m} entry`);
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!confirmed) { toast.error("Confirm the scanned bill details first"); return; }
    if (duplicateBlocked) { toast.error("Review the possible duplicate or skip this bill"); return; }
    if (receiptBlocked) { toast.error("This receipt is already used — review it or choose a different file"); return; }
    const breakdownError = receiptBreakdownError(Number(amount), receiptDetails, currency);
    if (breakdownError) { toast.error(breakdownError); return; }
    if (saving) return;
    setSaving(true); setSaveError("");
    try {
      const finalDetails: ReceiptDetails = { ...receiptDetails };
      // Keep the unprinted rounding with the receipt so its parts always add up to the saved total later.
      const implied = receiptRoundOff(Number(amount), receiptDetails, currency).implied;
      if (implied) finalDetails.roundOff = implied;
      const fp = receipts[0]?.fingerprint ?? receiptDetails.fingerprint;
      if (fp) finalDetails.fingerprint = fp;
      const workspaceAllocations = splitShares(wsSplit, Number(amount));
      const wsErr = wsSplit.on ? validateShares(workspaceAllocations, Number(amount)) : null;
      if (wsErr) throw new Error(wsErr);
      const createId = editing ? undefined : draftId.current;
      await save(
        { title: title.trim(), amount: Number(amount), currency, paymentMethod, category, date, description, merchant: merchant.trim() || null,
          receiptDetails: finalDetails, workspaceAllocations, scope: wsSplit.on ? (workspaceAllocations.slice().sort((a, b) => b.amount - a.amount)[0]?.workspace ?? scope) : scope, memberId: memberId === "me" ? null : memberId,
          txnType, accountId: accountId === "none" ? null : accountId, paymentInstrumentId: instrumentId === "none" ? null : instrumentId, payeeId: !isMove(txnType) ? (preferences.payees ?? []).find(p => !p.archived && p.name === merchant.trim())?.id ?? null : null, toAccountId: toAccountId === "none" ? null : toAccountId,
          tripId: tripId === "none" ? null : tripId,
          principal: principal.trim() === "" ? null : Number(principal), interest: interest.trim() === "" ? null : Number(interest),
          tags: [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))],
          splits: splitOn ? Object.entries(shares).map(([k, v]) => ({ memberId: k === "me" ? null : k, amount: Number(v) })) : [] },
        { ...(editing ? { id: editing.id } : {}), ...(createId ? { createId } : {}), files: receipts.map((r) => r.file) },
      );
      if (createId && ctxTrip && search.booking) {
        // A payment can cover part of a booking: keep every linked entry and only call it paid once they add up.
        await savePreferences({ ...preferences, trips: (preferences.trips as TravelTrip[]).map((t) => t.id !== ctxTrip.id ? t : { ...t, bookings: (t.bookings ?? []).map((b) => {
          if (b.id !== search.booking) return b;
          const covered = bookingPaid(b, expenses) + Number(amount) >= b.amount - 0.005;
          return { ...b, expenseId: b.expenseId ?? createId, expenseIds: [...new Set([...bookingPaymentIds(b), createId])], status: covered ? "paid" as const : b.status };
        }) }) });
      }
      for (const id of fromInbox) { const d = documents.find((x) => x.id === id); if (d) await removeDocument(d).catch(() => {}); }
      if (createId && draftExists.current) await completeDraft({ id: draftId.current, receipts: receipts.filter((r) => r.path).map((r) => ({ name: r.name, type: r.type, path: r.path! })) }, createId).catch(() => {});
      draftExists.current = false;
      await removeLocalDraft(userId, draftId.current).catch(() => {});
      toast.success(editing ? "Entry updated" : `${TXN_LABEL[txnType]} saved successfully`);
      draftId.current = crypto.randomUUID();
      if (!editing && queue.length) {
        await advanceQueue();
        return;
      }
      setBatch(null);
      if (editing || search.trip || search.booking) returnAfterReview(router.history, () => { void nav({ to: editing ? "/expenses" : "/dashboard" }); });
      else void nav({ to: "/dashboard" });
    } catch (e) {
      const m = (e as Error).message || "";
      // A timeout doesn't prove the write failed; retrying re-uses the same id, so it can't duplicate.
      setSaveError(/fetch|network|timeout|load failed/i.test(m) ? "We couldn't confirm the save. Your details are kept — tap Retry; it won't create a second entry." : m || "Couldn't save. Your details are kept — tap Retry.");
    } finally {
      setSaving(false);
    }
  };

  const people = [{ id: "me", name: "Me" }, ...members];
  const splitLeft = Math.round(((Number(amount) || 0) - Object.values(shares).reduce((a, v) => a + (Number(v) || 0), 0)) * 100) / 100;
  const af = (k: string) => autoFilled.has(k) && <Sparkles className="ml-1 inline h-3 w-3 text-primary" aria-label="Auto-filled" />;
  const converted = fx && "rate" in fx && Number(amount) > 0 ? convert(Number(amount), fx.rate) : null;

  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
  const toggleTag = (v: string) => setTags((tagList.includes(v) ? tagList.filter((x) => x !== v) : [...tagList, v]).join(", "));
  const tagCounts = new Map<string, number>();
  for (const e of expenses) for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const frequentTags = preferences.tags.map(tagValue).filter((v) => tagCounts.has(v)).sort((a, b) => (tagCounts.get(b) ?? 0) - (tagCounts.get(a) ?? 0)).slice(0, 6);
  const tagGroups = [...new Set(preferences.tags.map((t) => t.group || "Other"))];
  const categoryNames = [...new Set([...(editing ? [category] : []), ...preferences.categories.filter((c) => !c.archived).map((c) => c.name)])];
  const catOrder = recentFirst(categoryNames, expenses, (p) => p.category);
  const acctOrder = recentFirst(liveAccounts.map((a) => a.id), expenses, (p) => p.accountId);
  const acctById = new Map(liveAccounts.map((a) => [a.id, a]));
  const sections = relevantSections({ txnType, scope, split: wsSplit.on, currency, baseCurrency: BASE_CURRENCY, onTrip: !!ctxTrip || tripId !== "none" || tagList.some((t) => t.startsWith("trip:")) });
  const today = dayShortcut(0); const yesterday = dayShortcut(1);
  const methodNote = instrumentId !== "none" ? savedMethods.find((p) => p.id === instrumentId) : undefined;
  const fieldCls = "h-11 rounded-xl";
  /** "IDFC Krupa 10178745345" + Savings → "IDFC Krupa · Savings ••5345" so the row stays readable. */
  const shortAccount = (name: string, kind: string) => { const digits = name.match(/\d{4,}/g)?.pop(); const base = name.replace(/\b\d{4,}\b/g, "").replace(/\s+/g, " ").trim(); return `${base || name} · ${kind}${digits ? ` ••${digits.slice(-4)}` : ""}`; };

  return (
    <div className="receipt-desk -mx-4 min-h-dvh px-4 pb-2 sm:-mx-8 sm:px-8">
      <header className="receipt-desk sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-2 px-3 py-2 sm:-mx-8 sm:px-6">
        <Button type="button" size="icon" variant="ghost" className="text-receipt-desk-foreground hover:bg-receipt-chip hover:text-receipt-desk-foreground" aria-label="Close" onClick={() => close()}><X className="h-5 w-5" /></Button>
        <h1 className="font-display text-lg font-bold">{editing ? "Edit entry" : `New ${TXN_LABEL[txnType].toLowerCase()}`}</h1>
        {!editing && <span aria-live="polite" className="hidden text-[11px] opacity-70 min-[380px]:inline">{draftState === "saving" ? "Saving draft…" : draftState === "uploading" ? "Uploading receipt…" : draftState === "saved" ? "Draft saved" : draftState === "device" ? "Saved on this device · syncs when online" : draftState === "error" ? <span className="text-destructive">Draft not saved</span> : ""}</span>}
        <div className="ml-auto w-36">
          <Select value={txnType} onValueChange={(v) => setTxnType(v as TxnType)}>
            <SelectTrigger aria-label="Transaction type" className="h-9 rounded-full border-0 bg-receipt-chip text-receipt-desk-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{TXN_TYPES.map((t) => <SelectItem key={t} value={t}>{TXN_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </header>
      <form onSubmit={submit} className="mx-auto grid max-w-xl gap-3">
        {/* Amount */}
        <div className="receipt-paper px-5 text-center">
          <p aria-hidden className="text-xs font-semibold tracking-[0.2em] text-[color:var(--receipt-muted)]">{editing ? "EDIT ENTRY" : `NEW ${TXN_LABEL[txnType].toUpperCase()}`}</p>
          <div aria-hidden className="receipt-rule my-3" />
          <Label htmlFor="a" className="sr-only">Amount{af("amount")}</Label>
          <div className="mt-1 flex items-center justify-center gap-2">
            <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!confirmed || reading || saving}
              className="rounded-full border-0 bg-[color:var(--receipt-rule)]/20 px-2.5 py-1 text-sm font-semibold">{[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <input id="a" inputMode="decimal" enterKeyHint="done" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} type="number" step="0.01" min="0" placeholder="0" value={amount} disabled={!confirmed || reading || saving}
              onChange={(e) => setAmount(e.target.value)} className="w-full min-w-0 max-w-[14rem] appearance-none bg-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none receipt-amount text-center text-6xl font-bold tracking-tight outline-none placeholder:opacity-40" style={{ borderBottom: 0 }} />
          </div>
          {Number(amount) > 0 && <p className="mt-1 text-xs text-muted-foreground">{money(Number(amount), currency)}</p>}
          {currency !== BASE_CURRENCY && (
            <p className="mt-1 text-xs" aria-live="polite">
              {fx === null ? <span className="text-muted-foreground">Fetching rate for {date}…</span>
                : "error" in fx ? <span className="text-destructive">{fx.error}</span>
                : <span title={`1 ${currency} = ${fx.rate.toFixed(4)} INR · rate of ${fx.date}`}>≈ <span className="font-mono font-semibold">{converted != null ? money(converted) : "—"}</span> <span className="text-muted-foreground">· rate in More details</span></span>}
            </p>
          )}
          <div aria-hidden className="receipt-rule mt-3" />
        </div>

        {/* Quick capture */}
        <div className="order-first grid grid-cols-4 gap-2 pb-2">
          <Button type="button" disabled={reading || saving} variant="ghost" aria-label="Scan and fill" className="receipt-chip rounded-full mx-auto aspect-square h-auto w-16 flex-col gap-0.5" onClick={() => cameraRef.current?.click()}><Camera className="h-5 w-5" /><span className="text-[11px]">Scan</span></Button>
          <Popover>
            <PopoverTrigger asChild><Button type="button" disabled={reading || saving} variant="ghost" aria-label="Upload a receipt" className="receipt-chip rounded-full mx-auto aspect-square h-auto w-16 flex-col gap-0.5"><FolderOpen className="h-5 w-5" /><span className="text-[11px]">Upload</span></Button></PopoverTrigger>
            <PopoverContent className="grid w-44 gap-1 p-1.5">
              <Button type="button" variant="ghost" className="justify-start" onClick={() => galleryRef.current?.click()}><ImageIcon className="h-4 w-4" />Photos</Button>
              <Button type="button" variant="ghost" className="justify-start" onClick={() => fileRef.current?.click()}><FolderOpen className="h-4 w-4" />Files / PDF</Button>
            </PopoverContent>
          </Popover>
          <Button type="button" disabled={reading || saving} variant={listening ? "gold" : "ghost"} aria-label="Speak an entry" className={cn("mx-auto aspect-square h-auto w-16 flex-col gap-0.5 rounded-full", !listening && "receipt-chip")} onClick={() => { setVoiceOpen(true); startVoice(); }}><Mic className="h-5 w-5" /><span className="text-[11px]">{listening ? "Listening" : "Voice"}</span></Button>
          <Button type="button" disabled={reading || saving || !!editing} variant={repeatOpen ? "gold" : "ghost"} aria-label="Repeat an expense" aria-expanded={repeatOpen} className={cn("mx-auto aspect-square h-auto w-16 flex-col gap-0.5 rounded-full", !repeatOpen && "receipt-chip")} onClick={() => setRepeatOpen((o) => !o)}><Repeat className="h-5 w-5" /><span className="text-[11px]">Repeat</span></Button>
        </div>
        {repeatOpen && (
          <section aria-label="Repeat an expense" className="rounded-2xl border bg-card p-2 text-sm">
            {repeatList.favourites.length + repeatList.recent.length === 0 ? <p className="p-2 text-muted-foreground">No past expenses to repeat yet.</p> : (
              <ul className="divide-y">
                {[...repeatList.favourites.map((e) => ({ e, fav: true })), ...repeatList.recent.map((e) => ({ e, fav: favs.includes(e.id) }))].map(({ e, fav }) => (
                  <li key={e.id} className="flex items-center gap-1">
                    <button type="button" onClick={() => applyRepeat(e.id)} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left hover:bg-secondary">
                      <span className="block truncate font-semibold">{e.merchant || e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{e.category} · {money(e.originalAmount, e.currency)} · {e.date}</span>
                    </button>
                    <Button type="button" size="icon" variant="ghost" aria-label={fav ? `Remove ${e.merchant || e.title} from favourites` : `Add ${e.merchant || e.title} to favourites`} aria-pressed={fav} onClick={() => toggleFav(e.id)}>
                      <Star className={cn("h-4 w-4", fav ? "fill-gold text-gold" : "text-muted-foreground")} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {repeatedFrom && !repeatOpen && <p role="status" className="rounded-2xl bg-gold-soft px-3 py-2 text-xs">Copied from your last <b>{repeatedFrom}</b> entry with today's date. Adjust the amount and tap Save — nothing is saved until you do.</p>}
        <Label className="flex items-center gap-2 text-sm text-receipt-desk-foreground/85"><input type="checkbox" checked={includeItems} disabled={reading || saving} onChange={e => setIncludeItems(e.target.checked)} />Extract receipt items</Label>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo of a receipt" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        <input ref={galleryRef} type="file" multiple accept="image/*" className="sr-only" aria-label="Choose receipt photos" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} id="r" type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Choose receipt files" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} />
        {reading && stage?.kind === "receipt" && <ProcessingPanel title="Reading your receipt…" stages={stagesAt(["Preparing image", "Reading document", "Extracting details"], stage.at)} onRetry={readTarget ? () => { latest.current.cancel(); void runExtraction(readTarget, false); } : undefined} onCancel={() => { latest.current.cancel(); setReading(false); setStage(null); setConfirmed(true); toast.message("Reading cancelled — receipt kept, enter details yourself"); }} />}
        {reading && stage?.kind === "voice" && <ProcessingPanel title="Understanding your expense…" stages={stagesAt(["Interpreting what you said", "Filling the form"], stage.at)} onCancel={() => { latest.current.cancel(); setReading(false); setStage(null); }} />}
        {reading && !stage && <p role="status" className="text-center text-sm font-semibold text-primary"><ScanLine className="mr-1 inline h-4 w-4" />Reading…</p>}
        {batch && <p className="text-center"><span className="rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">Bill {batch.done + 1} of {batch.total}{queue.length ? ` · ${queue.length} waiting` : ""}</span></p>}
        {(voiceOpen || listening || spoken) && (
          <div className="flex gap-2 rounded-2xl border bg-card p-1.5">
            <Input aria-label="Say or type an entry" placeholder='"Spent ₹2,500 on dinner using AMEX yesterday"' value={spoken} onChange={(e) => setSpoken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applySpoken(spoken); } }} className="border-0 shadow-none focus-visible:ring-0" />
            <Button type="button" variant="ghost" onClick={() => applySpoken(spoken)} disabled={!spoken.trim() || reading}>Fill</Button>
          </div>
        )}
        {inbox.length > 0 && (
          <details className="rounded-2xl border bg-card px-3 py-2 text-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Inbox className="h-4 w-4 text-gold" />Saved receipts to add ({inbox.length})</summary>
            <ul className="mt-1 divide-y">{inbox.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span className="min-w-0 truncate">{d.fileName}</span><span className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="outline" disabled={fromInbox.includes(d.id) || reading} onClick={() => void useSaved(d.id)}>Use</Button><Button type="button" size="icon" variant="ghost" aria-label={`Delete ${d.fileName}`} onClick={() => void removeDocument(d)}><X className="h-4 w-4" /></Button></span></li>)}</ul>
          </details>
        )}
        {receipts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {receipts.map((r, i) => (
              <span key={i} className="relative">
                {r.type.startsWith("image/") ? <img src={r.dataUrl} alt={r.name} className="h-14 w-12 rounded-lg border object-cover" /> : <span className="flex h-14 w-12 items-center justify-center rounded-lg border bg-muted p-1 text-center text-[9px]">{r.name}</span>}
                <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setReceipts((x) => x.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 rounded-full bg-ink p-0.5 text-ink-foreground"><X className="h-3 w-3" /></button>
              </span>
            ))}
            {!editing && fromInbox.length === 0 && <Button type="button" disabled={reading || saving} variant="ghost" size="sm" onClick={() => void saveForLater()}><Inbox className="mr-1 h-4 w-4" />Save for later</Button>}
            {editing && <Link to="/expenditure-statement" search={{ entry: editing.id }} className="self-center text-xs font-semibold text-primary underline">Generate statement</Link>}
          </div>
        )}

        {readingError && !reading && <section ref={reviewRef} role="alert" className="space-y-3 rounded-2xl border border-destructive/40 bg-card p-4">
          <h2 className="font-display font-bold">Receipt reading failed</h2>
          <p className="break-words text-sm text-muted-foreground">{readingError}</p>
          <p className="text-sm">Your receipt is still attached. No expense has been submitted.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!readTarget} onClick={() => { if (readTarget) void runExtraction(readTarget, false); }}><RotateCcw className="h-4 w-4" />Retry reading</Button>
            <Button type="button" onClick={() => { setReadingError(""); setScan(null); setConfirmed(true); }}><PencilLine className="h-4 w-4" />Enter details manually</Button>
          </div>
        </section>}
        {scan && confirmed && !reading && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-3 py-2"><p role="status" className="text-sm font-semibold">Receipt details confirmed</p><Button type="button" variant="ghost" size="sm" onClick={() => { setScan({ merchant, date, amount, currency }); setConfirmed(false); }}><PencilLine className="h-4 w-4" />Review again</Button></div>}
        {duplicates.length > 0 && !reading && <section aria-label="Possible duplicate bills" className="space-y-3 rounded-2xl border border-gold bg-gold-soft p-4">
          <h2 className="font-display font-bold">This bill may already exist</h2>
          <ul className="space-y-2 text-sm">{duplicates.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2"><span>{e.merchant} · {e.date} · {e.currency} {e.originalAmount.toFixed(2)}</span><Link to="/new" search={{ edit: e.id }} target="_blank" rel="noopener noreferrer" className="text-primary underline">Review existing entry</Link></li>)}</ul>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => void advanceQueue()}>Skip this bill</Button><Button type="button" size="sm" variant="secondary" disabled={!duplicateBlocked} onClick={() => setDuplicateApproval(duplicateSignature)}>{duplicateBlocked ? "Keep as a separate bill" : "Separate bill confirmed"}</Button></div>
        </section>}
        {!reading && confirmed && desk.transferDuplicate && <section role="alert" aria-label="Possible transfer duplicate" className="space-y-1 rounded-2xl border border-warning/50 bg-card p-3 text-sm">
          <h2 className="font-semibold">This may repeat a transfer you already saved</h2>
          <p className="text-muted-foreground">{acctNameOf(accounts, desk.transferDuplicate.accountId!)} → {acctNameOf(accounts, desk.transferDuplicate.toAccountId!)} · {desk.transferDuplicate.date} · {desk.transferDuplicate.currency} {desk.transferDuplicate.amount.toFixed(2)}. Money moved between your own accounts isn't spending or income — saving this too would count it twice.</p>
          <Link to="/new" search={{ edit: desk.transferDuplicate.id }} className="font-semibold text-primary underline">Open the transfer</Link>
        </section>}
        {!reading && confirmed && (deskCategory || deskAccount || deskType || desk.opposite) && <section aria-label="Statement Desk suggestions" className="space-y-2 rounded-2xl border bg-card p-3 text-sm">
          <h2 className="font-semibold"><Sparkles className="mr-1 inline h-4 w-4 text-primary" />Suggestions (same rules as Statement Desk)</h2>
          <ul className="space-y-1.5">
            {deskCategory && <li className="flex flex-wrap items-center justify-between gap-2"><span>Category: <b>{deskCategory}</b> <span className="text-muted-foreground">· {desk.categoryReason}</span></span><Button type="button" size="sm" variant="outline" onClick={() => { setCategory(deskCategory as Category); setAutoFilled((x) => new Set([...x, "category"])); }}>Use</Button></li>}
            {deskAccount && <li className="flex flex-wrap items-center justify-between gap-2"><span>Account: <b>{deskAccount}</b> <span className="text-muted-foreground">· {desk.accountReason}</span></span><Button type="button" size="sm" variant="outline" onClick={() => { setAccountId(desk.accountId!); setAutoFilled((x) => new Set([...x, "payment"])); }}>Use</Button></li>}
            {deskType && <li className="flex flex-wrap items-center justify-between gap-2"><span>Looks like a <b>{TXN_LABEL[deskType].toLowerCase()}</b>{desk.toAccountId ? <> to <b>{acctNameOf(accounts, desk.toAccountId)}</b></> : null} <span className="text-muted-foreground">· {desk.typeReason}</span></span><Button type="button" size="sm" variant="outline" onClick={() => { setTxnType(deskType); if (desk.toAccountId) setToAccountId(desk.toAccountId); }}>Use</Button></li>}
            {desk.opposite && <li className="flex flex-wrap items-center justify-between gap-2"><span>The other side is already saved: <b>{desk.opposite.name}</b> · {desk.opposite.date} · {desk.opposite.currency} {desk.opposite.amount.toFixed(2)}. Open it and set both accounts instead of saving a second copy.</span><Link to="/new" search={{ edit: desk.opposite.id }} className="text-primary underline">Open it</Link></li>}
          </ul>
          <p className="text-xs text-muted-foreground">Nothing changes until you tap Use and then Save.</p>
        </section>}
        {!reading && deskMatches.length > 0 && <section aria-label="Possible matching entries" className="space-y-3 rounded-2xl border border-gold bg-gold-soft p-4">
          <h2 className="font-display font-bold">This may already be saved</h2>
          <ul className="space-y-2 text-sm">{deskMatches.map((m) => <li key={m.record.id} className="flex flex-wrap items-center justify-between gap-2"><span><b>{m.record.name}</b> · {m.record.date} · {m.record.currency} {m.record.amount.toFixed(2)} <span className="text-muted-foreground">· {m.exact ? "Strong match" : "Possible match"}: {m.reasons.slice(0, 3).join(", ")}</span></span><Link to="/new" search={{ edit: m.record.id }} className="text-primary underline">Open existing</Link></li>)}</ul>
          <Button type="button" size="sm" variant="secondary" disabled={!matchBlocked} onClick={() => setMatchApproval(matchSignature)}>{matchBlocked ? "It's separate — save anyway" : deskMatches.some((m) => m.exact) ? "Separate entry confirmed" : "Save allowed — check it is separate"}</Button>
        </section>}
        {batch && duplicates.length === 0 && <Button type="button" variant="ghost" size="sm" disabled={reading || saving} onClick={() => void advanceQueue()}>Skip this bill</Button>}
        {receiptReuse.length > 0 && !reading && <section aria-label="Receipt already used" className="space-y-3 rounded-2xl border border-gold bg-gold-soft p-4">
          <h2 className="font-display font-bold">This receipt is already attached to another entry</h2>
          <ul className="space-y-2 text-sm">{receiptReuse.map(e => <li key={e.id} className="flex flex-wrap items-center justify-between gap-2"><span>{e.merchant ?? e.title} · {e.date} · {e.currency} {e.originalAmount.toFixed(2)}</span><Link to="/new" search={{ edit: e.id }} target="_blank" rel="noopener noreferrer" className="text-primary underline">Review existing entry</Link></li>)}</ul>
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { setReceipts([]); setReceiptDetails({}); setScan(null); setScanRead(null); setConfirmed(true); setReceiptApproval(""); setReviewApproval(""); setReviewDialog(false); setFieldChecks({}); }}>Remove this receipt</Button><Button type="button" size="sm" variant="secondary" disabled={!receiptBlocked} onClick={() => setReceiptApproval(receiptSignature)}>{receiptBlocked ? "Use this receipt anyway" : "Reused receipt confirmed"}</Button></div>
        </section>}
        {scan && !reading && !confirmed && (
          <section ref={reviewRef} className={cn("rounded-3xl border-2 border-primary bg-card p-4 shadow-float", receipts[0] && "lg:grid lg:w-[min(64rem,calc(100vw-4rem))] lg:grid-cols-2 lg:gap-5 lg:justify-self-center")} role="group" aria-label="Review scanned details">
            {receipts[0] && <div className="mb-4 lg:mb-0"><div className="lg:sticky lg:top-4"><div className="mb-2 font-display font-bold">Original receipt</div><ReceiptZoomViewer src={receipts[0].dataUrl} type={receipts[0].type} name={receipts[0].name} /></div></div>}
            <div className="min-w-0 space-y-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-display font-bold">Check what we read</div><p className="text-xs text-muted-foreground">Tap the shop, date or total to correct it, then confirm.</p></div>
              <Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={() => { setScan(null); setScanRead(null); setScanCategory(""); setReceiptDetails({}); setReviewApproval(""); setReviewDialog(false); setFieldChecks({}); setConfirmed(true); }}>Discard</Button></div>
            <div className="grid gap-1"><Label htmlFor="sm">Merchant</Label><Input id="sm" value={scan.merchant} onChange={(e) => setScan({ ...scan, merchant: e.target.value })} /><ReadingIndicator value={receiptDetails.confidence?.merchant ?? "unknown"} /><FieldCheck f="merchant" /><Corrected f="merchant" /></div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3">
              <div className="grid min-w-0 gap-1"><Label htmlFor="sd">Date</Label><Input id="sd" type="date" className="h-10 w-full min-w-0 appearance-none" value={scan.date} onChange={(e) => setScan({ ...scan, date: e.target.value })} /><ReadingIndicator value={receiptDetails.confidence?.date ?? "unknown"} /><FieldCheck f="date" /><Corrected f="date" /></div>
              <div className="grid min-w-0 gap-1"><Label>Currency</Label>
                <Select value={scan.currency} onValueChange={(v) => setScan({ ...scan, currency: v })}>
                  <SelectTrigger aria-label="Scanned currency" className="h-10 w-full min-w-0"><SelectValue /></SelectTrigger>
                  <SelectContent>{[...new Set([scan.currency, ...CURRENCIES])].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1"><Label htmlFor="sa">Total on bill</Label><Input id="sa" type="number" step="0.01" min="0" className="font-mono" value={scan.amount} onChange={(e) => setScan({ ...scan, amount: e.target.value })} /><ReadingIndicator value={receiptDetails.confidence?.total ?? "unknown"} /><FieldCheck f="total" /><Corrected f="total" /></div>
            <div className="grid gap-1"><Label htmlFor="receipt-subtotal">Subtotal before tax and tip</Label><Input id="receipt-subtotal" type="number" min="0" step="0.01" value={receiptDetails.subtotal ?? ""} onChange={e=>setReceiptDetails({...receiptDetails,subtotal:e.target.value===""?null:Number(e.target.value)})}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1"><Label htmlFor="receipt-tax">Tax included</Label><Input id="receipt-tax" type="number" min="0" step="0.01" value={receiptDetails.tax ?? ""} onChange={e=>setReceiptDetails({...receiptDetails,tax:e.target.value===""?null:Number(e.target.value)})}/></div>
              <div className="grid gap-1"><Label htmlFor="receipt-tip">Tip included</Label><Input id="receipt-tip" type="number" min="0" step="0.01" value={receiptDetails.tip ?? ""} onChange={e=>setReceiptDetails({...receiptDetails,tip:e.target.value===""?null:Number(e.target.value)})}/></div>
            </div>
            {reviewMessages.length > 0 ? <p role="alert" className="text-sm text-destructive">{reviewMessages.join(" ")}</p> : <p role="status" className="text-xs text-muted-foreground">{receiptDetails.subtotal == null ? "Subtotal not read — total comparison unavailable." : "Subtotal + tax + tip matches the total."}{roundNote ? ` ${roundNote}` : ""}</p>}
            <div className="grid gap-1"><Label>Suggested category</Label><Select value={scanCategory} onValueChange={setScanCategory}><SelectTrigger aria-label="Receipt category"><SelectValue placeholder="Choose category" /></SelectTrigger><SelectContent>{categoryNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            {(receiptDetails.items?.length ?? 0) > 0 && <details open className="min-w-0 text-sm"><summary className="cursor-pointer font-semibold">Receipt items ({receiptDetails.items?.length}){review.items.length > 0 ? ` · ${review.items.length} need your check` : ""}</summary><p className="mt-1 text-xs text-muted-foreground">{review.items.length > 0 ? "Highlighted items were hard to read — check them before saving." : "Every item read clearly."}</p><div className="mt-2 max-h-72 space-y-3 overflow-y-auto">{(receiptDetails.items ?? []).map((item,i)=>{const flagged=review.items.includes(i);const reasons=receiptItemReviewReasons(item);return <div key={i} className={cn("grid min-w-0 grid-cols-2 gap-2",flagged?"rounded-2xl border-2 border-warning bg-warning/10 p-2":"border-b pb-3")}><div className="col-span-2"><Label htmlFor={`item-name-${i}`}>Item {i+1} name</Label><Input id={`item-name-${i}`} value={item.name} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,name:e.target.value}:x)})}/><ReadingIndicator field={`Item ${i+1} name confidence`} value={receiptItemConfidence(item).name}/></div><div><Label htmlFor={`item-quantity-${i}`}>Item {i+1} quantity</Label><Input id={`item-quantity-${i}`} type="number" min="0" value={item.quantity} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,quantity:Number(e.target.value)}:x)})}/></div><div><Label htmlFor={`item-amount-${i}`}>Item {i+1} amount</Label><Input id={`item-amount-${i}`} type="number" min="0" step="0.01" value={item.amount} onChange={e=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).map((x,j)=>j===i?{...x,amount:Number(e.target.value)}:x)})}/><ReadingIndicator field={`Item ${i+1} amount confidence`} value={receiptItemConfidence(item).amount}/></div>{flagged && <p role="status" className="col-span-2 text-xs font-semibold text-warning">Check the {reasons.join(" and ")} of this item</p>}<Button type="button" variant="ghost" size="sm" className="col-span-2 justify-self-end" aria-label={`Remove item ${i+1}`} onClick={()=>setReceiptDetails({...receiptDetails,items:(receiptDetails.items ?? []).filter((_,j)=>j!==i)})}><X className="h-4 w-4"/>Remove</Button></div>;})}</div></details>}
            {includeItems && !receiptDetails.items?.length && <p className="text-xs text-muted-foreground">No readable receipt items found.</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setScan(null); setConfirmed(true); }}>Enter manually</Button>
              <Button type="button" size="sm" onClick={() => confirmScan()}>Confirm details</Button>
            </div>
            </div>
          </section>
        )}
        <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Check these receipt items before saving</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              {review.items.map((i) => { const item = receiptDetails.items?.[i]; if (!item) return null; return <p key={i}><b>Item {i + 1}</b> · {item.name || "unnamed"} · {item.amount.toFixed(2)} <span className="text-muted-foreground">— the {receiptItemReviewReasons(item).join(" and ")} was hard to read</span></p>; })}
              {review.itemTotalError && <p>{review.itemTotalError}</p>}
              <p className="text-xs text-muted-foreground">Nothing is saved until you confirm these details.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setReviewDialog(false)}>Go back and check</Button>
              <Button type="button" onClick={() => { setReviewApproval(reviewSig); setReviewDialog(false); confirmScan(true); }}>I{"'"}ve checked these items</Button>
            </div>
          </DialogContent>
        </Dialog>

        <fieldset disabled={!confirmed || reading || saving} className={cn("receipt-paper grid min-w-0 gap-3 px-5", !confirmed && "opacity-50")}>
          {TYPE_HINT[txnType] && <p className="text-xs text-muted-foreground">{TYPE_HINT[txnType]}</p>}
          {defaultsNote && !editing && txnType === "expense" && <div role="status"><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles aria-hidden className="h-3 w-3 text-primary" />{defaultsNote.basis === "merchant" ? `Filled with what you usually choose for ${defaultsNote.merchant}` : "Filled with your usual choices"}</p>{defaultsNote.reasons.length > 0 && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer underline-offset-2 hover:underline">Why these choices?</summary><ul className="mt-1 grid gap-1">{defaultsNote.reasons.map((r) => <li key={r.label}><b className="text-foreground">{r.label}: {r.value}</b> — {r.reason ? <>chosen in {r.reason.matches} of your last {r.reason.lookedAt} {defaultsNote.basis === "merchant" ? `${defaultsNote.merchant} ` : ""}expenses{r.reason.examples.length ? `, most recently ${r.reason.examples.map((x) => `${x.merchant ?? "an expense"} on ${x.date}`).join(", ")}` : ""}.</> : "set by your rule for this shop."}</li>)}</ul><Link to="/settings" hash="smart-defaults" className="mt-1 inline-block underline">Change smart defaults or this shop's rules</Link></details>}</div>}
          {!isMove(txnType)&&<PayeePicker payees={preferences.payees??[]} merchant={merchant} onSelect={setMerchant}/>}
          {/* Category */}
          {!isMove(txnType) && (
            <div className="receipt-row">
              <Label>Category{af("category")}</Label>
              <Popover open={catOpen} onOpenChange={setCatOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" aria-label="Category" className={cn(fieldCls, "justify-between font-normal")}>{category}<ChevronDown className="h-4 w-4 opacity-60" /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search categories" />
                    <CommandList>
                      <CommandEmpty>No category found.</CommandEmpty>
                      {catOrder.recent.length > 0 && <CommandGroup heading="Recent">{catOrder.recent.map((c) => <CommandItem key={`r-${c}`} value={`recent ${c}`} onSelect={() => { setCategory(c as Category); setCatOpen(false); }}>{c}{c === category && <Check className="ml-auto h-4 w-4" />}</CommandItem>)}</CommandGroup>}
                      <CommandGroup heading="All categories">{catOrder.rest.map((c) => <CommandItem key={c} value={c} onSelect={() => { setCategory(c as Category); setCatOpen(false); }}>{c}{c === category && <Check className="ml-auto h-4 w-4" />}</CommandItem>)}</CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
          {/* Paid with = the real account affected */}
          <div className="grid gap-3">
            <div className="receipt-row">
              <Label>{isMove(txnType) ? "From account" : txnType === "advance" ? "Received into" : txnType === "advance_settlement" ? "Returned from" : txnType === "income" ? "Into account" : "Paid with"}{af("payment")}</Label>
              <Select value={accountId} onValueChange={(v) => { accountByUser.current = true; setAccountId(v); setAutoFilled((x) => { const n = new Set(x); n.delete("payment"); return n; }); }}>
                <SelectTrigger aria-label="Account" className={fieldCls}><SelectValue>{accountId !== "none" && acctById.get(accountId) ? shortAccount(acctById.get(accountId)!.name, ACCOUNT_LABEL[acctById.get(accountId)!.kind]) : "Choose account"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose account</SelectItem>
                  {[...acctOrder.recent, ...acctOrder.rest].map((id) => { const a = acctById.get(id)!; return <SelectItem key={id} value={id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</SelectItem>; })}
                </SelectContent>
              </Select>
              <button type="button" onClick={() => setAddAcct(true)} className="justify-self-start text-xs font-semibold text-primary underline">+ Add account</button>
              <Dialog open={addAcct} onOpenChange={setAddAcct}>
                <DialogContent><DialogHeader><DialogTitle>Add account</DialogTitle></DialogHeader>
                  <AccountForm compact onCreated={(id) => { setAccountId(id); setAddAcct(false); }} />
                </DialogContent>
              </Dialog>
              {methodNote && <p className="text-xs text-muted-foreground">via {instrumentLabel(methodNote)}</p>}
            </div>
            {isMove(txnType) && (
              <div className="receipt-row">
                <Label>{txnType === "card_payment" ? "Card being paid" : txnType === "loan_repayment" ? "Loan being repaid" : txnType === "investment" ? "Invested into" : "To account"}</Label>
                <Select value={toAccountId} onValueChange={setToAccountId}>
                  <SelectTrigger aria-label="To account" className={fieldCls}><SelectValue>{toAccountId !== "none" && acctById.get(toAccountId) ? shortAccount(acctById.get(toAccountId)!.name, ACCOUNT_LABEL[acctById.get(toAccountId)!.kind]) : "Not set"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {liveAccounts.filter((a) => !MOVE_TARGET[txnType] || MOVE_TARGET[txnType]!.includes(a.kind)).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {ACCOUNT_LABEL[a.kind]}</SelectItem>)}
                  </SelectContent>
                </Select>
                {edit && toAccountId === "none" && <p className="text-xs text-muted-foreground">This looks like one side of a transfer whose other side is saved separately. Link both sides on <Link to="/transfers" className="font-semibold text-primary underline">Transfers</Link> so neither account is counted twice — don't fill this in here.</p>}
              </div>
            )}
          </div>
          {!liveAccounts.length && <p className="rounded-xl bg-secondary px-3 py-2 text-xs">An account is needed to keep balances accurate. <button type="button" onClick={() => setAddAcct(true)} className="font-semibold text-primary underline">Add account</button> — until then this entry is saved without changing any balance.</p>}
          {(txnType === "advance" || txnType === "advance_settlement") && (
            <div className="grid gap-1.5">
              <Label>Trip</Label>
              <Select value={tripId} onValueChange={setTripId}>
                <SelectTrigger aria-label="Trip" className={fieldCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a trip</SelectItem>
                  {(preferences.trips as TravelTrip[]).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.start ? ` · ${t.start}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {txnType === "loan_repayment" && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Principal / interest</Label>
                {(() => {
                  const loan = loans.find((l) => l.accountId === toAccountId && l.status === "active");
                  const amt = Number(amount) || 0;
                  if (!loan || !(amt > 0)) return null;
                  const s = emiSplit(loan.principal, loan.rate, amt);
                  return <button type="button" className="text-xs text-primary underline" onClick={() => { setPrincipal(String(s.principal)); setInterest(String(s.interest)); }}>Use {loan.name}'s split: {money(s.principal)} + {money(s.interest)}</button>;
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input aria-label="Principal part" type="number" min="0" step="0.01" placeholder="Principal" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
                <Input aria-label="Interest part" type="number" min="0" step="0.01" placeholder="Interest" value={interest} onChange={(e) => setInterest(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Optional. If you fill one, fill both — they must add up to the payment.</p>
            </div>
          )}
          {/* Workspace + date: same printed rows as the fields above */}
          <WorkspacePicker row scope={scope} setScope={setScope} total={Number(amount) || 0} currency={currency} split={wsSplit} setSplit={setWsSplit}
            suggestion={suggestWorkspace({ merchant, tags: tagList, tripType: ctxTrip?.type ?? null, category }, expenses)} />
          <div className="receipt-row">
            <Label htmlFor="d">Date{af("date")}</Label>
            <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 text-sm" />
            <div className="flex justify-end gap-1">
              <Button type="button" size="sm" variant={date === today ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs" onClick={() => setDate(today)}>Today</Button>
              <Button type="button" size="sm" variant={date === yesterday ? "default" : "outline"} className="h-8 rounded-full px-3 text-xs" onClick={() => setDate(yesterday)}>Yesterday</Button>
            </div>
          </div>

          {ctxTrip && <p className="text-xs text-primary">Adding to trip: {ctxTrip.name}{search.booking ? " — this payment will be linked to the booking" : ""}</p>}
          {!ctxTrip && !editing && smartTripSuggestions({ date, title, merchant, description, currency, originalAmount: Number(amount) || 0, scope, category, tags: tags.split(",").map((t) => t.trim()), tripId: tripId === "none" ? null : tripId, txnType }, preferences.trips as TravelTrip[]).slice(0, 3).map((suggestion) => (
            <div key={suggestion.trip.id} className="space-y-1 border-l-2 border-primary pl-3"><p className="text-xs text-muted-foreground">{suggestion.confidence}{suggestion.ambiguous ? " · Multiple possible trips" : ""} · {suggestion.reasons.join(" · ")}</p><Button type="button" size="sm" variant="outline" onClick={() => { setTags((x) => [...new Set([...x.split(",").map((y) => y.trim()).filter(Boolean), tripTag(suggestion.trip)])].join(", ")); setTripId(suggestion.trip.id); }}>Link to {suggestion.trip.name}</Button></div>
          ))}
          <div className="receipt-row"><Label htmlFor="t">Note{af("title")}</Label><Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional — e.g. Dinner with Ravi" className={fieldCls} /></div>

          {/* More details */}
          <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="receipt-rule flex items-center justify-between px-1 pt-3 text-sm font-semibold">
            <span>More details{(sections.business || sections.travel || sections.fx) && !more ? <span className="ml-2 text-xs font-normal text-muted-foreground">{[sections.business && "business", sections.travel && "travel", sections.fx && "exchange rate"].filter(Boolean).join(" · ")}</span> : null}</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
          </button>
          {more && (
            <div className="grid gap-4 border-t pt-3">
              <div className="grid gap-1.5"><Label htmlFor="m">Merchant{af("merchant")}</Label><Input id="m" list="merchant-list" value={merchant} onChange={(e) => setMerchant(e.target.value)} onBlur={() => rememberMerchant(merchant)} />
                <datalist id="merchant-list">{frequentMerchants(expenses).map((m) => <option key={m} value={m} />)}</datalist></div>
              {sections.tags && (
                <div className="grid gap-1.5">
                  <Label>Tags</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tagList.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => toggleTag(t)}><X className="h-3 w-3" /></button></span>)}
                    <Popover open={tagOpen} onOpenChange={setTagOpen}>
                      <PopoverTrigger asChild><Button type="button" size="sm" variant="outline" className="h-7 rounded-full px-2.5 text-xs"><Plus className="h-3 w-3" />Add tag</Button></PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search or type a new tag" value={tagQuery} onValueChange={setTagQuery} />
                          <CommandList>
                            <CommandEmpty>{tagQuery.trim() ? <button type="button" className="text-primary underline" onClick={() => { toggleTag(tagQuery.trim()); setTagQuery(""); }}>Add "{tagQuery.trim()}"</button> : "No tags yet."}</CommandEmpty>
                            {frequentTags.length > 0 && <CommandGroup heading="Frequently used">{frequentTags.map((v) => <CommandItem key={`f-${v}`} value={`frequent ${v}`} onSelect={() => toggleTag(v)}>{v}{tagList.includes(v) && <Check className="ml-auto h-4 w-4" />}</CommandItem>)}</CommandGroup>}
                            {tagGroups.map((g) => <CommandGroup key={g} heading={g}>{preferences.tags.filter((t) => (t.group || "Other") === g).map((t) => { const v = tagValue(t); return <CommandItem key={v} value={v} onSelect={() => toggleTag(v)}>{t.name}{tagList.includes(v) && <Check className="ml-auto h-4 w-4" />}</CommandItem>; })}</CommandGroup>)}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
                            {sections.people && (
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>For whom</Label>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input type="checkbox" checked={splitOn} className="accent-[var(--primary)]" onChange={(e) => { setSplitOn(e.target.checked); if (e.target.checked && !Object.keys(shares).length) setShares({ [memberId]: "" }); }} />
                      Split between people
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2" role={splitOn ? "group" : "radiogroup"} aria-label="For whom">
                    {people.map((m) => {
                      const on = splitOn ? m.id in shares : memberId === m.id;
                      return (
                        <button key={m.id} type="button" role={splitOn ? "checkbox" : "radio"} aria-checked={on}
                          onClick={() => { if (!splitOn) return setMemberId(m.id); setShares((x) => { const n = { ...x }; if (m.id in n) delete n[m.id]; else n[m.id] = ""; return n; }); }}
                          className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", on ? "border-gold bg-gold text-gold-foreground" : "bg-background hover:bg-secondary")}>
                          {m.name}
                        </button>
                      );
                    })}
                    <Link to="/family" className="rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground">+ Family</Link>
                  </div>
                  {splitOn && (
                    <div className="space-y-2 rounded-2xl border bg-secondary/40 p-3">
                      {Object.keys(shares).length === 0 && <p className="text-xs text-muted-foreground">Tap people above to add them.</p>}
                      {Object.entries(shares).map(([id, v]) => (
                        <div key={id} className="flex items-center gap-2">
                          <span className="flex-1 text-sm">{people.find((p) => p.id === id)?.name ?? "Family"}</span>
                          <span className="text-xs text-muted-foreground">{currency}</span>
                          <Input aria-label={`Share for ${people.find((p) => p.id === id)?.name}`} type="number" step="0.01" min="0" className="h-8 w-28 font-mono" value={v} onChange={(e) => setShares((x) => ({ ...x, [id]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className={cn("font-mono", Math.abs(splitLeft) > 0.009 ? "text-destructive" : "text-muted-foreground")}>{Math.abs(splitLeft) > 0.009 ? `${splitLeft > 0 ? "Left to assign" : "Over by"}: ${Math.abs(splitLeft).toFixed(2)}` : "Shares add up ✓"}</span>
                        <Button type="button" size="sm" variant="outline" disabled={!(Number(amount) > 0) || !Object.keys(shares).length}
                          onClick={() => setShares(Object.fromEntries(splitEvenly(Number(amount), Object.keys(shares)).map((x) => [x.memberId, String(x.amount)])))}>Split evenly</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Payment method <span className="font-normal text-muted-foreground">(optional detail)</span></Label>
                <Select value={instrumentId} onValueChange={(v) => v === "none" ? setInstrumentId("none") : pickInstrument(v)}>
                  <SelectTrigger aria-label="Saved payment method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{savedMethods.length ? "Choose a saved UPI ID or card" : "No saved methods yet"}</SelectItem>
                    {savedMethods.map((p) => <SelectItem key={p.id} value={p.id}>{instrumentLabel(p)} · {accounts.find((a) => a.id === p.accountId)?.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment method">
                  {PAYMENT_METHODS.map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={paymentMethod === p} onClick={() => { setPaymentMethod(p); setInstrumentId("none"); }}
                      className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", paymentMethod === p ? "border-gold bg-gold text-gold-foreground" : "bg-background hover:bg-secondary")}>{PAYMENT_LABEL[p]}</button>
                  ))}
                </div>
                <Link to="/payment-methods" className="text-xs font-semibold text-gold-strong underline-offset-2 hover:underline">Manage UPI IDs & cards</Link>
              </div>
              {sections.fx && fx && "rate" in fx && <p className="rounded-xl bg-secondary px-3 py-2 text-xs">Exchange rate: 1 {currency} = {fx.rate.toFixed(4)} INR (rate of {fx.date}) · {converted != null ? money(converted) : "—"} recorded. The original {currency} amount is kept too.</p>}
              <div className="grid gap-1.5"><Label htmlFor="desc">{sections.business ? "Business purpose" : "Description"}{af("description")}</Label><Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
            </div>
          )}
        </fieldset>

        <div className="receipt-desk sticky bottom-0 z-10 -mx-4 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:mx-0 sm:px-0">
          {saveError && !saving && <div role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-card px-3 py-2 text-xs"><span className="text-destructive">{saveError}</span><Button type="submit" size="sm" variant="outline">Retry</Button></div>}
          <Button type="submit" size="lg" variant="gold" loading={saving} loadingText={editing ? "Saving changes…" : `Saving your ${TXN_LABEL[txnType].toLowerCase()}…`} className="h-12 w-full rounded-full text-base font-semibold" disabled={reading || saving || !confirmed || duplicateBlocked || matchBlocked || receiptBlocked || !(Number(amount) > 0)}>
            {editing ? "Save changes" : `Save ${TXN_LABEL[txnType].toLowerCase()}`}<ArrowRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
