# Ledgerline — folded ledger identity
Two open pages form an L. The gold registration line is a quiet accent, not a status indicator. The primary name is title-case Ledgerline. This hand-authored vector refines the page concept; generated concepts are exploration, not final app icons.

## Assets and source
`src/components/LedgerlineLogo.tsx` is the semantic-token interface version. `scripts/brand/build_icons.py` reproduces transparent light/dark/monochrome SVG logos and symbols in `public/brand`, plus the square app icon, favicon, touch icon and existing launch screens. SVG logo text remains live text (not outlined lettering); system font fallback can vary slightly.

## Use
- Keep at least one-quarter symbol width clear around it. Never stretch, rotate or add effects.
- Compact symbol at 16/24/32px; full logo when the name can be read comfortably.
- Light: graphite/navy with champagne. Dark: ivory with champagne. Mono for constrained rendering. Use semantic brand tokens in interface code.
- Interface system font, 14–17px body, 500 labels, 600 amounts/headings; editorial titles only sparingly.
- Shared 44px targets, visible focus ring, restrained primary/outline buttons, 150–200ms feedback; honour reduced motion and high contrast.
- KK is a separate muted creator attribution on sign-in only. No trademark registration claims.

## Safety and scope
AuthFrame changes layout only. Existing Google/Lovable, email, remembered-device unlock and demo actions remain; no provider or permission settings are changed. Auth screens show no financial records. Full all-route UIX acceptance remains open.
