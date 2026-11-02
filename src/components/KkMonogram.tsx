/** Decorative interlocked serif "KK" monogram; colour comes from currentColor. */
export function KkMonogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="100" r="84" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <text x="78" y="128" textAnchor="middle" fill="currentColor" fontFamily="'Cormorant Garamond', 'Didot', 'Bodoni 72', Georgia, serif" fontSize="96" fontStyle="italic" fontWeight="500">K</text>
      <text x="122" y="128" textAnchor="middle" fill="none" stroke="currentColor" strokeWidth="2" fontFamily="'Cormorant Garamond', 'Didot', 'Bodoni 72', Georgia, serif" fontSize="96" fontStyle="italic" fontWeight="500">K</text>
    </svg>
  );
}
