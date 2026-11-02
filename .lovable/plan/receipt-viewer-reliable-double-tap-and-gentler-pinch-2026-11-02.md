# Receipt viewer: reliable double-tap and gentler pinch

## What changes
1. **Double-tap works on iPhone Safari**: the viewer detects two quick taps itself (two taps within about 300 ms, close together, without moving), instead of relying on the browser's double-click. Double-tap zooms in to 2.5× at the tapped spot, or back out to fit if already zoomed, with the same smooth animation.
2. **Gentler pinch**: zoom follows finger spread more softly (about 60% of the raw spread change), so a quick pinch no longer jumps straight to maximum. Maximum zoom is still 6×, and you can still drag to move around and the receipt stays inside its frame.

Applies to both photo and PDF receipts in the side-by-side viewer on the new expense screen.

## Technical details
- `src/components/ReceiptZoomViewer.tsx`: remove `onDoubleClick`; in `onUp`, record single-pointer taps (tracking time, position and movement under 10 px) and trigger `zoomAt(..., true)` on the second tap. Pinch: `z = startZ * (dist/startDist) ** 0.6`.
- Update the mobile touch check in `scripts/browser/test_expense_receipts.py` with a PDF touch pinch (confirming it zooms in but stays below the maximum on a small spread) and a touch double-tap zooming in and out.
