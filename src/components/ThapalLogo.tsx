// Folded ledger: shared vector geometry across interface and exported icons.
const ink = "var(--brand-ink)";
const gold = "var(--brand-accent)";

function SymbolShapes() {
  return <>
    <path d="M18 26 42 12v69c0 5 3 8 8 8h64l-20 20H34c-10 0-16-6-16-16Z" fill={ink} />
    <path d="M52 19 78 4v65L52 84Z" fill={ink} />
    <path d="M82 76h26a4 4 0 0 1 0 8H68Z" fill={gold} />
  </>;
}

export function ThapalSymbol({ className = "h-7 w-auto", title = "Thapal" }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 128 116" className={className} role="img" aria-label={title}><SymbolShapes /></svg>;
}

export function ThapalLogo({ className = "h-8 w-auto", title = "Thapal" }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 440 116" className={className} role="img" aria-label={title}>
    <SymbolShapes />
    <text x="148" y="90" fontFamily="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif" fontSize="91" fontWeight="500" textLength="280" lengthAdjust="spacingAndGlyphs" fill={ink}>Thapal</text>
  </svg>;
}

/** Full logo where there is room, symbol alone on narrow phones. */
export function ThapalBrand({ className = "" }: { className?: string }) {
  return <span className={`inline-flex items-center ${className}`}>
    <ThapalSymbol className="h-7 w-auto sm:hidden" />
    <ThapalLogo className="hidden h-7 w-auto sm:block" />
  </span>;
}
