# Use your KK logo in the sign-in page corner

## What changes
- Remove the current centred gold "KK" watermark from behind the sign-in form.
- Place your uploaded KK logo in the bottom-right corner of the sign-in page, small and faint like a watermark (about 72px on phones, 110px on larger screens).
- It stays behind everything, can't be tapped, and won't cover the buttons or text.
- The black logo is tinted to match each theme (gold on the deep-blue look, light in dark mode), so it never appears as a black block.

## Technical details
- Upload the image with lovable-assets to `src/assets/kk-logo.png.asset.json`.
- Render it in `src/routes/auth.tsx` as a fixed `bottom-4 right-4 pointer-events-none` element using CSS `mask-image` with `bg-accent` so the colour follows theme tokens; low opacity.
- Delete `src/components/KkMonogram.tsx` and its import.
- Verify with screenshots at phone and desktop sizes, light and dark.
