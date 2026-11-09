# Open conflicts C11, C13 and C14: exact text, options and consequences (for KK's decision)

**Status:** none of these is decided. The code keeps today's behaviour for each until KK chooses. Claude's recommendation is labelled as such, and **is not applied**.

---

## C11: one "Apply everything" tap vs Decision 4

**V4 text (Decision 4, agreed):** "Should anything post without confirmation? — Not until accuracy is proven. Then the graduated autopilot in the automation policy, with a bar of 99.5% on amounts and dates and 97% on category over 200 real rows per issuer."

**What the app does today:**
- Statement Desk shows one button, `Apply everything (N to save)`, in `src/routes/_authenticated/statements.tsx:710`.
- N counts:
  - the rows the app classified automatically (`plan.totals.auto`), and
  - the rows the person accepted one by one.
- One tap saves all N.
- The person has seen the batch summary but has not confirmed each automatically classified row.

**The conflict:** it is unclear whether one confirmation of a whole batch counts as "confirmation" under Decision 4 until the accuracy bar has been proven for that issuer.

| Option | What it means | Consequences |
|---|---|---|
| **A. A batch confirmation is enough** (keep today) | One informed tap confirms every row shown in the batch | Fastest workflow; no change. An unnoticed misclassified row can be saved, though it stays reversible from History. Decision 4 is read as "no posting without *a* human confirmation". |
| **B. Confirm row by row until the issuer earns the bar** | Automatically classified rows from issuers below the 99.5% / 97% / 200-row bar must be ticked individually, or reviewed in groups by category. "Apply everything" covers only rows that the person accepted or that came from issuers that have earned autopilot. | Literal reading of Decision 4; more taps for new issuers. Needs per-issuer accuracy tracking, which is partly built. |
| **C. Batch confirmation with mandatory review of uncertain rows** | Rows below a confidence threshold, or with a new merchant, category or amount pattern, must be opened before the batch button is enabled. The rest can be applied together. | A middle ground; moderate work. Accuracy still is not "proven" in Decision 4's sense, so this is a policy interpretation for KK to accept. |

**Claude's recommendation (not applied):**
- Recommended: **C now**, moving to **B's graduated autopilot** per issuer as each issuer reaches the bar.
- Why: it keeps the workflow usable while making sure uncertain rows always get human attention.

---

## C13: audit history after the owner erases their data (DPDP)

**V4 texts:**
- **FND-05:** "Protect source-preserving delete, restore, reverse, reopen, prior-period adjustment and audit history."
- **REQ-SEC-030:** an append-only event log.
- **REQ-SEC-058:** "The audit log is append-only."
- **REQ-SEC-035:** "Rights screens to see, correct, export and request erasure of data, with the legal retention that blocks erasure explained."

**What the app does today:**
- Clients cannot edit or delete audit tables (Phase 1 P4).
- However, the owner's explicit **Delete my data** (`delete_my_finance_data`, now step-up guarded) also deletes that owner's audit rows: `transaction_audit` and related tables.

**The conflict:** an append-only, retained audit trail against the right to erasure. Indian law may require some books and records to be kept, for example under the Companies Act and the Income-tax Act. That obligation would override erasure for those records. This needs legal confirmation, which Claude cannot give.

| Option | What it means | Consequences |
|---|---|---|
| **A. Full erasure** (keep today) | Everything goes, including audit rows | Simplest privacy answer. Loses evidence that may be legally required for company or tax records. Contradicts "audit append-only" for owner-initiated erasure. |
| **B. Retain a minimal audit skeleton** | Keep event type, time, record id, entity and amount totals, with no names, descriptions, files or free text, for a fixed period (for example 8 years for company books; the period is KK's or legal's choice). Personal details are erased. | Meets audit and legal retention while honouring erasure for personal data. Needs a retention schedule, a "blocked by legal retention" explanation on the rights screen (REQ-SEC-035), and a purge job when the period ends. |
| **C. Split by owner type** | Personal-only owners get full erasure (A). Company and legal-entity books keep the minimal skeleton (B) for the statutory period. | Most precise. Depends on Phase 2 legal-entity separation knowing which records belong to companies. |

**Claude's recommendation (not applied):**
- Recommended: **C**, with the retention period confirmed by KK's CA or lawyer.
- Phase 2 builds the entity separation that makes C possible.
- Until KK decides, erasure behaviour is unchanged.

---

## C14: moving to thapal.in, and passkeys

**V4 text (Decision 50, agreed):** "Keep ledgerline.biz live and untouched; build and preview on thapal.in; after the release gate and your approval, switch users over and leave ledgerline.biz as a permanent redirect." The DNS change needs KK's separate authorisation (REQ-UIX-078).

**What the app does today:**
- Passkeys are bound to the relying-party domain `ledgerline.biz` (`src/lib/passkey-origin.ts`; tests in `passkey-origin.test.ts`).
- Email sending also uses `ledgerline.biz`.
- No thapal.in environment exists.

**The conflict:** a passkey created for `ledgerline.biz` **cannot** be used on `thapal.in`. WebAuthn binds every credential to its domain. Switching domains therefore breaks Face ID sign-in and unlock for every existing passkey until people register again.

| Option | What it means | Consequences |
|---|---|---|
| **A. Re-register at switch-over** | After moving to thapal.in, each person signs in (Google, password or email code), passes the fresh strong authentication now required (KK decision 2), and adds a new passkey. Old passkeys are retired with an audit record. | Simple and secure. One-time effort for every user. Needs clear in-app guidance and the PIN never helping. |
| **B. Related origins** (WebAuthn "related origin requests") | thapal.in publishes `/.well-known/webauthn` listing ledgerline.biz, so existing credentials keep working across both domains. | No re-registration where browsers support it. Support on iOS Safari must be verified on real devices, and it needs both domains served correctly. Falls back to A where unsupported. |
| **C. Stay on ledgerline.biz for authentication** | thapal.in redirects sign-in to ledgerline.biz | Avoids re-registration. Contradicts Decision 50's "permanent redirect" end state and keeps the old brand in the sign-in flow. |

**Claude's recommendation (not applied):**
- Recommended: **A**, with B tested on real iPhone and iPad as an optional improvement.
- Also needed from KK: **the date a thapal.in preview environment will exist**. Nothing is changed until then.

---

## What Claude needs from KK
For each of C11, C13 and C14:
- choose A, B or C, or give another instruction;
- for C13, the retention period;
- for C14, the thapal.in timing.

**Decided by KK on 10 Nov 2026:** C11 Option B, C13 Option B with safeguards (production policy needs legal and accounting validation), C14 Option A. See the decision register.
