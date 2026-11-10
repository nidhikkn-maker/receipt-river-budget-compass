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

/*
 * Signature Flow identity slots (Track B, batch B1). Option 02 — a single-stroke capital T with a clean
 * sans-serif "Thapal" wordmark — is approved as a direction, but the final vector artwork has not been
 * supplied. Until it is, the mark below is a PLACEHOLDER: a plain T set in the wordmark font. Replace the
 * contents of ThapalTMark with the delivered SVG outlines; do not treat this glyph as final artwork.
 */
export const T_MARK_IS_PLACEHOLDER = true;

/** Placeholder T mark slot (final Option 02 artwork pending). */
export function ThapalTMark({ className = "" }: { className?: string }) {
  return (
    <span className={`sf-tmark ${className}`} role="img" aria-label="Thapal" title="Placeholder T mark — final artwork pending" data-artwork={T_MARK_IS_PLACEHOLDER ? "placeholder" : "final"}>
      <span aria-hidden>T</span>
    </span>
  );
}

/** Text wordmark: always "Thapal" — capital T, no full stop. */
export function ThapalWordmark({ className = "" }: { className?: string }) {
  return <span className={`sf-wordmark ${className}`}>Thapal</span>;
}
