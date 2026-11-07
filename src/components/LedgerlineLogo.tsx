// Official Ledgerline brand artwork — the single source every page uses.
// Colours come from --brand-ink / --brand-teal so dark mode only changes colour, never geometry.
const ink = "var(--brand-ink)";
const teal = "var(--brand-teal)";

function SymbolShapes() {
  return <>
    <rect x="0" y="0" width="30" height="116" rx="6" fill={ink} />
    <rect x="24" y="0" width="6" height="116" fill={ink} />
    <path d="M42 0h64a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H42z" fill={teal} />
    <path d="M42 44h58a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H42z" fill={teal} />
    <path d="M42 86h80a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H42z" fill={teal} />
  </>;
}

export function LedgerlineSymbol({ className = "h-7 w-auto", title = "Ledgerline" }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 128 116" className={className} role="img" aria-label={title}><SymbolShapes /></svg>;
}

export function LedgerlineLogo({ className = "h-8 w-auto", title = "Ledgerline" }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 620 116" className={className} role="img" aria-label={title}>
    <SymbolShapes />
    <text x="156" y="94" fontFamily="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" fontSize="92" fontWeight="500" textLength="460" lengthAdjust="spacingAndGlyphs" fill={ink}>LEDGERLINE</text>
  </svg>;
}

/** Full logo where there is room, symbol alone on narrow phones. */
export function LedgerlineBrand({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-center ${className}`}>
    <LedgerlineSymbol className="h-7 w-auto sm:hidden" />
    <LedgerlineLogo className="hidden h-7 w-auto sm:block" />
  </span>;
}
