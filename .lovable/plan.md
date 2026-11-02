# Save calendar titles and notes for future exports

Today, titles and notes you edit in the "Add to calendar" pop-up only apply to that one download. This change lets you keep them so every later export uses them automatically.

## What you will see
- In the calendar pop-up, each event keeps its editable title and note, and a "Save for future exports" option is on by default.
- Choosing Download saves your changes to that plan or booking check-in, then downloads the file.
- Next time you open the pop-up, your saved title and note are already filled in.
- A "Reset to default" link on each event clears your saved wording and returns to the automatic title (for example "Check-in: Hotel · Taj #123") and the plan's own note.
- Saved calendar wording is separate from the plan's own title and note, so changing it never renames the plan or booking in the app.
- If you later change a plan's time or a check-in time, the saved title/note stays and the new time appears in the next export.
- Deleting a plan or booking removes its saved calendar wording too.

## Technical details
- Add optional `calendarTitle?` and `calendarNote?` to `ItineraryItem` and `Booking` in `src/lib/travel.ts` (stored within the trip in owner preferences, as today; no database change).
- `calendarEvents()` in `src/lib/trip-itinerary.ts` uses the saved fields when present, falling back to the generated title and `note`; expose the default too so the dialog can reset.
- New pure helper `applyCalendarEdits(trip, edits)` returns an updated trip, writing a field only when it differs from the default and clearing it when it matches (keeps data clean).
- `TripSections.tsx` dialog: prefill from saved values, add the save toggle and per-event reset, persist through the existing trip update path before downloading.
- Tests: saved title/note appear in the .ics; reset/matching-default clears saved fields; saved wording survives a time change; plan's own title is unchanged.
