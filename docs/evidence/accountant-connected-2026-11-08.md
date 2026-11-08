# Corporate Accounting Milestone 1 — connected accountant batch

## Implemented
- Opening review reuses saved Statement Desk financial-year readings; unique company bank/cash/investment/loan accounts map automatically. Fixed assets, receivables, payables and equity retain printed signed targets. Missing capital, ambiguous money accounts and unknown tax/other direction refuse automatic preparation; no balancing plug.
- Actual existing non-mocked reader read a synthetic trial balance: bank100000, machinery50000, receivables10000, loan20000, payables5000, equity135000. Original reading/page quotes retained in `scripts/browser/fixtures/accounting-opening-real-read.json`. No reader/model changes.
- Payable/receivable settlements link an existing company INR payment/receipt, reverse its exact income/expense classification and reduce the accrued balance. No second bank movement. Partial balances, duplicate bank IDs, overpayments, cross-company input, changed snapshots and invented classification are refused.
- Staged SQL locks settlement source entries and originals; exact settlement reversals must precede accrual correction. Same request retries retain immutable accounting evidence. Already-committed readback precedes current-period validation, so a subsequent closure does not strand a committed retry.
- Existing Reports Centre includes accountant review/grant/revoke screens, journal legs, source IDs, reversals, bank links and append-only observations. Accountants see only RLS-visible journal evidence and cannot post. Grant selection currently requires a verified account UUID; no email identity discovery is claimed.
- Audit close previews refuse unresolved company-source/statement differences and retain full corporate workings in the existing version-1 figure envelope. No production close was executed.

## Acceptance evidence
- 30 distinct focused tests passed across accounting-settlement4, authority1, foundation7, corporate-statements8, audit-pack2, period-figures8. Later reruns only covered modified paths, not added to the count.
- Disposable disk database: non-mocked extracted-source opening → lost acknowledgement/readback → restart/retry → unpaid expense/outstanding income → exact reversal/correction → partial500 settlement → same-ID replay/duplicate denial → source edit denial/classification forgery denial → settlement reversal/replacement → closed-period frozen workings/restart/retry and new journal denial.
- Concrete statements after corrected1000 rent/3000 income/500 payment: profit2000, cash99500, cash operating−500, liabilities25500; trial and balance differences0. Receivable receipt1000 retains accrued revenue3000 and remaining receivable2000; cash once.
- Actual Reports Centre: retained real reader output → extracted opening review/save/reload → rent1200 accrual → existing500 bank payment → interrupted committed reply → encrypted draft reload/same-ID retry → outstanding700 → grant/revoke controls. `scripts/browser/test_accounting_connected.py`; screenshot `/tmp/browser/accounting-connected/review.png`; zero page errors. Browser storage/auth/posting adapters are isolated, NOT hosted.
- Existing journal/report path rechecked because its screen/store changed: actual encrypted draft recovery and real frozen PDF/download pass, one upload/history.
- Preview build OK08:01:29UTC. Initial type mismatches fixed. Browser fixture numeric replacement created `00`, corrected; exact outstanding selector corrected from700 to700.00. No unresolved executed test failures.

## Git evidence
- Initial checkout and available `origin/main`: `1821d27434fa3691dab5cf90583d90f035d1bed3`; five commits after `bc9d45ee56c376ed6634cbe1a7a7d4ff0ea7d082`.
- Those five:084e3cc0 browser acceptance script;ec9151db evidence/checkpoint docs;297f5c55 register;867f2bff generated requirements;1821d274 empty immediate diff. Combined eight files,77 additions/5 deletions; no accounting-engine difference. This explains why the earlier tested foundation was present although main was five commits ahead.
- Final financial test revision:`f59fbde3821e77a92497e81f1fbfe04e13def2da`, branch:`edit/edt-5441e69c-84e7-4c44-bcb6-58f2026333b0`. New batch changes are ahead of available main; later documentation commits do not redefine this tested financial revision.
- GitHub parity remains UNVERIFIED: exposed remotes are internal Lovable storage/bundle services, not a directly inspectable GitHub remote/provider sync status. Available origin/main equivalence is not proof of current GitHub main.
- Financial source SHA256: settlement `fc00f8ca00b9329063b1071d802622d3f05b4aa941084928d2471ca46a36527a`; opening `9d346c5afa8e84102c8610013d890067e9dfe798adb673eb908220a8946b588a`; corporate `496b1530429d19ba9c7866c05e94d475b3c757099fea4d724d237225f401dc38`; staged SQL `99ba9ceb012a3b924970d47d1096736ec7a273372567380fa7b573b34d3e4c3a`.

## Exact remaining gaps / status
- V60-0013/0026 remain PARTIAL; no IDs newly verified. Aggregate extracted openings are not complete per-account debit/credit ledger/supporting-schedule automation; totals-only documents lack detailed identity/direction/conflict acceptance.
- Recurring accrual/prepayment recognition schedules; multi-invoice/FX/overpayment settlement splitting; safe corrected replacement selection after settlement reversal remain incomplete.
- Accountant UI exists, but email-to-verified-account discovery, encrypted interrupted-note drafts and actual separate-account sign-in/document retrieval acceptance remain incomplete. Notes never resolve financial differences by themselves.
- Full one-file chooser/upload interruption → actual extraction → reviewed canonical posting → bank statement reconciliation → regenerated reports → close browser journey is NOT verified; service reading, browser review/recovery and disk close are connected evidence layers, not one hosted journey.
- Corporate statutory chart/Schedule III and complete tax mappings remain incomplete.
- Production atomic authority remains staged/uninstalled: explicit compatible deployment/access approval required before installation. Hosted journal/storage/cross-device/access/revocation/expiry checks require a backend isolated from real records. V60-0066/0082 remain BLOCKED. V60-0058/0716 unchanged.
- All UIX redesign, production migrations/policies, real financial records and publication holds preserved.

## Credits
Measured workspace893.75→882.89, decline10.86; recorded usage2880.233152354→2891.087722354, growth10.85457. Workspace-wide measurement, not exclusive task attribution; later chat/tool charges excluded. No credit purchase.