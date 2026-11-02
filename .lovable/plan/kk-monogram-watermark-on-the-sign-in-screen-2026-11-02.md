# KK monogram watermark on the sign-in screen

## What you'll see
- An elegant interlocked serif "KK" monogram in your gold, sitting behind the sign-in card on the sign-in page.
- Subtle but noticeable: soft enough that the sign-in form, Face ID button and text stay easy to read.
- Looks right on iPhone, iPad and desktop, and in every theme including dark mode.
- Nothing else in the app changes. No records, PDFs or other pages are touched.

## Technical details
- Draw the monogram as an inline SVG component (`src/components/KkMonogram.tsx`) so it's sharp at any size; no image file needed.
- Colour from the existing gold/accent token (`currentColor` + `text-accent`/primary token), opacity around 0.10–0.14 (lighter in dark themes).
- Place it in `src/routes/auth.tsx` as an absolutely positioned, `pointer-events-none`, `aria-hidden` layer behind the card, centred, sized with `min(80vw, 520px)`.
- Verify with screenshots at 402px, 820px and 1280px, light and dark. Preview only; publish only when you say so.
