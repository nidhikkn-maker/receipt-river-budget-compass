# What's left: 8 items

## Can be built now (2)
1. **AI debt what-if answers** — e.g. "If I pay ₹5,000 extra on my loan, when is it closed and how much interest do I save?" Numbers come from tested calculations; the assistant only explains them, clearly labelled as hypothetical. Plus checks against the sample questions in your document.
2. **Handover notes** — how the app is built, data and security, what's tested, integration options and expected running costs.

(Vault scanning/auto-fill is already done — the old roadmap line will be ticked.)

## Needs publishing + your iPhone (4)
3. Face ID / passkey unlock on a real phone
4. Opening the installed app offline
5. Real payment reminder notifications
6. Passkeys on a stable web address

## Needs a native app or bank partner (2)
7. Siri, widgets, share-sheet file intake
8. Live bank connections

Yaba stays excluded.

## Technical details
- Add loan prepayment/extra-payment simulation to `src/lib/planning.ts` with tests; expose results via `src/lib/position.ts` to `assistant.functions.ts`.
- Write `HANDOVER.md` at project root; tick vault item in `roadmap.md`.
