# V5.2 re-upload review — 1 November 2026

The new upload is byte-identical to the saved V5.2 specification. Existing trip-centred screens and home shortcuts were retained rather than rebuilt. This report is not a declaration that all 23 acceptance demonstrations pass.

## This update: Pass
- Before: one workspace at a time; organisation/destination only through free-text search; no dedicated traveller/date controls.
- After: compact Filters sheet with multiple workspaces, travellers, organisations and destinations; searchable choices and inclusive date overlap. Different fields intersect; selections within one field combine. Mixed trips can match saved primary workspace/budget workspaces.
- No trip, expense, booking, attachment or preference writes; filters are temporary view state. No publication.
- Four pure tests prove combinations, mixed workspace matching, dates, destinations and unchanged input records.
- Signed-in browser checked selection of Personal and Business, search, date entry, clear and desktop/402×725 layout; no horizontal page overflow or page errors. Real-phone acceptance remains unverified.
- Full regression: 81 files, 679 tests passed. Latest observed build OK.

## Existing implementation: source-confirmed, not re-certified
- Dedicated trip pages and separate bookings/itinerary/expenses/budget/report sections.
- Homepage grouped shortcut selection, drag/drop, arrow alternatives, six primary shortcuts and saved ordering.
- Explicit trip Save draft; private document-to-booking review; booking/expense links; trip expense bulk review; report links and controlled closure.
- Previous browser evidence is recorded in roadmap.md. This pass did not save or modify these flows against live data.

## Remaining gaps: Not Implemented / Partial
- Itinerary still takes comma-separated participant names rather than searchable multiple selection.
- Itinerary copy/move actions, maps links and conservative timing warnings are absent.
- Trip draft is explicit-save only, on a fixed device key; owner-bound automatic recovery is not established.
- Trip creation does not yet require destination, and opening-focus prevention is absent from the dialog.
- Several older phase checkboxes are stale; they must not be interpreted as either proof of absence or completed acceptance.
- Full before/after comparison to the old long travel page cannot be reproduced from current source; this update compares only the observed existing filters to the new controls.

## Separate blockers retained
- Isolated restore/recovery/job and permission acceptance still needs an isolated cloud environment.
- Actual-iPhone, installed-offline, provider/live-worker checks are unverified.
- Email intake remains excluded by the user's instruction.
- V5.4 residual library warnings remain separate; this travel update does not resolve or accept them.